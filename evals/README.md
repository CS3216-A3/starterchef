# Evals

A lightweight evaluation pipeline for the AI features — feeds the LLMOps
milestone ("evaluation dataset and strategy") and the model-comparison
milestone (run the same suite against different providers).

## Run

```bash
npm run eval                     # default dataset, current provider
npm run eval -- suggest-recipes  # a single dataset
npm run eval -- assistant        # assistant-quality dataset
npm run eval -- --report         # compare all providers, write JSON report
```

Requires an AI provider key in `.env.local` (see `.env.example`). `AI_PROVIDER`
can be `google`, `openai`, or `google-lite`. The `--report` flag runs the default
recipe dataset against all three providers and writes
`evals/results/text-model-comparison.json` with pass rate, latency, tokens,
and estimated cost per model.

## Adding cases

Datasets are JSONL files in `evals/datasets/`. Each line:

```json
{
  "name": "what this case tests",
  "input": { "ingredients": [...], "equipment": [...], "skillLevel": "beginner" },
  "expect": {
    "maxMissingIngredients": 3,
    "maxPrepPlusCookMinutes": 25,
    "maxDifficulty": "easy",
    "mustNotContain": ["oven"]
  }
}
```

`mustNotContain` is for hard constraints — allergens, missing equipment,
ingredients the user dislikes. These are the safety-critical checks.

## Roadmap

- Kitchen-scan evals need a small image corpus (`evals/images/`) with labelled
  contents — add once the scan pipeline is stable.
- For free-text quality (assistant tone, instruction clarity), add an
  LLM-as-judge pass rather than keyword checks.
