# Multi-shot loops, cheap-first pipelines, and miss buckets — fork proposal

Status: **proposal, demo-gated**. This fork (pauljones0/BBBB) implements the
site side of four benchmark extensions; no numbers here are measured. Every new
display hides until its data exists, and `?demo=1` overlays clearly-marked
sample trajectories for layout review only. Delete `data/demo-shots.json` to
strip the demo with no other edit.

## What shipped in the fork

- **Shots tab** (`assets/js/shots.js`, wired in `main.js`): cumulative fixes
  against cumulative cost, one trajectory per selected run, one point per shot.
  Grey stub = cached dollars inside the point's cost. Diamond = pipeline
  handoff. Numerals = shot numbers. Hidden until some run carries `shots`.
- **Pipeline overlays**: a pipeline arm draws as one trajectory with a handoff
  marker on the same axes — no separate view.
- **Miss buckets, the claimed-only way**: `false_positive_fixes` (already in
  the data, zero everywhere so far) and new `attempted_failed` surface as
  tooltip rows (only when nonzero), `/method` definitions, and one key
  sentence each (only while a row on screen carries one). No new grid columns.
- **PNG export + URL state** for the Shots view, with DEMO marks on every
  demo surface including the export.

## Schema: what the generator must emit

Per run, alongside `fixed_bugs`:

```json
"shots": [
  {
    "shot": 1,
    "phase": 1,
    "phase_model": "GPT-6 Astra",
    "cum_fixed": 26,
    "new_fixed": 26,
    "cum_cost_usd": 14.2,
    "cum_cost_cache_read_usd": 1.1,
    "repo1_fixed": 14,
    "repo2_fixed": 12,
    "model_declared_done": false
  }
],
"pipeline": { "phases": [{ "model": "GPT-5.6 Luna" }, { "model": "GPT-6 Astra" }] },
"attempted_failed": 0
```

- `shots`: one row per shot, cumulative. `cum_cost_cache_read_usd` is the
  cached portion of `cum_cost_usd`. `model_declared_done` is the model's own
  "no more bugs" at/after that shot. Single-model arms use `phase: 1`
  throughout; a handoff is any shot whose `phase` differs from the previous
  shot's. Omit `shots` (or leave it empty) for runs that never looped — the
  tab hides per selection, and runs without data are named in the skip note.
- `pipeline`: only on staged arms. Omit on single-model runs.
- `attempted_failed`: count of planted bugs the diff touched that the judge
  says are still broken. Omit or zero when none.
- Mean rows: emit the mean trajectory (per-shot means of the cumulative
  figures); fractional `cum_fixed` renders as-is.

Glossary keys (suggested definitions are in `data/demo-shots.json`, which the
real generator replaces — real definitions always win over demo keys):

- `false_positive_fixes`, `attempted_failed`, `shot`.

## Receipts: `results/shots.csv` (proposed)

One row per (run, shot), mirroring the metrics files: `run, shot, phase,
phase_model, wall_s, input_tok, cache_write, cache_read, output_tok,
reasoning_tok, cost_est_usd, new_fixed, cum_fixed, model_declared_done, notes`.
`benchmark.json` carries the cumulative roll-up; this file is the audit trail.
Run-notes entries should record the stop (declared-done vs 5-shot cap) per arm.

## Runner work (private repo)

- **Loop protocol**: run the standard single-round prompt (shot 1), then
  re-prompt on each repo with prior context cached until the model declares no
  more bugs, at most 5 shots. The stop signal is the model's declaration; the
  judge still verifies every shot's fixes for scoring.
- **Judging per shot**: judge the cumulative diff after each shot;
  `new_fixed` is the delta. The final shot's cumulative figures must equal the
  row's published `fixed`/`cost_usd`.
- **Pipeline arms**: run the cheap model to declared-done, hand the full
  working context to the smart model, continue to declared-done, 5 shots total
  cap. One leaderboard row per pipeline arm, with `pipeline.phases` set.
- **`attempted_failed`**: needs a judge prompt addition — a planted bug the
  diff touches but does not fix. Distinct from `partial` (touched, closer?) —
  define the boundary in the judge contract before grading real arms. Until
  then the bucket stays zero and hidden.

## Read-outs this unlocks

- **Cost of iteration**: per-shot points show what shots 2–5 bought and what
  the cache paid for — the "1/2/3/4/5-shot cost graph".
- **Cheap-first question**: a pipeline trajectory answers "is it cheaper"
  directly against single-model lines at equal fix counts.
- **Context hypothesis**: Astra's lead gap at shot 1 vs at final shot.
  Rivals catching up on warm-cache shots supports "the bench is a 1-shot
  context test"; Astra extending its lead refutes it. No control arms needed.
- **Hallucination rate**: `false_positive_fixes / (fixed + extras)`, per row,
  in tooltips and the key — currently 0.0% everywhere measured.

## Deviations from repo idiom (deliberate, two)

- Scatter tooltip rows for the two miss buckets render only when nonzero,
  while `claimed_only` always renders. Reason: two permanent zeroes on a
  seven-row tooltip is noise; the hidden-until-relevant rule wins.
- The Shots y-axis note carries no figure (the maps name the best run's
  count). Reason: the top follows max(board best, trajectory endpoints), and
  demo endpoints would date a figured sentence.

## Verification (before any go-live)

Serve (`python -m http.server`), then: default board shows no Shots tab and
requests no demo file; `?demo=1&view=shots` renders trajectories + banner in
both themes; `?view=shots` without data falls back to the table; tooltips,
key sentences, `/method#def-shot` (with `?demo=1`), PNG export (both themes),
print, mobile viewport, and a CSP replay with zero violations. Run
`python stamp-assets.py` after any asset change.
