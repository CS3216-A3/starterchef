# Milestone evidence map

Where the graded deliverables live in this repo, so nothing has to be
retrofitted at submission time. Full writeup goes in
`group-<n>-milestones.pdf` (submitted + committed at the end).

| Milestone                                     | Where the evidence lives                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt engineering                            | `prompts/*.md` — versioned, diff-able                                                                                                                                                                               |
| Model choice vs ≥2 alternatives               | Text/vision: `npm run eval -- --report` writes `evals/results/text-model-comparison.json`. Voice: switch `NEXT_PUBLIC_VOICE_PROVIDER`; browser console emits `voice_session` metrics. See "Model comparison" below. |
| AI patterns (structured output, tool calling) | `src/lib/ai/schemas/`, `src/lib/ai/tools.ts`                                                                                                                                                                        |
| LLMOps / evaluation                           | `evals/` datasets + `npm run eval` output                                                                                                                                                                           |
| Production optimization                       | `ai_call` JSON logs (latency, tokens) → `ai_calls` table                                                                                                                                                            |
| Safety & security                             | input zod validation on routes, output schema validation, RLS policies, rate limiting (TODO)                                                                                                                        |
| Landing page + SEO/OG                         | `src/app/(marketing)/`                                                                                                                                                                                              |
| Analytics                                     | `src/components/analytics.tsx` (PostHog)                                                                                                                                                                            |
| Loop engineering                              | this file, `AGENTS.md`, `.devin/skills/`, CI, tests                                                                                                                                                                 |

## Model comparison

### Text + vision candidates

| Role          | Provider alias | Env var / default model                   | Why                                                                            |
| ------------- | -------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| Primary       | Google         | `GOOGLE_MODEL=gemini-5.8-flash`           | Latest Flash tier; handles text and kitchen-scan vision in one call.           |
| Alternative 1 | OpenAI         | `OPENAI_MODEL=gpt-5.6-luna`               | Strong structured output and ecosystem; benchmark for recipe schema adherence. |
| Alternative 2 | Google Lite    | `GOOGLE_LITE_MODEL=gemini-3.5-flash-lite` | Google's fastest / cheapest Flash option; good baseline for cost/latency.      |

Run the comparison:

```bash
npm run eval -- --report
```

This writes `evals/results/text-model-comparison.json` with pass rate, average latency, tokens, and estimated cost per model. Single-provider runs still work:

```bash
AI_PROVIDER=google      npm run eval
AI_PROVIDER=openai      npm run eval
AI_PROVIDER=google-lite npm run eval
```

Fixed parameters for the comparison: `temperature=0.4`, `topP=0.95`, `maxTokens=2048` for recipe/scan tasks; `temperature=0.7` for assistant Q&A.

### Live voice candidates

| Role          | Provider        | Default model           | Architecture                                                                                                      |
| ------------- | --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Primary       | Gemini Live     | `gemini-3.8-live`       | Native audio (and optional video) over WebSocket.                                                                 |
| Alternative 1 | OpenAI Realtime | `gpt-realtime-2.1-mini` | Native audio over WebRTC; lowest-latency native option.                                                           |
| Alternative 2 | Web Speech      | selected text model     | Browser STT → `/api/ai/assistant` → browser TTS. Mirrors the “generate text, then STT/TTS” Claude-style pipeline. |

Test each voice path by setting `NEXT_PUBLIC_VOICE_PROVIDER` and checking the browser console for `voice_session` JSON logs:

```bash
NEXT_PUBLIC_VOICE_PROVIDER=web-speech npm run dev
NEXT_PUBLIC_VOICE_PROVIDER=openai     npm run dev
NEXT_PUBLIC_VOICE_PROVIDER=gemini     npm run dev
```

Use `NEXT_PUBLIC_VOICE_SIMULATE=true` to exercise the UI and metrics without spending API credits.

### Recording the results

Fill in the measured numbers from `evals/results/text-model-comparison.json` and the browser console logs before the final submission writeup. Update `evals/costs.ts` if provider pricing changes.
