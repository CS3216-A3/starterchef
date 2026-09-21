# Milestone evidence map

Where the graded deliverables live in this repo, so nothing has to be
retrofitted at submission time. Full writeup goes in
`group-<n>-milestones.pdf` (submitted + committed at the end).

| Milestone                                     | Where the evidence lives                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Prompt engineering                            | `prompts/*.md` — versioned, diff-able                                                        |
| Model choice vs ≥2 alternatives               | `npm run eval` under different `AI_PROVIDER`s; record pass rate + tokens                     |
| AI patterns (structured output, tool calling) | `src/lib/ai/schemas/`, `src/lib/ai/tools.ts`                                                 |
| LLMOps / evaluation                           | `evals/` datasets + `npm run eval` output                                                    |
| Production optimization                       | `ai_call` JSON logs (latency, tokens) → `ai_calls` table                                     |
| Safety & security                             | input zod validation on routes, output schema validation, RLS policies, rate limiting (TODO) |
| Landing page + SEO/OG                         | `src/app/(marketing)/`                                                                       |
| Analytics                                     | `src/components/analytics.tsx` (PostHog)                                                     |
| Loop engineering                              | this file, `AGENTS.md`, `.devin/skills/`, CI, tests                                          |

## Open items to schedule early

- Analytics must be embedded _early_ — reports lag by days.
- Model comparison needs real runs — don't leave it to the last week.
- Rate limiting on `/api/ai/*` (safety milestone) — e.g. Upstash or a simple
  per-user counter in Supabase.
