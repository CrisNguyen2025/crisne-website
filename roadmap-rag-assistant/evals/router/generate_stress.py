"""Generate the router stress set: request templates with known intents, crossed with noise.

Deterministic (fixed seed), so the committed stress.jsonl only changes when this file changes.
Run: `.venv/bin/python -m evals.router.generate_stress` then review the diff of stress.jsonl.

Each sample lists the intents of its clauses in `expected.clauses`. "no_write" marks a clause that names a change
but does not ask for one (negation, hypothetical, past report, syntax question): any intent but a change is right.
A two-clause sample whose first clause is "no_write" expects only the second clause's intent.
"""

from __future__ import annotations

import json
import random
import unicodedata
from pathlib import Path

OUT = Path(__file__).parent / "stress.jsonl"
SEED = 7

CUD, KQ, CHAT, OOS = "roadmap_cud", "knowledge_query", "chitchat", "out_of_scope"
NO_WRITE = "no_write"

NAMES = ["Kafka", "Docker Compose", "AI Engineering", "Redis", "RAG", "Machine Learning", "Next.js"]
LAYERS = ["Backend", "General", "DevOps", "AI Agent"]
TOPICS = ["AI", "Test Router", "Docker", "ZZ Test"]

FAMILIES: dict[str, tuple[str, list[str]]] = {
    "cud_imperative": (CUD, ["tạo topic {t}", "thêm bài {n} vào layer {l}", "xóa bài {n}", "đổi tên bài {n} thành {m}",
                             "chuyển bài {n} sang layer {l}"]),
    "cud_polite": (CUD, ["bạn tạo topic {t} được không", "có thể thêm bài {n} vào layer {l} không",
                         "nhờ bạn tạo layer {l} được không"]),
    "cud_conditional": (CUD, ["chưa có bài {n} thì thêm vào layer {l}", "nếu chưa có {n} thì tạo topic {t}"]),
    "search": (KQ, ["tìm bài về {n}", "có bài nào về {n} không", "giải thích {n} là gì", "{n} hoạt động thế nào"]),
    "how_to_usage": (CHAT, ["cách thêm bài vào layer", "các bước tạo topic", "làm thế nào để xóa topic",
                            "muốn tạo layer thì làm sao", "tạo topic như thế nào"]),
    "capability": (CHAT, ["bạn làm được gì", "có thể thao tác gì ở dự án này", "bạn hỗ trợ những chức năng nào"]),
    "off_topic": (OOS, ["thời tiết hôm nay thế nào", "giá bitcoin hôm nay bao nhiêu"]),
    # Change words that are not change requests
    "negation": (NO_WRITE, ["đừng xóa bài {n}", "không cần tạo topic {t}", "khoan, chưa thêm bài {n} vội",
                            "thôi không xóa bài {n} nữa"]),
    "hypothetical": (NO_WRITE, ["nếu xóa topic {t} thì có mất bài không", "xóa layer {l} có ảnh hưởng gì không",
                                "lỡ xóa nhầm bài {n} thì khôi phục được không"]),
    "past_report": (NO_WRITE, ["hôm qua tôi đã tạo topic {t}", "tôi vừa thêm bài {n} vào layer {l} rồi", "ai đã xóa bài {n}"]),
    "meta": (NO_WRITE, ["lệnh xóa bài là gì", "cú pháp tạo topic", "tạo topic có giới hạn số lượng không"]),
}

SECOND_CLAUSES = [("tìm bài về Docker", KQ), ("tạo topic Docker Compose", CUD)]


def strip_marks(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").replace("đ", "d").replace("Đ", "D")


# Noise that must not change the decision
NOISE = {
    "clean": lambda s: s,
    "no_diacritics": strip_marks,
    "upper": str.upper,
    "question_mark": lambda s: s + "?",
    "trailing_k": lambda s: s + " k",
    "filler_prefix": lambda s: "ê bạn ơi, " + s,
    "filler_suffix": lambda s: s + " nhé ạ",
    "emoji": lambda s: s + " 🙏",
    "label_prefix": lambda s: "Việc cần làm: " + s,
    "label_prefix_question": lambda s: "Câu hỏi: " + s,
    "english_mix": lambda s: "pls " + s + " thanks",
    "newline_greeting": lambda s: "Hi\n" + s,
}
# "?" or "k" after a bare command turns it into a question: the meaning changes, so these pairs are left out
MEANING_CHANGING = {(n, f) for n in ("question_mark", "trailing_k") for f in ("cud_imperative", "cud_conditional")}


def generate() -> list[dict]:
    rng = random.Random(SEED)
    samples = []
    for family, (intent, templates) in FAMILIES.items():
        for template in templates:
            base = template.format(n=rng.choice(NAMES), l=rng.choice(LAYERS), t=rng.choice(TOPICS), m=rng.choice(NAMES))
            for noise, apply in NOISE.items():
                if (noise, family) not in MEANING_CHANGING:
                    samples.append({"input": apply(base), "family": family, "noise": noise, "expected": {"clauses": [intent]}})
            for text, second in SECOND_CLAUSES:
                clauses = [second] if intent == NO_WRITE else [intent, second]
                samples.append({"input": f"{base}, rồi {text}", "family": family, "noise": "two_clauses",
                                "expected": {"clauses": clauses}})
    for i, s in enumerate(samples, start=1):
        s["id"] = f"stress-{i:04d}"
    return samples


def main() -> None:
    samples = generate()
    with OUT.open("w", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps({"id": s["id"], **{k: v for k, v in s.items() if k != "id"}}, ensure_ascii=False) + "\n")
    print(f"wrote {len(samples)} samples to {OUT}")


if __name__ == "__main__":
    main()
