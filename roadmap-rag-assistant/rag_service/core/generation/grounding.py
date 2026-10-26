"""Post-answer checks: flags only, nothing is blocked here.

- check_grounding: names in bold and future promises that the retrieved context does not back.
- ACTION_CLAIM: a claim of having saved, created or changed something (the pipeline never writes).
"""

from __future__ import annotations

import re
import unicodedata

BOLD = re.compile(r"\*\*([^*\n]+?)\*\*")
FUTURE_PROMISE = re.compile(
    r"(sẽ (?:sớm |được )?(?:cập nhật|bổ sung|thêm|ra mắt|có)|sắp (?:có|ra mắt|cập nhật)|chúng tôi sẽ|will be (?:added|updated))",
    re.IGNORECASE,
)
ACTION_CLAIM = re.compile(
    r"✅\s*(?:đã\s+)?(?:tạo|lưu|thêm|xóa|xoá|cập\s+nhật|sửa)\b"
    r"|\b(?:đã|vừa)\s+(?:được\s+)?(?:tạo|lưu|thêm|xóa|xoá|cập\s+nhật|sửa)\b"
    r"|\bđược\s+(?:tạo|lưu)\s+(?:và|thành\s+công|xong)\b",
    re.IGNORECASE,
)


def _words(text: str) -> set[str]:
    return set(re.findall(r"\w+", unicodedata.normalize("NFC", text).casefold()))


def check_grounding(answer: str, context: str, question: str) -> dict:
    """Names in bold that appear in neither the context nor the question, plus future promises.

    Compared word by word, so a name the model reformats ("Section 01‑GEN General" for
    "Section: [01-GEN] General") still counts as grounded.
    """
    known = _words(f"{context}\n{question}")
    names = {n.strip() for n in BOLD.findall(answer)}
    # "**Lưu ý:**"-style labels are formatting, not names
    ungrounded = sorted(
        n for n in names if n and not n.endswith(":") and not _words(n) <= known
    )
    promises = [m.group(0) for m in FUTURE_PROMISE.finditer(answer)]
    # Answers never run a write: a claim of having created/saved/changed something is invented
    actions = [m.group(0) for m in ACTION_CLAIM.finditer(answer)]
    return {"ungrounded_terms": ungrounded, "future_promise": promises, "unbacked_action": actions}


# The findings a "sentence" policy removes while streaming, by grounding key (guardrails.ClaimStreamFilter)
FAIL_PATTERNS = {"future_promise": FUTURE_PROMISE, "unbacked_action": ACTION_CLAIM}

