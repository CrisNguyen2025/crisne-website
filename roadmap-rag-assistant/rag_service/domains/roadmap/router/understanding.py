"""Query understanding — reads a message on two independent axes before any routing decision.

- Speech act: what the user is doing (asking, commanding, asking politely, greeting, recalling, planning).
- Target: what it is about (the roadmap, the assistant itself, something off-topic, nothing named).

Keeping them apart is what stops look-alike messages from crossing over: "cách thêm bài vào layer" and
"thêm bài Kafka vào layer Backend" share every keyword but differ in act; "có thể thao tác gì ở dự án này"
is a question about the assistant, not a roadmap command. The router (intent_router.py) maps act × target
to an intent; this module only reads the message and never decides.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Optional

from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
from rag_service.domains.roadmap.router.object_sense import names_another_place, strip_code
from rag_service.domains.roadmap.router.polarity import BLOCKER_OF, NONE as NO_POLARITY, polarity_of
from rag_service.domains.roadmap.router.policy import (  # cues and their vocabulary live in policy.py
    ADVICE,
    CATALOG_CONTAINER,
    CONTENT_ASK,
    COUNTING_CUE,
    HIERARCHY_CUE,
    KNOWN_CUE,
    LIST_SECTIONS,
    LIST_VERBS,
    POSITION_CUE,
    REVIEW_CUE,
    SEARCH_VERB,
    asks_next_lesson,
    DESCRIPTION_UPDATE,
    DESCRIPTION_UPDATE_FOLDED,
    VAGUE_CONTENT,
    VAGUE_CONTENT_FOLDED,
    ASK_FRAME,
    ASK_FRAME_FOLDED,
    MID_QUESTION_WORD,
    MID_QUESTION_WORD_FOLDED,
    NOT_A_QUESTION_BEFORE,
    PLAN_REQUEST,
    ABOUT_ASSISTANT,
    CAPABILITY_QUESTION,
    HELP_REQUEST,
    CONDITIONAL_REQUEST,
    CONVERSATION_RECALL,
    CREATE_ROADMAP,
    CUD_VERBS,
    END_QUESTION,
    END_QUESTION_FOLDED,
    END_YES_NO_FOLDED,
    END_YES_NO,
    EN_POLITE_REQUEST,
    ENTITY_PATTERNS,
    FALSE_OBJECT,
    GREETING_PREFIX,
    GREETING_WORDS,
    HOW_TO,
    HOW_TO_FOLDED,
    IDENTITY_STATEMENT,
    IMPERATIVE_START,
    LABEL,
    LEARNING_PLAN_GOAL,
    LEARNING_PLAN_NOUN,
    LEADING_FILLER,
    LEADING_GREETING,
    LIST_FILLER,
    LIST_TOPICS,
    NAMED_PART,
    OFF_TOPIC_HINTS,
    OFF_TOPIC_STRONG_HINTS,
    PLAN_PHRASES,
    PRAISE,
    QUESTION_MARKERS,
    QUESTION_MARKERS_FOLDED,
    REQUEST_CUE,
    REQUEST_CUE_FOLDED,
    SEARCH_WORDS,
    SELF_DISCLOSURE,
    SHOW_REQUEST,
    SUGGESTION,
    SYNTAX_QUESTION,
    SYNTAX_QUESTION_FOLDED,
    THANKS,
    TRAILING_FILLER,
    TRAILING_FILLER_FOLDED,
    SpeechAct,
    Target,
)


def is_plain_listing(text: str) -> bool:
    """A listing request and nothing else: no change verb, no question, no second clause."""
    lower = normalize_vietnamese(text).lower().strip()
    if not LIST_TOPICS.search(lower):
        return False
    rest = LIST_TOPICS.sub(" ", lower)
    rest = LIST_FILLER.sub(" ", rest).strip(" ?!.,")
    if re.search(r"[,;\n:]|\b(?:và|rồi|sau\s+đó|nhưng|không\s+phải|thì)\b", lower) or rest:
        return False
    return not understand(text).has_change_verb


@dataclass(frozen=True)
class Understanding:
    """What a message does (act) and what it is about (target), plus the cues both were read from."""

    act: SpeechAct
    target: Target
    lower: str                # normalized, lowercase
    flat: str                 # folded: no diacritics
    head: str                 # the command part, without a quoted or "tên là ..." name
    has_change_verb: bool
    how_to: bool              # a how-to question ("cách …", "làm sao …", "how do I …")
    show_request: bool        # "cho mình xem …", "show me …"
    has_object: bool          # names a roadmap object
    has_search_word: bool
    opens_with_greeting: bool # starts with a greeting or thanks word
    asks_usage: bool          # what the assistant can do, or how to make a change: answered with the help card
    write_blocker: Optional[str] = None  # names a change it does not ask for: negation | hypothetical | past_report
    vague_content: bool = False          # P8: the change's content is a vague noun ("tạo thông tin …")
    description_update: bool = False     # P8: asks to change a topic's description (not supported)
    advice: bool = False                 # asks which to choose ("lộ trình nào phù hợp", "nên học FE hay BE")
    polarity: str = "none"               # P2: affirm | decline | hypothetical | report | none (polarity.py)

    def summary(self) -> dict:
        """For the route step and the trace: the two axes and the cues behind them."""
        return {
            "act": self.act.value,
            "target": self.target.value,
            "usage": self.asks_usage,
            "change_verb": self.has_change_verb,
            "object": self.has_object,
            "search_word": self.has_search_word,
            "blocker": self.write_blocker,
            "polarity": self.polarity,
        }


def _has_any(patterns: list[str], flat: str) -> bool:
    return any(re.search(rf"\b{p}\b", flat) for p in patterns)


def _has_phrase(phrases: list[str], flat: str) -> bool:
    return any(re.search(rf"\b{re.escape(fold(p))}\b", flat) for p in phrases)


def _has_cue(phrases: list[str], lower: str, flat: str) -> bool:
    """_has_phrase, but a span the user wrote with tones must carry the cue's own tones.

    Folded, "thuốc" (medicine) is "kích thước" (size); a span typed without tones still matches.
    """
    for p in phrases:
        written_cue = normalize_vietnamese(p).lower()
        for m in re.finditer(rf"\b{re.escape(fold(p))}\b", flat):
            span = lower[m.start():m.end()] if len(lower) == len(flat) else ""
            if not span or span == fold(span) or span == written_cue:
                return True
    return False


def asks_mid_sentence(lower: str, flat: str, accented: bool) -> bool:
    """P1: a question word mid-sentence ("có playlist nào hay") or an asking / comparing frame ("cho mình hỏi về …")."""
    words, frame = (MID_QUESTION_WORD, ASK_FRAME) if accented else (MID_QUESTION_WORD_FOLDED, ASK_FRAME_FOLDED)
    text = lower if accented else flat
    if frame.search(text):
        return True
    return any(not NOT_A_QUESTION_BEFORE.search(text[:m.start()]) for m in words.finditer(text))


def is_question_text(lower: str, flat: str) -> bool:
    """A question anywhere in the text: "?", a search word, a question marker or a trailing "không / k / ko".

    Trailing "không / k / ko" counts only as a separate word ("có bài Docker k"), so "ok" or "check" do not.
    """
    return (
        _has_phrase(SEARCH_WORDS, flat) or "?" in lower or bool(re.search(r"\s(?:không|k|ko)$", lower))
        or bool(QUESTION_MARKERS.search(lower) or QUESTION_MARKERS_FOLDED.search(flat))
    )


def strip_noise(lower: str) -> str:
    """Drop what does not change the request: a leading greeting or filler ("Hi", "ê bạn ơi", "pls"), a short label
    ("Việc cần làm:", "Câu hỏi:") and trailing particles, thanks or emoji. Never returns an empty message."""
    accented = lower != fold(lower)
    s = lower
    for _ in range(3):  # they come in any order: "Hi\nViệc cần làm: …"
        before = s
        s = LEADING_FILLER.sub("", LEADING_GREETING.sub("", s, count=1), count=1)
        # P0: a label names what follows ("Câu hỏi: …"); a clause that asks ("đoạn này sai ở đâu: …") is kept
        label = LABEL.match(s)
        if label and not _has_any(ENTITY_PATTERNS, fold(label.group(1))) and not (
            "?" in label.group(1) or QUESTION_MARKERS.search(label.group(1)) or END_QUESTION.search(label.group(1))
        ):
            s = s[label.end():]
        s = s.strip()
        if s == before:
            break
    s = (TRAILING_FILLER if accented else TRAILING_FILLER_FOLDED).sub("", s).strip(" ,")
    return s or lower.strip()


def _resolve_understanding_target(
    lower: str,
    flat: str,
    after_greeting: str,
    has_object: bool,
    asks_usage: bool,
) -> Target:
    if _has_cue(OFF_TOPIC_STRONG_HINTS, lower, flat) or (not has_object and _has_cue(OFF_TOPIC_HINTS, lower, flat)):
        return Target.OFF_TOPIC
    if (
        (SUGGESTION.search(lower) and not re.search(r"\bvề\b", lower))
        or ABOUT_ASSISTANT.search(after_greeting)
        or asks_usage
    ):
        return Target.ASSISTANT
    return Target.ROADMAP if has_object else Target.NONE


def _resolve_understanding_act(
    *,
    raw: str,
    lower: str,
    flat: str,
    head: str,
    cue_head: str,
    after_greeting: str,
    accented: bool,
    end_question: re.Pattern[str],
    yes_no: re.Pattern[str],
    request_cue: re.Pattern[str],
    has_verb: bool,
    has_object: bool,
    has_search: bool,
    imperative: bool,
    capability: bool,
    write_blocker: Optional[str],
) -> SpeechAct:
    if imperative and has_object:
        ending = end_question.search(cue_head)
        if ending and fold(ending.group(0)).strip(" ?!.") == "nao":
            ending = re.search(r"\b(?:topic|layer|bai|nhom|muc|item|group)\s+nao\s*[?!.]*$", fold(cue_head))
        asks = "?" in head or bool(ending)
    else:
        asks = (
            is_question_text(lower, flat)
            or capability
            or (not accented and bool(END_QUESTION_FOLDED.search(flat)))
            or asks_mid_sentence(lower, flat, accented)
        )
    if write_blocker == "negation" and "?" not in lower and not has_search and yes_no.search(lower) is None:
        asks = False

    polite = has_verb and has_object and not has_search and (
        (yes_no.search(lower) is not None and request_cue.search(lower) is not None)
        or EN_POLITE_REQUEST.search(flat) is not None
    )
    conditional = has_verb and has_object and CONDITIONAL_REQUEST.search(flat) is not None
    learning_plan = PLAN_REQUEST.search(flat) is not None or (
        LEARNING_PLAN_GOAL.search(flat) is not None
        and LEARNING_PLAN_NOUN.search(flat) is not None
        and not CREATE_ROADMAP.search(flat)
    )
    thanks = THANKS.match(raw) is not None and "?" not in raw and not has_object and (
        not has_search or PRAISE.search(lower) is not None
    )

    if any(lower.startswith(p) for p in ["/plan", "/goal"]) or any(k in lower for k in PLAN_PHRASES) or learning_plan:
        return SpeechAct.PLAN
    if (CONVERSATION_RECALL.search(lower) and not (has_object and has_search)) or (
        not has_object and (IDENTITY_STATEMENT.match(raw) or SELF_DISCLOSURE.search(raw))
    ):
        return SpeechAct.RECALL
    if (after_greeting != raw and not after_greeting.strip(" ?!.,")) or thanks:
        return SpeechAct.GREETING
    if polite or conditional:
        return SpeechAct.REQUEST
    if asks:
        return SpeechAct.QUESTION
    if has_verb or imperative:
        return SpeechAct.COMMAND
    return SpeechAct.STATEMENT


def understand(text: str, known_place: Optional[Callable[[str], bool]] = None) -> Understanding:
    """Read the act and the target of a message. Sub-millisecond, no LLM.

    known_place: is this name a topic or layer of the roadmap? (the catalog, when the caller has it). Without it
    a place named without its noun ("layer trong fe") reads as another system.
    """
    raw = normalize_vietnamese(text).lower().strip()
    lower = strip_noise(raw)
    flat = fold(lower)
    # Folded cue twins only for a message typed without diacritics (policy.py: "đầu" must not read as "đâu")
    accented = lower != flat
    how_to, end_question = (HOW_TO, END_QUESTION) if accented else (HOW_TO_FOLDED, END_QUESTION_FOLDED)

    code_free = fold(strip_code(lower))
    has_verb = any(re.search(rf"\b{re.escape(v)}\b", code_free) for v in CUD_VERBS)
    has_object = _has_any(ENTITY_PATTERNS, strip_code(FALSE_OBJECT.sub(" ", fold(lower)))) and not names_another_place(lower, known_place)
    has_search = _has_phrase(SEARCH_WORDS, flat)
    imperative = bool(IMPERATIVE_START.search(flat))
    head = NAMED_PART.sub(" ", lower).strip()
    cue_head = head if accented else fold(head)
    after_greeting = GREETING_PREFIX.sub("", raw, count=1)

    capability = not has_verb and CAPABILITY_QUESTION.search(flat) is not None
    usage_how_to = (
        has_verb and has_object and how_to.search(cue_head if imperative else (lower if accented else flat)) is not None
        and (not imperative or end_question.search(cue_head) is not None)
    )
    syntax = (SYNTAX_QUESTION.search(lower) if accented else SYNTAX_QUESTION_FOLDED.search(flat)) is not None
    help_request = not has_verb and HELP_REQUEST.search(flat) is not None
    asks_usage = capability or usage_how_to or syntax or help_request
    polarity = polarity_of(lower).value if has_verb else NO_POLARITY
    write_blocker = BLOCKER_OF.get(polarity)

    target = _resolve_understanding_target(lower, flat, after_greeting, has_object, asks_usage)
    yes_no, request_cue = (END_YES_NO, REQUEST_CUE) if accented else (END_YES_NO_FOLDED, REQUEST_CUE_FOLDED)
    act = _resolve_understanding_act(
        raw=raw,
        lower=lower,
        flat=flat,
        head=head,
        cue_head=cue_head,
        after_greeting=after_greeting,
        accented=accented,
        end_question=end_question,
        yes_no=yes_no,
        request_cue=request_cue,
        has_verb=has_verb,
        has_object=has_object,
        has_search=has_search,
        imperative=imperative,
        capability=capability,
        write_blocker=write_blocker,
    )

    return Understanding(
        act=act,
        target=target,
        lower=lower,
        flat=flat,
        head=head,
        has_change_verb=has_verb,
        how_to=(HOW_TO.search(lower) if accented else HOW_TO_FOLDED.search(flat)) is not None,
        show_request=SHOW_REQUEST.search(lower) is not None and not has_verb,
        has_object=has_object,
        has_search_word=has_search,
        opens_with_greeting=any(re.search(rf"^\s*{re.escape(g)}\b", raw) for g in GREETING_WORDS),
        asks_usage=asks_usage,
        write_blocker=write_blocker,
        polarity=polarity,
        advice=ADVICE.search(flat) is not None,
        vague_content=has_verb and (VAGUE_CONTENT if accented else VAGUE_CONTENT_FOLDED).search(lower if accented else flat) is not None,
        description_update=has_verb and (DESCRIPTION_UPDATE if accented else DESCRIPTION_UPDATE_FOLDED).search(lower if accented else flat) is not None,
    )


def looks_like_question(text: str) -> bool:
    """True for "?" or a question marker; an entity title like this is the user's question, not a name."""
    lower = normalize_vietnamese(text).lower().strip()
    flat = fold(lower)
    return "?" in lower or bool(
        QUESTION_MARKERS.search(lower) or QUESTION_MARKERS_FOLDED.search(flat) or CAPABILITY_QUESTION.search(flat)
    )


def echoes_question(title: str, message: str) -> bool:
    """A question-like entity title that repeats most of the message: the extractor took the question as a name."""
    if not looks_like_question(title):
        return False
    words = fold(normalize_vietnamese(message).lower()).split()
    title_words = set(fold(normalize_vietnamese(title).lower()).split())
    return bool(words) and sum(w in title_words for w in words) / len(words) >= 0.8


# The entity word a change names, accented or folded ("topic", "bài học", "mục")
_ENTITY_WORD = re.compile(
    r"\b(?:topics?|chủ\s+đề|chu\s+de|lộ\s+trình|lo\s+trinh|roadmaps?|items?"
    r"|bài(?:\s+học)?|bai(?:\s+hoc)?|mục|muc|lessons?)\b",
    re.IGNORECASE,
)


def instruction_part(text: str) -> str:
    """The message without the names it carries: what is asked, not what is named.

    "tạo topic System Prompt Engineering" → "tạo topic"; "thêm bài 'x' vào layer 1" → "thêm bài  vào layer 1".
    For the sensitive guard: a lesson named "System Prompt Engineering" is not a request for the system prompt.
    """
    lower = normalize_vietnamese(text).lower().strip()
    # a greeting or filler first ("ê bạn ơi, tạo topic …") still leaves a command
    head = NAMED_PART.sub(" ", strip_noise(lower))
    if IMPERATIVE_START.search(fold(head)):
        match = _ENTITY_WORD.search(head)
        if match:
            rest = head[match.end():]
            # keep the routing words after the name ("vào layer 1"), drop the name itself
            tail = re.search(r"\b(?:vào|trong|sang|thành|into|to|under)\b.*$", rest)
            head = head[:match.end()] + (" " + tail.group(0) if tail else "")
    return re.sub(r"\s+", " ", head).strip()


# ── Cues that pick a KNOWLEDGE_QUERY sub-intent (read by intent_router._matches) ─────────────────────────────

def matches_lesson_status(u: Understanding) -> bool:
    """The Owner asks about their own lessons' status (ADR-0010 queries a, b, c). A change verb, a blocked change or
    a question about a lesson's content is not one: (d) changes run through parse_status_change_request."""
    if u.has_change_verb or u.write_blocker is not None or CONTENT_ASK.search(u.flat):
        return False
    return bool(asks_next_lesson(u.flat) or KNOWN_CUE.search(u.flat) or REVIEW_CUE.search(u.flat))


def matches_catalog_list(u: Understanding, text: str) -> bool:
    """A request to list topics, sections or the lessons of a container."""
    if u.has_change_verb:
        return False
    if is_plain_listing(text) or LIST_TOPICS.search(u.lower) or LIST_SECTIONS.search(u.flat):
        return True
    # "list all Kafka topics", "show me the list in Python": a container word of another system is not the roadmap's
    return bool(LIST_VERBS.search(u.flat) and CATALOG_CONTAINER.search(u.flat) and not FALSE_OBJECT.search(u.flat))


def matches_catalog_cue(u: Understanding) -> bool:
    """A question about the roadmap's structure: how many lessons, where a lesson is, what a topic holds."""
    if u.write_blocker is not None or SEARCH_VERB.search(u.flat):
        return False
    return bool(COUNTING_CUE.search(u.flat) or POSITION_CUE.search(u.flat) or HIERARCHY_CUE.search(u.flat))
