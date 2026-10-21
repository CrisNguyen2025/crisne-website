"""Aggregate per-sample results into metrics and check them against meta.json thresholds.

Threshold keys are "<scorer>.<metric>", e.g. {"retrieval.hit@5": 0.9, "route.accuracy": 1.0}.
"""

from __future__ import annotations


def _ratio(part: int, total: int) -> float | None:
    return round(part / total, 4) if total else None


def _retrieval(rows: list[dict], k: int) -> dict:
    on_topic = [r for r in rows if r["kind"] == "on_topic"]
    off_topic = [r for r in rows if r["kind"] == "off_topic"]
    reciprocal = sum(1 / r["rank"] for r in on_topic if r["rank"])
    return {
        "n": len(rows),
        f"hit@{k}": _ratio(sum(r["passed"] for r in on_topic), len(on_topic)),
        f"mrr@{k}": round(reciprocal / len(on_topic), 4) if on_topic else None,
        "off_topic_rejected": _ratio(sum(r["passed"] for r in off_topic), len(off_topic)),
    }


def _accuracy(rows: list[dict], k: int) -> dict:
    return {"n": len(rows), "accuracy": _ratio(sum(r["passed"] for r in rows), len(rows))}


def _mean(values: list) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _judge(rows: list[dict], k: int) -> dict:
    def criterion(name: str) -> list[dict]:
        return [r["criteria"][name] for r in rows if name in r["criteria"]]

    facts, refusal = criterion("facts"), criterion("refusal")
    baseline = [r["baseline"]["facts"] for r in rows if "baseline" in r]
    labeled = [r["calibration"] for r in rows if "calibration" in r]
    return {
        "n": len(rows),
        "accuracy": _ratio(sum(r["passed"] for r in rows), len(rows)),
        "faithfulness_mean": _mean([c["score"] for c in criterion("faithfulness")]),
        "relevance_mean": _mean([c["score"] for c in criterion("relevance")]),
        "facts_pass": _ratio(sum(c["passed"] for c in facts), len(facts)),
        # Substring baseline on the same samples: a gap with facts_pass shows how much wording varies
        "facts_pass_substring": _ratio(sum(baseline), len(baseline)),
        "refusal_pass": _ratio(sum(c["passed"] for c in refusal), len(refusal)),
        "human_n": len(labeled),
        "human_agreement": _ratio(sum(c["agree"] for c in labeled), len(labeled)),
        # Judge passed what the human failed: the dangerous direction for a quality gate
        "judge_false_pass": sum(c["judge"] and not c["human"] for c in labeled),
        "judge_false_fail": sum(c["human"] and not c["judge"] for c in labeled),
    }


METRICS = {"retrieval": _retrieval, "judge": _judge}


def summarize(results: list[dict], k: int) -> dict:
    metrics = {}
    for name in sorted({r["scorer"] for r in results}):
        rows = [r for r in results if r["scorer"] == name]
        metrics[name] = METRICS.get(name, _accuracy)(rows, k)
    by_tag: dict[str, dict] = {}
    for tag in sorted({t for r in results for t in r["tags"]}):
        rows = [r for r in results if tag in r["tags"]]
        by_tag[tag] = {"n": len(rows), "pass_rate": _ratio(sum(r["passed"] for r in rows), len(rows))}
    return {"metrics": metrics, "by_tag": by_tag}


def check_thresholds(metrics: dict, thresholds: dict) -> list[str]:
    failures = []
    for key, minimum in thresholds.items():
        name, _, metric = key.partition(".")
        value = metrics.get(name, {}).get(metric)
        if value is None:
            failures.append(f"{key}: no value (scorer did not run?)")
        elif value < minimum:
            failures.append(f"{key}: {value} < {minimum}")
    return failures
