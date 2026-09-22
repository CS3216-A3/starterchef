# Milestone evidence map

Where the graded deliverables live in this repo, so nothing has to be
retrofitted at submission time. Full writeup goes in
`group-<n>-milestones.pdf` (submitted + committed at the end).

| Milestone                                     | Where the evidence lives                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt engineering                            | `prompts/*.md` — versioned, diff-able                                                                                                                                                                               |
| Model choice vs ≥2 alternatives               | Text/vision: `npm run eval -- --report` writes `evals/results/text-model-comparison.json`. Voice: switch `NEXT_PUBLIC_VOICE_PROVIDER`; browser console emits `voice_session` metrics. See "Model comparison" below. |
| AI patterns (structured output, tool calling) | `src/lib/ai/schemas/`, `src/lib/ai/tools.ts`, `src/app/api/ai/import-recipe/`                                                                                                                                       |
| LLMOps / evaluation                           | `evals/` datasets + `npm run eval` output                                                                                                                                                                           |
| Production optimization                       | `ai_call` JSON logs (latency, tokens) → `ai_calls` table                                                                                                                                                            |
| Safety & security                             | input zod validation on routes, output schema validation, RLS policies, rate limiting (TODO)                                                                                                                        |
| Landing page + SEO/OG                         | `src/app/(marketing)/`                                                                                                                                                                                              |
| Recipe import & personalisation               | `src/app/(app)/recipes/import/`, `src/app/(app)/recipes/[id]/edit/`, `src/app/api/ai/import-recipe/`, `supabase/migrations/0007_user_recipes.sql`, `src/components/cook-buttons.tsx` feedback flow                  |
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

## Recipe import & personalisation

### Import sources

| Source               | Status      | Where it lives                                                                                                           |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pasted text          | Implemented | `/recipes/import` → `POST /api/ai/import-recipe` (`source: "text"`)                                                      |
| Recipe URL           | Implemented | `/recipes/import` → `POST /api/ai/import-recipe` (`source: "url"`) using `recipe-scrapers` for JSON-LD/schema extraction |
| Photo of recipe card | Implemented | `/recipes/import` → `POST /api/ai/import-recipe` (`source: "photo"`) with image input                                    |
| Cooking video        | Implemented | `/recipes/import` tab accepts a short video upload; backend passes it to Gemini as a file input.                         |

### Data model

- `recipes.user_id` — NULL for the shared catalogue, set for imported/personalised recipes.
- `recipes.parent_recipe_id` + `recipes.is_personalized` — version chain for personalised copies.
- `recipes.source_url` — original URL, surfaced on the recipe overview.
- `recipes.image_url` — hero photo from the import source or a user upload (`recipe-images` storage bucket).
- `recipes.steps[].photoUrl` — per-step photos taken while cooking.
- `recipe_feedback` — substitutions, equipment work-arounds, scaled servings, notes and rating captured after cooking. `session_id` links the row to its cooking session; `learned` jsonb receives the AI recap's durable insights.
- `cooking_sessions.recipe_id` + `cooking_sessions.summary` — recipe link and the AI-generated post-cook recap (`{summary, insights, struggledSteps}`).
- `session_events` — append-only timeline of everything that happens while cooking: `session_started`, `step_entered`, `qa` (text or voice), `photo_check` (verdict + feedback + photo URL), `photo_upload`, `feedback`. Insert policy requires owning the session.

### User flows

1. **Import**: User pastes text/link/photo/video → AI returns structured preview → user saves to their library.
2. **Overview**: `/recipes/[id]` shows hero image (or a designed placeholder), ingredients, equipment and steps, plus a "Customise with StarterChef" chat that adapts the recipe via `POST /api/ai/edit-recipe` and saves an accepted suggestion as a personalised copy. Owners can delete their recipe from the overview or edit page.
3. **Edit**: `/recipes/[id]/edit` lets the owner fix ingredients, steps, servings, equipment and the cover image before cooking — or ask StarterChef to edit via the tool-driven route (`POST /api/ai/edit-recipe`): the model mutates a server-side working copy through constrained tools (`updateMeta`, `setIngredients`, `updateStep`, `addStep`, `removeStep`), so edits always produce a valid recipe.
4. **Cook**: `/cook/[id]` resolves by slug or by recipe id; users can attach their own photo to any step (stored on the recipe for owned recipes, on the session snapshot for catalogue ones), ask questions by text or voice, and share a camera checkpoint (`POST /api/ai/step-check`) for practical feedback on whether their result looks right.
5. **Personalise**: On the last step, the "Finish cooking" button opens a feedback form; saving creates `My <title>` as a personalised child recipe and writes a `recipe_feedback` row.
6. **Filter**: The time/servings/skill pills on `/today` write URL params (`?time=&servings=&skill=`) and filter the ideas list server-side. Servings/skill default to the user's profile (household size, skill level) when no param is set.
7. **Onboarding**: New users land on `/onboarding` (redirected from `/today` until `profiles.onboarded_at` is set) — profile + household size, dietary needs, an optional first kitchen scan, and an optional first recipe import.
8. **Images**: URL imports keep the source hero image (`recipes.image_url`, `recipe-images` bucket); missing images render a deterministic illustrated placeholder. The adapt chat shows a "View changes" modal comparing the adapted recipe before the user applies it.
9. **Session memory**: every AI interaction during cooking is appended to `session_events` server-side (Q&A incl. voice, camera checkpoints with the photo, step navigation, photos, feedback). Finishing a session runs `session-recap` → recap + durable insights stored on the session and folded into `recipe_feedback.learned`.
10. **Review**: `/recipes/[id]` shows "Your cooking history" (per-session recap + insight chips); `/sessions/[id]` renders the full timeline — questions asked, checkpoint verdicts with photos, step progression, feedback.
11. **Cross-session memory**: `getCookingMemory()` distills recent photo-check fixes, substitutions, equipment work-arounds and user notes into facts injected into the cooking-assistant prompt, so the agent remembers how the user cooks between sessions.
