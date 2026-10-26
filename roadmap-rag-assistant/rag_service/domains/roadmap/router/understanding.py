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
    ABOUT_ASSISTANT,
    CAPABILITY_QUESTION,
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
        label = LABEL.match(s)
        if label and not _has_any(ENTITY_PATTERNS, fold(label.group(1))):
            s = s[label.end():]
        s = s.strip()
        if s == before:
            break
    s = (TRAILING_FILLER if accented else TRAILING_FILLER_FOLDED).sub("", s).strip(" ,")
    return s or lower.strip()


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

    has_verb = any(re.search(rf"\b{re.escape(v)}\b", flat) for v in CUD_VERBS)
    # P3: a roadmap noun names this roadmap's object unless it sits in code or in another place (object_sense.py)
    has_object = _has_any(ENTITY_PATTERNS, strip_code(FALSE_OBJECT.sub(" ", fold(lower)))) and not names_another_place(lower, known_place)
    has_search = _has_phrase(SEARCH_WORDS, flat)
    imperative = bool(IMPERATIVE_START.search(flat))
    head = NAMED_PART.sub(" ", lower).strip()
    cue_head = head if accented else fold(head)
    # Greetings are read on the original message: noise stripping removes them from `lower`
    after_greeting = GREETING_PREFIX.sub("", raw, count=1)

    # A question about using the assistant: what it can do, or how to make a roadmap change.
    # A command whose name holds how-to words ("thêm bài Làm sao deploy vào layer X") is not one.
    capability = not has_verb and CAPABILITY_QUESTION.search(flat) is not None
    usage_how_to = (
        has_verb and has_object and how_to.search(cue_head if imperative else (lower if accented else flat)) is not None
        and (not imperative or end_question.search(cue_head) is not None)
    )
    syntax = (SYNTAX_QUESTION.search(lower) if accented else SYNTAX_QUESTION_FOLDED.search(flat)) is not None
    asks_usage = capability or usage_how_to or syntax
    # P2: is the named change asked for? (polarity.py)
    polarity = polarity_of(lower).value if has_verb else NO_POLARITY
    write_blocker = BLOCKER_OF.get(polarity)

    # ── Target: off-topic first, then the assistant, then the roadmap ──
    if _has_phrase(OFF_TOPIC_STRONG_HINTS, flat) or (not has_object and _has_phrase(OFF_TOPIC_HINTS, flat)):
        target = Target.OFF_TOPIC
    elif (
        (SUGGESTION.search(lower) and not re.search(r"\bvề\b", lower))
        or ABOUT_ASSISTANT.search(after_greeting)
        or asks_usage
    ):
        target = Target.ASSISTANT
    elif has_object:
        target = Target.ROADMAP
    else:
        target = Target.NONE

    # ── Speech act ──
    if imperative and has_object:
        # A command names its object after the verb, and the name may hold question words
        # ("tạo topic tên là Tại sao Docker", "thêm bài Làm sao deploy vào layer X"): only "?" or a
        # question word ending the message ("tạo topic như thế nào") outside the name makes it a question.
        asks = "?" in head or bool(end_question.search(cue_head))
    else:
        # "có thể thao tác gì ở dự án này": the capability cue is the question, even with "gì" mid-sentence
        asks = is_question_text(lower, flat) or capability or (not accented and bool(END_QUESTION_FOLDED.search(flat)))
    yes_no, request_cue = (END_YES_NO, REQUEST_CUE) if accented else (END_YES_NO_FOLDED, REQUEST_CUE_FOLDED)
    # "không cần thêm bài nào nữa đâu" declines a change; "nào … đâu" is emphasis, not a question.
    # A real question stays one: "đừng xóa bài X k", "đừng xóa bài X, rồi tìm bài về Docker".
    if write_blocker == "negation" and "?" not in lower and not has_search and yes_no.search(lower) is None:
        asks = False
    polite = (
        has_verb and has_object and not has_search
        and (
            (yes_no.search(lower) is not None and request_cue.search(lower) is not None)
            # "Can you add a new group called 'Testing'…?": asked, so it runs only after the preview
            or EN_POLITE_REQUEST.search(flat) is not None
        )
    )
    conditional = has_verb and has_object and CONDITIONAL_REQUEST.search(flat) is not None

    learning_plan = (
        LEARNING_PLAN_GOAL.search(flat) is not None and LEARNING_PLAN_NOUN.search(flat) is not None
        and not CREATE_ROADMAP.search(flat)
    )
    thanks = THANKS.match(raw) is not None and "?" not in raw and not has_object and (
        not has_search or PRAISE.search(lower) is not None
    )

    if any(lower.startswith(p) for p in ["/plan", "/goal"]) or any(k in lower for k in PLAN_PHRASES) or learning_plan:
        act = SpeechAct.PLAN
    # A recall word next to a roadmap listing or search ("liệt kê bài … tôi tên gì nhỉ") is the roadmap request
    elif (CONVERSATION_RECALL.search(lower) and not (has_object and has_search)) or (
        not has_object and (IDENTITY_STATEMENT.match(raw) or SELF_DISCLOSURE.search(raw))
    ):
        act = SpeechAct.RECALL
    elif (after_greeting != raw and not after_greeting.strip(" ?!.,")) or thanks:
        act = SpeechAct.GREETING
    elif polite or conditional:
        act = SpeechAct.REQUEST
    elif asks:
        act = SpeechAct.QUESTION
    elif has_verb or imperative:
        act = SpeechAct.COMMAND
    else:
        act = SpeechAct.STATEMENT

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


# The entity word a change names, accented or folded ("topic", "bài học", "layer", "nhóm")
_ENTITY_WORD = re.compile(
    r"\b(?:topics?|chủ\s+đề|chu\s+de|lộ\s+trình|lo\s+trinh|roadmaps?|layers?|mảng|mang|groups?|nhóm|nhom|items?"
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

