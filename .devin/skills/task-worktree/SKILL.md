---
name: task-worktree
description: Give every task its own git worktree, branch, and PR — never work in or commit the user's checkout
---

# Skill: Worktree-per-task + PR

Every task that produces code changes gets its **own worktree, branch, and
PR**. The user's checkout is their workspace — treat it as read-only.

## Why

- The user's uncommitted work must never be committed by the agent, and agent
  merges must never be blocked by (or overwrite) a dirty tree.
- Multiple tasks in flight must not share a branch — one PR per task keeps
  reviews and reverts clean.
- `main` is protected; everything lands via PR anyway.

## Setup

```bash
git fetch origin main
git worktree add ../starterchef-<slug> -b <type>/<slug> origin/main
```

- `<type>/<slug>` — e.g. `feat/prep-screen`, `fix/rate-limit-shape`,
  `chore/robots-disallow`.
- The worktree lacks gitignored files, so before verifying:
  - copy env files: `cp .env* ../starterchef-<slug>/`
  - install deps: `npm ci` inside the worktree (`node_modules` is not shared).

## Work

- Do all edits and commits **inside the worktree**, never in the user's
  checkout.
- In the worktree, only commit files the task changed — review `git status`
  before staging; the tree should only contain your changes.
- If the task builds on an unmerged branch, branch off that branch instead of
  `origin/main` and note the dependency in the PR body.
- Run `/pre-push-checks` (format, lint, typecheck, test, **build**) in the
  worktree before pushing.

## Ship

```bash
git push -u origin <type>/<slug>
gh pr create --title "..." --body "..."
```

- One PR per task. Keep PRs small enough to review in one sitting — split
  unrelated fixes into separate worktrees/PRs rather than batching.
- Confirm CI green after pushing (see `/pre-push-checks` step 9).

## Cleanup

After the PR merges:

```bash
git worktree remove ../starterchef-<slug>
git branch -d <type>/<slug>
```

## Exceptions

- Read-only exploration and one-line fixes the user explicitly wants applied
  in place may stay in their checkout.
- If the user's tree is dirty (`git status` shows unrelated changes), that is
  a hard signal to use a worktree — never `git add -A` over their work.
