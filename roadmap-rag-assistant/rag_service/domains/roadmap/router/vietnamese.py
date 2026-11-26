"""Vietnamese text normalization and linguistic helpers for Roadmap Assistant.

Handles Unicode NFC/NFD variations, macOS keyboard Telex artifacts,
and traditional vs modern tone mark placement (e.g., 'xoá' vs 'xóa', 'huỷ' vs 'hủy').
"""

from __future__ import annotations

import re
import unicodedata

# Mapping traditional tone placement to canonical modern standard
TRADITIONAL_TO_MODERN = {
    "oà": "òa", "oá": "óa", "oả": "ỏa", "oã": "õa", "oạ": "ọa",
    "oè": "òe", "oé": "óe", "oẻ": "ỏe", "oẽ": "õe", "oẹ": "ọe",
    "uỳ": "ùy", "uý": "úy", "uỷ": "ủy", "uỹ": "ũy", "uỵ": "ụy",
    "OÀ": "ÒA", "OÁ": "ÓA", "OẢ": "ỎA", "OÃ": "ÕA", "OẠ": "ỌA",
    "OÈ": "ÒE", "OÉ": "ÓE", "OẺ": "ỎE", "OẼ": "ÕE", "OẸ": "ỌE",
    "UỲ": "ÙY", "UÝ": "ÚY", "UỶ": "ỦY", "UỸ": "ŨY", "UỴ": "ỤY",
    "Oà": "Òa", "Oá": "Óa", "Oả": "Ỏa", "Oã": "Õa", "Oạ": "Ọa",
    "Oè": "Òe", "Oé": "Óe", "Oẻ": "Ỏe", "Oẽ": "Õe", "Oẹ": "Ọe",
    "Uỳ": "Ùy", "Uý": "Úy", "Uỷ": "Ủy", "Uỹ": "Ũy", "Uỵ": "Ụy",
}
# Only an open syllable moves its tone: "toàn", "khoảng", "quý" are already modern ("tòan" is a typo)
_TRADITIONAL_TONE = re.compile(
    r"(?<![qQ])(" + "|".join(map(re.escape, TRADITIONAL_TO_MODERN)) + r")(?!\w)"
)


def normalize_vietnamese(text: str) -> str:
    """Normalize Vietnamese text to Unicode NFC and canonical modern tone placement."""
    if not text:
        return ""
    # 1. Unicode NFC normalization (composes decomposed NFD accents from macOS/Telex)
    norm = unicodedata.normalize("NFC", text)
    # 2. Canonicalize vowel tone placement (e.g. 'xoá' -> 'xóa', 'huỷ' -> 'hủy')
    norm = _TRADITIONAL_TONE.sub(lambda m: TRADITIONAL_TO_MODERN[m.group(1)], norm)
    # 3. Chat shorthand ("dc ko", "j z"): every rule and the LLM then read one spelling
    return expand_teencode(norm)


# Chat shorthand with one meaning. Only lowercase standalone tokens: "DC Comics" or "K8s" are names.
# Left out on purpose: "vs" (versus), "e", "r", "ad", "k" (handled where it ends a yes/no question),
# "ns" (namespace, nanosecond), and shorthand that is also a tech term ("lm", "ms", "ng", "nx", "qa", "tg", "cx")
# or has two common meanings ("bh", "bn", "đk", "nc", "dg", "v").
TEENCODE = {
    "dc": "được", "đc": "được",
    "ko": "không", "hok": "không", "hông": "không", "khum": "không", "khg": "không", "k0": "không", "kô": "không",
    "j": "gì", "ji": "gì", "zì": "gì", "z": "vậy", "zậy": "vậy", "dzậy": "vậy", "zị": "vậy",
    "ntn": "như thế nào", "ntnao": "như thế nào", "bnhiu": "bao nhiêu", "bnhieu": "bao nhiêu",
    "bjo": "bây giờ", "bgio": "bây giờ", "hnay": "hôm nay", "hqua": "hôm qua", "trc": "trước", "chx": "chưa",
    "đg": "đang", "tgian": "thời gian",
    "mk": "mình", "mik": "mình", "mìn": "mình", "mềnh": "mình", "mn": "mọi người", "mng": "mọi người",
    "ngta": "người ta", "pn": "bạn", "pạn": "bạn",
    "nma": "nhưng mà", "nhma": "nhưng mà", "nhg": "nhưng", "nhưg": "nhưng", "lun": "luôn", "thui": "thôi",
    "thoy": "thôi", "qá": "quá", "wá": "quá", "nhiu": "nhiều", "nhìu": "nhiều", "bth": "bình thường",
    "bik": "biết", "bít": "biết", "bjt": "biết", "hiu": "hiểu", "hỉu": "hiểu", "hju": "hiểu", "thik": "thích",
    "mún": "muốn", "đki": "đăng ký", "đky": "đăng ký",
    "vd": "ví dụ", "vde": "vấn đề", "vđ": "vấn đề", "kq": "kết quả", "lquan": "liên quan",
    "ctrinh": "chương trình", "ngcuu": "nghiên cứu", "ncuu": "nghiên cứu", "cty": "công ty",
}
_TEENCODE_TOKEN = re.compile(r"(?<![\w./-])(" + "|".join(sorted(TEENCODE, key=len, reverse=True)) + r")(?![\w./-])")


def expand_teencode(text: str) -> str:
    return _TEENCODE_TOKEN.sub(lambda m: TEENCODE[m.group(1)], text)


import re

# "giúp" as typed: the tone mark often lands on the wrong vowel ("gíup") or is missing ("giup"); "giùm"/"gium" likewise
_GIUP = r"(?:g(?:iú|íu|iu)p|giùm|gium)"

PREFIX_FILLER_REGEX = re.compile(
    r"^(?:(?:"
    r"bạn\s+ơi|anh\s+ơi|chị\s+ơi|em\s+ơi|admin\s+ơi|bot\s+ơi"
    r"|làm\s+ơn|vui\s+lòng|hãy|nhờ\s+bạn|nhờ\s+bot"
    r"|(?:" + _GIUP + r"|hộ|cho)\s+(?:tôi|mình|em|anh|chị)"
    r"|please|kindly|(?:can|could|would)\s+you"
    r")[\s,]+)+",
    re.IGNORECASE,
)

SUFFIX_FILLER_REGEX = re.compile(
    r"(?:\s+(?:"
    r"(?:" + _GIUP + r"|hộ|cho)\s+(?:tôi|mình|em|anh|chị|tao)"
    r"|với\s+(?:nhé|nha|nhé\s+bạn|nha\s+bạn|bạn\s+ơi|bạn)"
    r"|với"
    r"|nhé\s+bạn(?:\s+ơi)?|nha\s+bạn(?:\s+ơi)?|đi\s+bạn(?:\s+ơi)?"
    r"|bạn\s+ơi|anh\s+ơi|chị\s+ơi|em\s+ơi|bạn"
    r"|nhé|nha|đi|ạ|ngay|luôn"
    r"|được\s+không(?:\s+bạn|\s+ạ)?"
    r"|please|for\s+me|help\s+me|kindly"
    r"))+[\.\?!,]*$",
    re.IGNORECASE,
)


def clean_conversational_fillers(text: str) -> str:
    """Strip conversational filler words, pleasantries, and polite wrappers (Vietnamese + English)."""
    if not text:
        return ""
    cleaned = text.strip()
    prev = ""
    while prev != cleaned:
        prev = cleaned
        cleaned = PREFIX_FILLER_REGEX.sub("", cleaned).strip()
        cleaned = SUFFIX_FILLER_REGEX.sub("", cleaned).strip()
    return cleaned

