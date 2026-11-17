"""LLM-as-judge: the prompt, the verdict format and the pass rule. Domain-agnostic.

The target supplies the model (Target.judge: prompt -> raw JSON text, temperature 0) and the text of the
cited sections (Target.contexts); this module decides what is asked and how the answer is graded.
Criteria, each with a short reason:
  faithfulness 1-5  every claim is supported by the context or the conversation (None when there is neither)
  relevance    1-5  the answer addresses the question (a correct refusal counts as relevant)
  facts        pass the answer conveys every expected fact, worded any way (None without expected facts)
               + context_recall: share of expected facts stated in the cited context. Diagnostic, not in the
               pass rule: a fact missing from the answer AND the context is a retrieval miss, one in the context
               but not the answer is a generation miss.
  refusal      pass the answer refuses / says nothing matches exactly when the sample expects it to
"""

from __future__ import annotations

import json
import re

from evals.kit.target import Answer, TargetUnavailable

# Bump when the prompt or the pass rule changes: it is part of the judge cache key on the target side
JUDGE_VERSION = "3"  # 3: facts carry in_context (context recall)
PASS_SCORE = 4  # faithfulness / relevance scores at or above this pass

PROMPT = """You grade one answer of a retrieval-augmented assistant for a learning-roadmap website.
The conversation is usually in Vietnamese; grade meaning, not wording or language.

Question: {question}

Earlier conversation (oldest first):
{history}

Retrieved context the answer was grounded on:
{contexts}

Answer to grade:
{answer}

Expected facts (each must be conveyed, any wording): {facts}

Grade these criteria:
- faithfulness (1-5): are the answer's claims supported by the retrieved context or the earlier conversation?
  5 = all supported, 1 = mostly unsupported or contradicted. The assistant introducing itself, offering help or
  suggesting what to ask next needs no support. Use null when there is no context and no earlier conversation.
- relevance (1-5): does the answer address the question? A refusal or "nothing found" reply is relevant when the
  question really is outside the roadmap's content.
- facts: for each expected fact, in the order given, is it conveyed by the answer (covered), and is it stated in
  the retrieved context above (in_context; false when the context is "(none)")? Empty list when there are no
  expected facts.
- refused: does the answer decline, say the request is out of scope, or say no matching roadmap material exists?
  Saying the user has not shared a personal detail is not a refusal.

Reply with JSON only, no prose and no code fence:
{{"faithfulness": {{"score": <1-5 or null>, "reason": "<one sentence>"}},
 "relevance": {{"score": <1-5>, "reason": "<one sentence>"}},
 "facts": [{{"fact": "<expected fact>", "covered": <true|false>, "in_context": <true|false>}}],
 "refused": {{"value": <true|false>, "reason": "<one sentence>"}}}}"""


def expected_refusal(expected: dict) -> bool | None:
    """True for refuse / no-match samples (no section answers it), False for answer samples, None otherwise."""
    if expected.get("behavior") == "refuse" or expected.get("contexts") == []:
        return True
    if expected.get("behavior") == "answer":
        return False
    return None


def build_prompt(sample: dict, answer: Answer, contexts: list[str]) -> str:
    history = "\n".join(f"{turn['role']}: {turn['content']}" for turn in sample.get("history", []))
    return PROMPT.format(
        question=sample["input"],
        history=history or "(none)",
        contexts="\n\n".join(f"[{i}] {text}" for i, text in enumerate(contexts, 1)) or "(none)",
        answer=answer.text or "(empty)",
        facts=json.dumps(sample["expected"].get("facts", []), ensure_ascii=False),
    )


def parse(raw: str) -> dict:
    """The judge's JSON, tolerating a code fence or prose around it. Raises TargetUnavailable when unreadable:
    a broken judge reply says nothing about the system under test."""
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    try:
        verdict = json.loads(match.group(0) if match else raw)
    except json.JSONDecodeError as exc:
        raise TargetUnavailable("judge_invalid_json") from exc
    required = (("relevance", "score"), ("refused", "value"))
    if not isinstance(verdict, dict) or not all(isinstance(verdict.get(k), dict) and f in verdict[k] for k, f in required):
        raise TargetUnavailable("judge_invalid_json")
    # Scores must be numbers (faithfulness may be null): a null or "4" would crash the pass rule in grade()
    faithfulness = verdict.get("faithfulness") or {}
    if not _is_score(verdict["relevance"]["score"]) or not (
        isinstance(faithfulness, dict) and (faithfulness.get("score") is None or _is_score(faithfulness["score"]))
    ):
        raise TargetUnavailable("judge_invalid_json")
    # The prompt asks for a list (empty without expected facts); null or a bare string crashes grade()
    facts = verdict.get("facts", [])
    if not isinstance(facts, list) or not all(isinstance(item, dict) for item in facts):
        raise TargetUnavailable("judge_invalid_json")
    return verdict


def _is_score(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def grade(verdict: dict, sample: dict) -> dict:
    """Applies the pass rule to a parsed verdict. Criteria that do not apply to the sample are left out."""
    expected = sample["expected"]
    criteria: dict[str, dict] = {}
    faithfulness = verdict.get("faithfulness") or {}
    if faithfulness.get("score") is not None:
        criteria["faithfulness"] = {**faithfulness, "passed": faithfulness["score"] >= PASS_SCORE}
    relevance = verdict["relevance"]
    criteria["relevance"] = {**relevance, "passed": relevance["score"] >= PASS_SCORE}
    if expected.get("facts"):
        items = verdict.get("facts", [])
        by_text = {item.get("fact", "").casefold(): item for item in items}

        def judged(index: int, fact: str, field: str) -> bool:
            # The judge often rewords the fact it echoes back: its answer in the same position counts
            if fact.casefold() in by_text:
                return bool(by_text[fact.casefold()].get(field))
            return index < len(items) and bool(items[index].get(field))

        # A fact the judge left out counts as missing, and as not in the context
        facts = expected["facts"]
        missing = [fact for i, fact in enumerate(facts) if not judged(i, fact, "covered")]
        criteria["facts"] = {"passed": not missing, "missing": missing}
        # Only facts that should come from documents: a memory fact ("tôi tên gì") lives in the history, so its
        # absence from the context says nothing about retrieval
        if expected.get("contexts"):
            in_context = sum(judged(i, fact, "in_context") for i, fact in enumerate(facts))
            criteria["facts"]["context_recall"] = round(in_context / len(facts), 4)
    should_refuse = expected_refusal(expected)
    if should_refuse is not None:
        refused = bool(verdict["refused"]["value"])
        criteria["refusal"] = {"passed": refused == should_refuse, "refused": refused, "expected": should_refuse,
                               "reason": verdict["refused"].get("reason", "")}
    return {"passed": all(c["passed"] for c in criteria.values()), "criteria": criteria}


def evaluate(sample: dict, answer: Answer, target) -> dict:
    contexts = target.contexts(answer.citations)
    return grade(parse(target.judge(build_prompt(sample, answer, contexts))), sample)
