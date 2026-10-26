# Routing phases

Every message goes through the same phases, in order. Each phase answers one question, has one rule that must
hold, and its own label in logs and evals. When a reply is wrong, the first phase whose output is wrong is
where the fix goes. Fix that phase's concept, not the sentence.

| Phase | Question | Output | Rule that must hold | Code |
|---|---|---|---|---|
| P0 clean | Which text do we read? | main clause, `focus` | Drop fillers, greetings and labels; never a word that carries meaning | `focus.py`, `understanding.strip_noise`, `instruction_part` |
| P1 act | What is the user doing? | plan · recall · greeting · request · question · command · statement | A change verb without a roadmap object is not a command | `understanding.py` |
| P2 polarity | Do they want the change to happen? | affirm · decline · hypothetical · report · none | Only `affirm` may be written; anything unclear is not `affirm` | `polarity.py` |
| P3 target | What is it about (keywords)? | off_topic · assistant · roadmap · none | `roadmap` needs a roadmap noun or a catalog name | `policy.py`, `understanding.py` |
| P4 scope | Is a question or statement in the field? | ROADMAP · DOMAIN_GAP · EXTERNAL · NONE | Never EXTERNAL without evidence | `scope.py` |
| P5 table / LLM router | What does act × target do? | intent + write permission | The first matching row of `DECISION_TABLE` decides; the LLM router only reads what no row decides | `policy.py`, `intent_router.py` |
| P6 System 2 | Does a second reading agree it is a change? | act, target system, action | If System 2 disagrees with System 1 on polarity or action, nothing is written | `verifier.py`, `write_policy.py` |
| P7 grounding | Does the object exist in the roadmap? | grounded · ungrounded · unverifiable | Update and delete must name an object that exists | `target_grounding.py` |
| P8 gate | Run now, preview, or block? | run · preview · reroute · blocked | The action's verb must be in the affirmed part (P2); every delete is previewed | `write_gate.py`, `write_policy.py` |
| P9 reply | What is said back? | the reply | Each block reason has exactly one reply | `grounding.py`, `commands.py`, `agent.py` |

## P2 polarity

Polarity is read by clause, not from listed phrases:

1. Split the message into clauses at punctuation, `thì`, `nhưng`, `mà`.
2. Inside a clause, a change verb after a negator is declined. Negators are Vietnamese's closed class of
   negation words (không, chẳng, chả, đừng, chưa, khỏi, chớ, cấm, khoan, đâu) and "drop the plan" frames
   (bỏ / hủy / dẹp / hoãn + ý định / vụ / việc / kế hoạch). Folded words that are also everyday words
   (dùng, cho, cảm, đầu) count only right before a change verb, after modal words at most.
3. A verb only in a clause that ends at `thì` is hypothetical ("trường hợp thêm bài X thì …").
4. A verb after a reporting verb whose subject is not the user is a report ("sếp bảo xóa …").
5. The message is `affirm` when some clause affirms a change. The write gate reads the action's verb from
   the affirmed part only, so "đừng xóa bài X, rồi tạo topic Y" can create Y and never delete X.

Known gap (from `polarity_holdout.jsonl`): an adverb between a weak folded negator and the verb
("dung co tu y doi ten …") is not read as a decline. The change is still only a preview.

## Tracing a miss

`RouteOutcome.trace()` records each phase's output; the agent logs it as `phases` on the routing step.
`RouteOutcome.decided_by` is the phase that settled the route.

`decided_by` is where the route was settled, which is not always where the mistake is. An earlier phase can
feed a wrong output into a later one: a P2 miss reaches P6 as a change. Read the trace from P0 down, and fix
the first phase whose output is wrong.

The stress set does this for you. Each row carries hand labels for P1–P3 (`"phases"`, `a|b` = either is
right), written from what the sentence means under this table's definitions, not from the router's output.
A failure is charged to the first labelled phase that is wrong, and to `decided_by` when P1–P3 are right.
The report also counts a phase as **latent** when it is wrong on a message whose branch is still right: a
later phase covered for it this time.

Offline stress run when the labels were added (2026-10-26):

| First wrong phase | Failures | Concept gap |
|---|---|---|
| P3 target | 52 | Roadmap nouns in another sense ("nhóm Zalo", "layer mask", "DELETE FROM topics") read as the roadmap |
| P1 act | 46 | Question frames without a question word ("so sánh …", "cho mình hỏi về …", "… có gì hay"); plan requests phrased as "tạo kế hoạch …" |
| P5 LLM router | 32 | Needs the model (offline fallback) |
| P5 table | 7 | |
| P6 System 2 | 5 | Needs the model (offline fallback) |

P2 is wrong on 20 messages, 19 of them latent: sarcasm (P2 has no sarcasm value; System 2 has) and
"bạn mình nói …", where the subject of the reporting verb ends in "mình".

## Measuring

| Set | Command | Use |
|---|---|---|
| golden, router contract | `python -m evals router-check` | Every decision change is reviewed, then `--accept` |
| holdout | `python -m evals.router.holdout` | Writes at once and missed changes |
| stress | `python -m evals.router.confuse` | Ratchet in `confuse_baseline.json`; failures by deciding phase |
| messy | `python -m evals.router.confuse --set messy` | Measured only |
| polarity | `python -m evals.router.polarity` | The P2 rules were written against it |
| polarity holdout | `python -m evals.router.polarity --set holdout` | Written after the rules; measured, never tuned on |

Offline (no model quota), P5_llm and P6_verify carry most stress failures: those phases need the model.
