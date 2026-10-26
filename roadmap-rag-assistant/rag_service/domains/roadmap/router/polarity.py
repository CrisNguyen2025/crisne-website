"""P2, polarity: does the user want the change they name to happen?

A change verb says which change; polarity says whether it is asked for:

    affirm        "xóa bài Redis đi", "không phải sửa, xóa bài Redis đi"
    decline       "mình không định xóa bài Redis", "bỏ ý định xóa bài Redis", "khỏi tạo topic X"
    hypothetical  "nếu xóa bài Redis thì …"
    report        "hôm qua mình đã xóa bài Redis", "sếp bảo xóa bài X"
    none          no change verb

Decline is read structurally, not from listed phrases. A message is split into clauses (punctuation, "thì",
"nhưng", "mà"); inside a clause, a change verb after a negator is declined. Negators are Vietnamese's closed
class of negation words (không, chẳng, đừng, chưa, khỏi …) plus "drop the plan" frames (bỏ / hủy / dẹp + ý định /
vụ / việc). A verb before the negator stays affirmed ("xóa bài X không cần hỏi lại"), and "thì" ends the
condition a negator belongs to ("chưa có bài X thì thêm vào").

A verb only inside a condition ("trường hợp thêm bài X thì …") is hypothetical; a verb after a reporting verb
with a subject other than the user ("sếp bảo xóa …") is a report.

Only an affirmed change may be written: the write gate (P8) reads the verbs of the affirmed part only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.policy import CUD_VERBS, WRITE_BLOCKERS, WRITE_BLOCKERS_FOLDED
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese

AFFIRM = "affirm"
DECLINE = "decline"
HYPOTHETICAL = "hypothetical"
REPORT = "report"
NONE = "none"

# The write blocker names the decision table and the replies already use
BLOCKER_OF = {DECLINE: "negation", HYPOTHETICAL: "hypothetical", REPORT: "past_report"}

# Negation words, matched on accented tokens
NEGATORS = {"không", "chẳng", "chả", "đừng", "chưa", "khỏi", "chớ", "cấm", "khoan", "đâu", "not", "never", "dont", "don"}
# The same, typed without diacritics. "dùng", "cho", "cảm", "đầu" fold to words left out here or kept weak.
NEGATORS_FOLDED = {"khong", "ko", "k", "kh", "hong", "hok", "chang", "chua", "khoi", "khoan"}
# Folded words that are also everyday words (dùng, chả/cha, cấm/cảm, chớ/cho, đâu/đầu): a negator only when a
# change verb follows, after modal words at most ("dung xoa", "cho co xoa", "dau can xoa"; not "cho minh xoa")
WEAK_NEGATORS_FOLDED = {"dung", "cha", "cam", "cho", "dau"}
MODALS_FOLDED = {"co", "can", "muon", "phai", "nen", "dinh", "duoc", "hay"}
# Reported speech: someone else said it ("sếp bảo xóa bài X"). A reporting verb with a subject that is not
# the user, before the change verb, makes the change a report.
REPORTING_VERBS = {"bảo", "nói", "kêu", "khuyên", "dặn", "đòi", "said", "says", "told"}
REPORTING_VERBS_FOLDED = {"bao", "noi", "keu", "khuyen"}
FIRST_PERSON = {"mình", "tôi", "tao", "tớ", "em", "i", "minh", "toi", "to"}
# "bỏ ý định xóa", "hủy việc xóa", "dẹp vụ thêm": dropping the plan declines the change in it
DROP_VERBS = {"bỏ", "thôi", "hủy", "huỷ", "dẹp", "hoãn"}
DROP_VERBS_FOLDED = {"bo", "thoi", "huy", "dep", "hoan"}
PLAN_NOUNS = ("ý định", "vụ", "việc", "kế hoạch", "chuyện")
PLAN_NOUNS_FOLDED = ("y dinh", "vu", "viec", "ke hoach")  # "chuyen" folds from chuyển, a change verb

CLAUSE_BREAK = {",", ".", ";", "!", "?", ":", "\n", "thì", "nhưng", "mà", "but"}
CLAUSE_BREAK_FOLDED = {"thi", "nhung"}



def _normalized(words):
    """Word lists in the form messages are read in: normalize_vietnamese moves tone marks ("hoãn" -> "hõan")."""
    return type(words)(normalize_vietnamese(w).lower() for w in words)


NEGATORS, DROP_VERBS, PLAN_NOUNS = _normalized(NEGATORS), _normalized(DROP_VERBS), _normalized(PLAN_NOUNS)
REPORTING_VERBS, FIRST_PERSON, CLAUSE_BREAK = _normalized(REPORTING_VERBS), _normalized(FIRST_PERSON), _normalized(CLAUSE_BREAK)

_VERB_AT_START = re.compile(rf"^(?:{'|'.join(re.escape(v) for v in sorted(CUD_VERBS, key=len, reverse=True))})\b")
_VERB = re.compile(rf"\b(?:{'|'.join(re.escape(v) for v in sorted(CUD_VERBS, key=len, reverse=True))})\b")


@dataclass(frozen=True)
class Polarity:
    value: str
    affirmed: str  # folded text of the affirmed part: where an asked change's verb must be
    declined: str  # folded text after a negator


def _tokens(text: str) -> list[tuple[str, str]]:
    return [(t, fold(t)) for t in re.findall(r"\w+|[^\w\s]", normalize_vietnamese(text).lower())]


def _clauses(tokens: list[tuple[str, str]]) -> list[tuple[list[tuple[str, str]], bool]]:
    """Clauses, each with whether it is a condition (it ends at "thì": "trường hợp thêm bài X thì …")."""
    clauses, current = [], []
    for tok, ftok in tokens:
        if tok in CLAUSE_BREAK or (tok == ftok and ftok in CLAUSE_BREAK_FOLDED):
            clauses.append((current, ftok == "thi"))
            current = []
        else:
            current.append((tok, ftok))
    clauses.append((current, False))
    return [(c, cond) for c, cond in clauses if c]


def _reported(clause: list[tuple[str, str]]) -> bool:
    for i, (tok, ftok) in enumerate(clause):
        plain = tok == ftok
        if (tok in REPORTING_VERBS or (plain and ftok in REPORTING_VERBS_FOLDED)) and i > 0:
            subject = clause[i - 1][0]
            rest = " ".join(ft for _, ft in clause[i + 1:])
            return subject not in FIRST_PERSON and _VERB.search(rest) is not None
    return False


def _starts_with(tokens: list[tuple[str, str]], i: int, phrases: tuple[str, ...], folded: bool) -> bool:
    rest = " ".join((ft if folded else t) for t, ft in tokens[i:i + 3])
    return any(rest == p or rest.startswith(p + " ") for p in phrases)


def _negator_at(clause: list[tuple[str, str]], i: int) -> bool:
    tok, ftok = clause[i]
    plain = tok == ftok  # typed without diacritics
    if tok in NEGATORS or (plain and ftok in NEGATORS_FOLDED):
        return True
    if plain and ftok in WEAK_NEGATORS_FOLDED:
        j = i + 1
        while j < len(clause) and clause[j][1] in MODALS_FOLDED:
            j += 1
        if _VERB_AT_START.search(" ".join(ft for _, ft in clause[j:])):
            return True
    if tok in DROP_VERBS and _starts_with(clause, i + 1, PLAN_NOUNS, folded=False):
        return True
    return plain and ftok in DROP_VERBS_FOLDED and _starts_with(clause, i + 1, PLAN_NOUNS_FOLDED, folded=True)


def _parts(text: str) -> dict[str, list[str]]:
    """Folded text by role: affirmed, declined (after a negator), condition (before "thì"), reported."""
    parts: dict[str, list[str]] = {"affirmed": [], "declined": [], "condition": [], "reported": []}
    for clause, condition in _clauses(_tokens(text)):
        cut = next((i for i in range(len(clause)) if _negator_at(clause, i)), len(clause))
        head = " ".join(ft for _, ft in clause[:cut])
        role = "reported" if _reported(clause[:cut]) else "condition" if condition else "affirmed"
        parts[role].append(head)
        parts["declined"].append(" ".join(ft for _, ft in clause[cut:]))
    return parts


def split_affirmed(text: str) -> tuple[str, str]:
    """(affirmed, declined) folded text: only the affirmed part may carry the verb of a change to write."""
    parts = _parts(text)
    return " | ".join(a for a in parts["affirmed"] if a), " | ".join(d for d in parts["declined"] if d)


def polarity_of(text: str) -> Polarity:
    lower = normalize_vietnamese(text).lower()
    flat = fold(lower)
    parts = _parts(text)
    affirmed = " | ".join(a for a in parts["affirmed"] if a)
    declined = " | ".join(d for d in parts["declined"] if d)
    accented = lower != flat
    # Hypothetical and reported changes keep their patterns (policy.py): they hold the verb inside a frame
    blockers = WRITE_BLOCKERS if accented else WRITE_BLOCKERS_FOLDED
    for name, value in (("hypothetical", HYPOTHETICAL), ("past_report", REPORT)):
        if blockers[name].search(lower if accented else flat):
            return Polarity(value, affirmed, declined)
    if _VERB.search(affirmed):
        return Polarity(AFFIRM, affirmed, declined)
    if any(_VERB.search(c) for c in parts["condition"]):
        return Polarity(HYPOTHETICAL, affirmed, declined)
    if any(_VERB.search(r) for r in parts["reported"]):
        return Polarity(REPORT, affirmed, declined)
    if _VERB.search(declined):
        return Polarity(DECLINE, affirmed, declined)
    return Polarity(NONE, affirmed, declined)
