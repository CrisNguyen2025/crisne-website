# _scope — what a message is about

`expected.target`: `roadmap` (in the corpus), `domain_gap` (AI/LLM, not covered yet), `external` (outside the
domain), `none` (no topic). Scored by `scope` (`external_admitted` is the costly error).

Two splits, by tag:
- `split-tune` (40): `evals/scope_tune.py` picks the scope and answerability thresholds on these.
- `split-holdout` (30): different topics, written apart; measured only, never used to pick a threshold.
