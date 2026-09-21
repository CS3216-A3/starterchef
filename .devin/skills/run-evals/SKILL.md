---
name: run-evals
description: Run the AI eval suite and report results per prompt/provider
allowed-tools:
  - read
  - exec
  - grep
  - glob
permissions:
  allow:
    - Exec(npm run eval)
---

Run the AI evaluation suite and report results:

1. Check `.env.local` has an `AI_PROVIDER` and matching API key. If not, tell
   the user which env var to set and stop.
2. Run `npm run eval` (optionally `npm run eval -- <dataset>` for one dataset).
3. Report: provider/model used, cases passed/failed, and for each failure the
   case name and which expectation failed.
4. If failures look prompt-related, suggest which file in `prompts/` to change,
   but do not edit prompts without the user's go-ahead — prompt changes are
   tracked for the assignment writeup.
5. To compare providers for the model-selection milestone: run the suite once
   per `AI_PROVIDER` value and tabulate pass rates + token usage.
