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
- When you change a prompt, run `npm run eval` and note the result in the commit
  message or the milestones writeup.
