---
name: new-component
description: Scaffold a React component following StarterChef conventions
argument-hint: "<ComponentName>"
---

Create a new component at `src/components/<component-name>.tsx`
(kebab-case file, PascalCase export):

1. Read 2–3 existing files in `src/components/` first and match their style.
2. Server component by default — add `"use client"` only if it uses state,
   effects, or browser APIs.
3. Use design tokens only (run `/design-system` if unsure) and `cn()` from
   `@/lib/utils` for conditional classes.
4. Icons from `lucide-react`. Compose with `<Button>` rather than restyling
   raw buttons.
5. If it fetches AI output, call an `api/ai/*` route — never import provider
   SDKs or call `getModel()` from a component.
6. Add a basic test in `tests/` if the component has non-trivial logic.
7. Run `npm run lint` and `npm run typecheck` before finishing.
