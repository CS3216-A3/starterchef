# AI evaluation

This directory contains the repeatable evidence for Milestone 11. The suite
tests the same prompts, schemas and recommendation safety gates used by the
production application.

## What is evaluated

### Catalogue recommendations

`datasets/recommendations.jsonl` contains six synthetic user situations. They
cover pantry fit, allergy exclusion, dietary restrictions, equipment, skill,
time and household size.

The scorer checks two layers:

1. The deterministic safety filter must produce exactly the labelled eligible
   recipe IDs before the model is called.
2. The model must return only supplied IDs, return no duplicates, rank an
   acceptable best match first and ground its reason in candidate data.

This mirrors the production architecture: unsafe or ineligible recipes never
reach the model, and the model can only rank an allowlisted catalogue.

### In-cooking assistant

`datasets/assistant.jsonl` contains eight situations covering substitution,
troubleshooting, food safety, timers, step navigation, repetition, allergies
and cross-session memory.

The scorer checks concise answers, required and forbidden content, structured
action type, timer duration and navigation target.

## Run the suite

The deterministic recommendation checks do not require an API key:

```bash
npm run eval -- recommendations --offline
```

Live evaluation requires the selected provider key in `.env.local`:

```bash
AI_PROVIDER=google EVAL_RUNS=3 npm run eval -- all
```

For a provider with a low requests-per-minute quota, pace request starts. A
5-second interval sends at most 12 request starts per minute:

```bash
AI_PROVIDER=google-lite EVAL_DELAY_MS=5000 EVAL_RUNS=3 npm run eval -- all
```

Use three runs per case for final evidence because model output can vary. A
single run is useful during development:

```bash
npm run eval -- recommendations
npm run eval -- assistant
```

Compare every configured provider with:

```bash
EVAL_RUNS=3 npm run eval -- --report
```

Reports are written to `evals/results/` and contain case-level outputs,
failure reasons, pass rate, safety pass rate, average and p95 latency, token
usage and estimated cost. The directory is ignored because these are generated
artifacts; copy the final measured figures and representative examples into the
milestone report.

## Acceptance targets

- 100% pass rate on safety-critical cases.
- 100% schema validity and recommendation ID grounding.
- At least 85% overall case pass rate across three runs.
- Record average and p95 latency, rather than judging quality by pass rate
  alone.
- Record token use and estimated cost so a quality improvement can be weighed
  against production cost.

Any failed safety case blocks release. Other failures should lead to a prompt,
schema or deterministic-guard change, followed by the same suite again. The
write-up should include a before/after example and the development decision it
caused.

## Remaining visual evaluation

Kitchen scanning and camera step checks require a labelled image corpus. For
the final report, collect at least five consented test images with different
lighting, clutter and partial visibility. Label visible items or the expected
step verdict before running the model, then report precision/recall and false
positives separately. Do not use personal photos without permission.
