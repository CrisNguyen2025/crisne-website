"""Focus — the topic a message is about, once its question frame is removed.

"bạn có biết thông tin về telegram k" asks about "telegram"; the frame ("bạn có biết thông tin về … k") says
only that it is a question. Scope (scope.py) and retrieval read the focus: the frame words match every
document a little and say nothing about where the topic belongs.

The frame is removed by pattern, not by topic: no list of topics is kept here.
"""

from __future__ import annotations

import re
from typing import Optional

from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese

# Matched on the folded text, so "bạn có biết" and "ban co biet" are one frame
_LEAD = (
    r"(?:e|ê|ơi|oi|alo|hi|hello|hey|bot|ad|admin|ban|bạn|anh|chi|em|minh|toi|tui|cho|hoi|chut|nhe|nha|voi|ah|a"
    r"|the|ok|oke|vay|con|thi|u|ua"
    # spoken fillers, folded: ờ ơ ừ ừm ờm uh hmm
    r"|o|om|um|uhm|uh|hmm+)"
)
# No "^": matched with a start position (re.match(text, pos)), which anchors there; "^" would not
LEADING_FRAME = re.compile(
    r"(?:" + _LEAD + r"[\s,!]+)*"
    r"(?:(?:ban\s+)?(?:co\s+)?biet\s+(?:(?:cai\s+)?gi\s+|chut\s+gi\s+)?(?:thong\s+tin\s+)?(?:ve\s+)?"
    r"|cho\s+(?:minh|toi|em|tui|anh)\s+hoi\s+(?:chut\s+)?(?:(?:la|ve|thong\s+tin\s+ve)\s+)?"
    r"|cho\s+hoi\s+(?:ve\s+)?"
    r"|(?:minh|toi|em|tui)\s+(?:muon|dang|can)\s+(?:tim\s+hieu|hoc|hieu|biet|hoi)\s+(?:them\s+)?(?:ve\s+)?"
    r"|(?:hay\s+)?(?:giai\s+thich|noi|ke|tom\s+tat|trinh\s+bay)\s+(?:giup\s+(?:minh|toi|em)\s+)?(?:cho\s+(?:minh|toi|em)\s+)?(?:ve\s+)?"
    r"|thong\s+tin\s+ve\s+"
    r"|so\s+sanh\s+"
    r"|(?:tell\s+me\s+about|what\s+(?:is|are)(?:\s+an?)?|explain|how\s+to\s+use|how\s+does)\s+"
    r"|(?:cach\s+(?:dung|lam|cai|su\s+dung)\s+))"
)
# Spoken fillers and the determiner of "cái X ấy", anywhere a frame may start: ờ ơ ừm ờm uh hmm, thì là, cái.
# Not "à" / "ừ": folded they are "a" / "u", real letters ("A/B testing").
SPOKEN_FILLER = re.compile(r"(?:(?:o|om|um|uhm|uh|hmm+|thi\s+la|cai)[\s,]+)+")
TRAILING_FRAME = re.compile(
    r"(?:\s+(?:la\s+(?:gi|cai\s+gi|sao)|nghia\s+la\s+(?:gi|sao)|dung\s+(?:de\s+)?lam\s+gi|de\s+lam\s+gi"
    r"|hoat\s+dong\s+(?:the\s+nao|ra\s+sao)|the\s+nao|ra\s+sao|nhu\s+the\s+nao|khac\s+nhau|khac\s+.*\s+cho\s+nao"
    r"|(?:co\s+)?(?:duoc\s+)?khong|ko|k|nhi|vay|the|a|ha|nhe|nha|di|giup(?:\s+(?:minh|toi|em))?"
    r"|(?:thi\s+)?sao|(?:con\s+)?(?:gi\s+)?nua"
    r"|cho\s+(?:minh|toi|em)|voi|chut))+\s*[?!.]*$"
)
# What is left when the message names nothing: pronouns and empty fillers
# A filler may lead it ("thế còn cái trên"); "con" alone is not stripped elsewhere, since "con trỏ" is a topic
NO_TOPIC = re.compile(
    r"^(?:(?:the|ok|oke|vay|con|thi|ma)\s+)*"
    r"(?:no|cai\s+(?:do|nay|kia|tren)|bai\s+(?:do|nay|kia|tren)|cai\s+gi|gi|con\s+(?:gi|nua)|con|nua|"
    r"vay|the|a|u|uh|hmm+|ok|oke|tren|do|nay|kia|thi\s+sao|sao|)$"
)


def _window(text: str) -> tuple[str, str, int, int]:
    """(normalized text, its folded form, start, end) of the topic once frames are removed.

    Folding keeps one character per character for NFC Vietnamese, so the window indexes both strings.
    """
    original = re.sub(r"\s+", " ", normalize_vietnamese(text)).strip()
    flat = fold(original)
    if len(flat) != len(original):  # a character folded to several: work on the folded text only
        original = flat
    start, end = 0, len(flat)
    m = re.search(r"[\s?!.,]+$", flat)
    if m:
        end = m.start()
    while True:  # frames can stack: "ê bạn ơi, cho mình hỏi chút là …", "biết cái gì về ờ cái telegram"
        filler = SPOKEN_FILLER.match(flat, start, end)
        if filler and filler.end() > start:
            start = filler.end()
            continue
        lead = LEADING_FRAME.match(flat, start, end)
        if lead and lead.end() > start:
            start = lead.end()
            continue
        trail = TRAILING_FRAME.search(flat[start:end])
        if trail and trail.start() < end - start:
            end = start + trail.start()
            continue
        break
    while start < end and flat[start] in " ,":
        start += 1
    # Spoken "… ấy nó khác gì": the topic ends at "ấy"
    spoken = re.search(r"\s+ay(?:\s|$)", flat[start:end])
    if spoken:
        end = start + spoken.start()
    while end > start and flat[end - 1] in " ,":
        end -= 1
    return original, flat, start, end


def focus_of(text: str) -> Optional[str]:
    """The topic of the message, folded and lowercase; None when it names none.

    "bạn có biết thông tin về telegram k" -> "telegram"; "so sánh GAN và VAE" -> "gan | vae";
    "bài đó sao" -> None.
    """
    _, flat, start, end = _window(text)
    topic = flat[start:end]
    if NO_TOPIC.match(topic):
        return None
    parts = re.split(r"\s+(?:va|voi|vs|and|or|hay|hoac)\s+", topic)
    if len(parts) == 2 and all(p.strip() for p in parts):
        return " | ".join(p.strip() for p in parts)
    return topic or None

