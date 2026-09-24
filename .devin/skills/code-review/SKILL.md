---
name: code-review
description: Self-review a diff before pushing, and triage/fix/reply to PR review comments (Copilot or human)
triggers:
  - user
  - model
---

Two loops: **self-review** before every push, and **PR review triage** after
reviewers (Copilot runs automatically on every PR) have commented.

## 1. Self-review before pushing

Run after `/pre-push-checks` steps 1–5 pass, before `git push`.

1. Sync first: `git fetch && git log --oneline HEAD..origin/main`. If main
   moved, merge it in and re-check anything your diff links to or calls —
   routes, component props, API shapes change under you.
2. Read the whole diff as a reviewer would: `git diff origin/main...HEAD`
   (plus uncommitted changes). Don't review from memory.
3. Walk the checklist below. Fix findings, re-run build/tests, then push.

### Checklist

**Correctness**

- Links/routes match what the target page expects _on current main_
  (e.g. `/cook/[id]` is a **session id**, not a recipe slug).
- Every optional field is handled — no branch silently drops a valid state
  (e.g. treating a snapshot without `slug` as "not in progress").
- Don't infer specific causes from generic codes. If you need to branch on
  a failure reason, emit an explicit code at the source (e.g.
  `SOURCE_UNREADABLE`, not "any `WORKFLOW_FAILED` on a URL draft").
- Resetting/"start over" flows clear all related state — no stale inputs,
  consumed upload IDs, or previous source text left to resubmit.
- Terminal and error states always offer a way forward (retry _and_ an
  exit), including after retry limits are exhausted.

**Data & security**

- Queries go through RLS-bound clients; select only needed columns.
- DB errors surface via `assertQuery`/`safeActionFailure`, not empty data.
- AI output validated with zod schemas; AI changes stay suggest-accept.
- No secrets, tokens, or raw user media in logs or client bundles.

**UI**

- Design tokens only (`/design-system`); tap targets ≥ 40px on mobile.
- Semantic HTML: `<dt>` before `<dd>`, labels tied to inputs, buttons vs
  links used correctly, `aria-*` on progress/live regions.
- No mojibake (`â€™`, `â€¦`) — search the diff for `â€`.

**Hygiene**

- No stray debug code, unused params/imports, or unrelated reformatting.
- Comments explain _why_; existing comments preserved.
- Non-trivial pure logic has a test in `tests/`.

## 2. Triage PR review comments

1. Fetch every comment, including replies and the review summary:

   ```bash
   gh api repos/{owner}/{repo}/pulls/<n>/comments \
     --jq '.[] | "--- id=\(.id) reply_to=\(.in_reply_to_id // "") \(.user.login) \(.path):\(.line // .original_line)\n\(.body)"'
   gh pr view <n> --json reviews --jq '.reviews[].body'
   ```

2. Skip threads that already have a reply from us.
3. For each remaining comment, **verify against the code** (read the cited
   lines and anything they reference) before acting:
   - **Valid** → fix it. If the reviewer's suggested fix is narrower than
     the real problem, fix the real problem.
   - **Not valid / out of scope** → don't change code; reply explaining why
     with a code reference.
4. Re-run `/pre-push-checks`, commit (message: `Address review: …`), push.
   Prefer merging main over rebasing so no force-push is needed.
5. Reply on each thread with the commit SHA and what changed:

   ```bash
   gh api repos/{owner}/{repo}/pulls/<n>/comments/<id>/replies \
     -f body="Fixed in <sha>: …"
   ```

6. Confirm checks are green: `gh pr checks <n>`.
