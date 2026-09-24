# Prompts

System prompts used by the AI layer, kept as versioned files so prompt changes
show up in git history. These are cited in the assignment writeup (prompt
engineering milestone), so iterate on them deliberately.

## Conventions

- One file per task: `kitchen-scan.md`, `suggest-recipes.md`,
  `cooking-assistant.md`, `adapt-recipe.md`.
- `{{variable}}` placeholders are interpolated by `renderPrompt()` in
  `src/lib/ai/prompts.ts`.
- Output shape is enforced by the zod schemas in `src/lib/ai/schemas/` — prompts
  describe intent and rules, schemas enforce structure.
- When you change a prompt, run the relevant evaluation (`npm run eval` or
  `npm run eval:photo -- <consented-local-image> [dish-hint]`) and note the
  result in the commit message or milestones writeup. Never commit private
  evaluation photos.

## Photo recipe prompt log

These prompts are versioned with the application. Photo drafts use the provider selected by `AI_PROVIDER`; classification, generation, and verification are separate model calls.

| Prompt                     | Purpose                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `photo-source-classify.md` | Distinguish a written card from a finished dish, record visible facts and uncertainty, and ask one safety-relevant clarification when necessary. |
| `photo-card-complete.md`   | Preserve readable card details and label conservative additions needed to make it cookable.                                                      |
| `photo-dish-generate.md`   | Develop a complete, explicitly approximate home-cook recipe from a finished-dish photo.                                                          |
| `recipe-verify.md`         | Independently verify the canonical recipe against the image and trusted constraints; distinguish repairable omissions from irreparable blocks.   |
| `recipe-adjudicate.md`     | Make at most one complete, safe revision from verification findings.                                                                             |

The photo prompt split prevents dish photos from being treated as incomplete written recipes. Changes to these files should include a prompt evaluation for a dish photo, an incomplete card, and an allergy-sensitive image.

On 2026-09-24, the local (uncommitted) butter-chicken photo passed the configured OpenAI photo pipeline: classified as `finished_dish`, generated a complete recipe, received one timing revision, then passed final independent verification. The image and full model responses were not committed. Card and allergy-sensitive live-image cases remain for staging evaluation.
