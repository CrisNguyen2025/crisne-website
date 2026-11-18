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
    # Only samples with required sections have a recall: elsewhere the listed sections are alternatives
    recalls = [r["recall"] for r in on_topic if "recall" in r]
    return {
        "n": len(rows),
        f"hit@{k}": _ratio(sum(r["passed"] for r in on_topic), len(on_topic)),
        f"mrr@{k}": round(reciprocal / len(on_topic), 4) if on_topic else None,
        f"recall@{k}": round(sum(recalls) / len(recalls), 4) if recalls else None,
        "recall_n": len(recalls),
        "off_topic_rejected": _ratio(sum(r["passed"] for r in off_topic), len(off_topic)),
    }


def _accuracy(rows: list[dict], k: int) -> dict:
    return {"n": len(rows), "accuracy": _ratio(sum(r["passed"] for r in rows), len(rows))}


def _mean(values: list) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _answer(rows: list[dict], k: int) -> dict:
    precisions = [r["citation_precision"] for r in rows if "citation_precision" in r]
    return {
        "n": len(rows),
        "accuracy": _ratio(sum(r["passed"] for r in rows), len(rows)),
        "citation_precision": round(sum(precisions) / len(precisions), 4) if precisions else None,
        "invalid_citation_rate": _ratio(sum(r.get("invalid_citations", 0) > 0 for r in rows), len(rows)),
    }


def _kappa(labeled: list[dict]) -> float | None:
    n = len(labeled)
    if not n:
        return None
    po = sum(bool(c["agree"]) for c in labeled) / n
    h_pos = sum(bool(c["human"]) for c in labeled) / n
    j_pos = sum(bool(c["judge"]) for c in labeled) / n
    pe = h_pos * j_pos + (1 - h_pos) * (1 - j_pos)
    if pe >= 1.0:
        return None
    return round((po - pe) / (1 - pe), 4)


def _judge(rows: list[dict], k: int) -> dict:
    def criterion(name: str) -> list[dict]:
        return [r["criteria"][name] for r in rows if name in r["criteria"]]

    facts, refusal = criterion("facts"), criterion("refusal")
    must_refuse = [c for c in refusal if c.get("expected") is True]
    must_answer = [c for c in refusal if c.get("expected") is False]
    baseline = [r["baseline"]["facts"] for r in rows if "baseline" in r]
    labeled = [r["calibration"] for r in rows if "calibration" in r]
    false_pass = sum(c["judge"] and not c["human"] for c in labeled)
    return {
        "n": len(rows),
        "accuracy": _ratio(sum(r["passed"] for r in rows), len(rows)),
        "faithfulness_mean": _mean([c["score"] for c in criterion("faithfulness")]),
        "relevance_mean": _mean([c["score"] for c in criterion("relevance")]),
        "facts_pass": _ratio(sum(c["passed"] for c in facts), len(facts)),
        # Share of expected facts the cited context states: low with low facts_pass = retrieval missed them
        "context_recall": _mean([c["context_recall"] for c in facts if "context_recall" in c]),
        # Substring baseline on the same samples: a gap with facts_pass shows how much wording varies
        "facts_pass_substring": _ratio(sum(baseline), len(baseline)),
        "refusal_pass": _ratio(sum(c["passed"] for c in refusal), len(refusal)),
        "refusal_recall": _ratio(sum(c["passed"] for c in must_refuse), len(must_refuse)),
        "over_refusal_rate": _ratio(sum(not c["passed"] for c in must_answer), len(must_answer)),
        "human_n": len(labeled),
        "human_agreement": _ratio(sum(c["agree"] for c in labeled), len(labeled)),
        "human_kappa": _kappa(labeled),
        # Judge passed what the human failed: the dangerous direction for a quality gate
        "judge_false_pass": false_pass,
        "judge_false_pass_rate": _ratio(false_pass, len(labeled)),
        "judge_false_fail": sum(c["human"] and not c["judge"] for c in labeled),
    }


def _scope(rows: list[dict], k: int) -> dict:
    return {
        "n": len(rows),
        "accuracy": _ratio(sum(r["passed"] for r in rows), len(rows)),
        # The costly direction: an outside topic treated as the roadmap's (answered from it, or a write offered)
        "external_admitted": sum(r["want"] == "external" and r["got"] in ("roadmap", "domain_gap") for r in rows),
        # An in-corpus topic refused as outside the roadmap
        "roadmap_refused": sum(r["want"] == "roadmap" and r["got"] == "external" for r in rows),
    }


METRICS = {"retrieval": _retrieval, "answer": _answer, "judge": _judge, "scope": _scope}


def _consistency(rows: list[dict]) -> dict:
    """With repeated trials: pass^n = every trial of a sample passed, pass@n = at least one did."""
    by_sample: dict[str, list[bool]] = {}
    for r in rows:
        by_sample.setdefault(r["id"], []).append(bool(r["passed"]))
    trials = max(len(v) for v in by_sample.values())
    return {
        "trials": trials,
        f"pass^{trials}": _ratio(sum(all(v) for v in by_sample.values()), len(by_sample)),
        f"pass@{trials}": _ratio(sum(any(v) for v in by_sample.values()), len(by_sample)),
    }


def summarize(results: list[dict], k: int) -> dict:
    metrics = {}
    for name in sorted({r["scorer"] for r in results}):
        rows = [r for r in results if r["scorer"] == name]
        metrics[name] = METRICS.get(name, _accuracy)(rows, k)
        if any("trial" in r for r in rows):
            metrics[name].update(_consistency(rows))
    by_tag: dict[str, dict] = {}
    for tag in sorted({t for r in results for t in r["tags"]}):
        rows = [r for r in results if tag in r["tags"]]
        by_tag[tag] = {"n": len(rows), "pass_rate": _ratio(sum(r["passed"] for r in rows), len(rows))}
    return {"metrics": metrics, "by_tag": by_tag}


def check_thresholds(metrics: dict, thresholds: dict) -> list[str]:
    """A bare number is a minimum; {"max": n} caps a metric where lower is better (e.g. judge_false_pass)."""
    failures = []
    for key, limit in thresholds.items():
        name, _, metric = key.partition(".")
        value = metrics.get(name, {}).get(metric)
        bounds = limit if isinstance(limit, dict) else {"min": limit}
        if value is None:
            failures.append(f"{key}: no value (scorer did not run?)")
        elif "min" in bounds and value < bounds["min"]:
            failures.append(f"{key}: {value} < {bounds['min']}")
        elif "max" in bounds and value > bounds["max"]:
            failures.append(f"{key}: {value} > {bounds['max']}")
    return failures
