# grok-4.7 `xhigh` — zero-token ACP readback, 2026-09-21

Same method as the 08-12 (xhigh), 08-14 (medium), 08-27 (low) and 09-13 (xhigh) readbacks:
`initialize` + `session/new`, no prompt sent, read the session's own `configOptions` and the
`_meta.reasoningEffort` advertised for the served model. The grok CLI silently clamps unknown
effort strings, so only an echo of the requested value makes the arm's effort label honest.

Two facts this probe settles for the `grok47xhigh` arm:

1. **The tier binds.** `requested='xhigh' -> active='xhigh'`.
2. **`xhigh` is the ceiling.** The enum advertised for `grok-4.7` is `xhigh > high > medium > low`,
   with `high` marked `default: true` and `xhigh` described as "Maximum reasoning for the hardest
   tasks." Nothing sits above it. → `effort_status=verified_ceiling`.

The served model is named by the session rather than inferred from the `-m` flag (which has been
inert on this bridge before): `models.currentModelId = grok-4.7`, and the session's `model`
config option reads `currentValue: grok-4.7`. grok-4.7 is also this CLI build's own default model,
so both paths point at the same place.

```
requested='xhigh' -> active='xhigh'
   tiers: ['xhigh', 'high', 'medium', 'low']
   meta: {"totalContextTokens": 500000, "agentType": "grok-build-plan", "supportsReasoningEffort": true, "reasoningEffort": "xhigh", "reasoningEfforts": [{"id": "xhigh", "value": "xhigh", "label": "Extra High", "description": "Maximum reasoning for the hardest tasks.", "default": false}, {"id": "high", "value": "high", "label": "High", "description": "Thorough reasoning and quality. Recommended.", "default": true}, {"id": "medium", "value": "medium", "label": "Medium", "description": "Strong quality with a faster turnaround.", "default": false}, {"id": "low", "value": "low", "label": "Low", "description": "Fastest responses. Best for simple tasks.", "default": false}]}
   advertised models: ['grok-4.7', 'grok-4.7-build-fast', 'grok-4.6', 'grok-4.5']
   session configOptions.model.currentValue = 'grok-4.7'
   session configOptions.reasoning_effort.currentValue = 'xhigh'
```

Raw: `20260921-grok47-xhigh-acp-readback.json`. CLI: `grok 1.0.30 (04b7ffed98c6)` on 2026-09-21.

## Second source, first-party, same day

`GET https://api.x.ai/v1/models/grok-4.7` confirms the ceiling without going through the CLI at all:

```
"capabilities": {"reasoning_effort": ["low","medium","high","xhigh"],
                 "default_reasoning_effort": "high"},
"context_length": 500000, "long_context_threshold": 200000,
prompt 2.00 / cached 0.50 / completion 6.00 per MTok   (below the threshold)
prompt 4.00 / cached 1.00 / completion 12.00 per MTok  (at or above it)
```

Two things follow that the CLI readback alone could not establish. The enum is the vendor's own, not
the CLI's rendering of it, so `xhigh` being the top tier is not an artefact of the harness. And the
prices **double** for any request whose prompt reaches 200K — both legs of the `grok47xhigh` arm
carried peaks of 298,334 and 280,604, so the reconstructed floor (computed at the sub-threshold
rates, for comparability with every other grok row) understates the real bill for a second reason
entirely separate from the snapshot-vs-cumulative one.

## `grok-4.7-build-fast` is a serving route, not a model

The CLI advertises it alongside `grok-4.7`, and it is easy to mistake for a flash/mini tier. It is
not. Its own description is `Fast variant. 2x the price.`, and every field the session advertises is
identical to `grok-4.7`: `totalContextTokens` 500000, `agentType` grok-build-plan,
`supportsReasoningEffort` true, the same four tiers, the same `high` default. The public API does not
know the id at all — `/v1/models/grok-4.7-build-fast` returns 404 `not-found` — so it exists only on
the grok.com/CLI path.

Contrast with the family's actual small model, which IS distinct on every axis:
`grok-build-0.1` (aliases `grok-code-fast-1`, `grok-code-fast`, `grok-code-fast-1-0825`) reports
`context_length` 256000 rather than 500000, half of 4.7's prices, and **no `reasoning_effort`
capability at all**. The `-build-fast` suffix on 4.7 has nothing to do with it.
