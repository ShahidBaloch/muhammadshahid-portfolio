---
title: "Git Merge vs Rebase: Workflows, History, and Clean PRs"
description: "Git merge vs git rebase in enterprise teams: 3-way merge commits vs linear history, interactive squashing (git rebase -i), conflict resolution, and the golden rule of rebasing."
date: "2026-09-18"
updated: "2026-10-03"
category: "devops"
tags: ["Git", "Rebase", "Merge", "DevOps", "Workflow", "Architecture"]
related:
  - git-checkout-remote-branch
  - docker-dotnet-angular-local
  - freelance-dotnet-project-checklist
faq:
  - q: "What is the key difference between git merge and git rebase?"
    a: "git merge creates a new 3-way merge commit that ties two distinct branch histories together, preserving the exact historical timeline. git rebase lifts your branch's commits and replays them one by one on top of the target branch, creating a completely linear history with new commit SHAs."
  - q: "What is the Golden Rule of Git Rebasing?"
    a: "Never rebase a shared or public branch (such as main, release, or a branch actively shared by multiple developers). Rebasing rewrites commit SHAs; when teammates attempt to pull or push to a rebased shared branch, Git will encounter divergent histories and duplicated commits."
  - q: "Why should I use --force-with-lease instead of --force after rebasing?"
    a: "git push --force blindly overwrites the remote branch even if a teammate pushed new commits. --force-with-lease checks whether your local tracking ref matches the remote before pushing, aborting if someone else pushed changes you have not yet fetched."
  - q: "How do I abort a broken or confusing rebase?"
    a: "Run 'git rebase --abort'. This immediately terminates the rebase process and restores your working tree and branch HEAD to the exact state before you initiated the rebase."
---

**Git merge vs git rebase** is the foundational workflow decision in version control: **preserve the exact chronological history with merge commits** or **rewrite commit history into a clean, linear timeline**.

```text
Starting State:
main:    A ──► B ──► C
               │
feature:       └──► D ──► E

Result of git merge main:
main:    A ──► B ──► C ────────────┐
               │                   ▼
feature:       └──► D ──► E ──► M (Merge commit)

Result of git rebase main:
main:    A ──► B ──► C
                       └──► D' ──► E' (Linear replay, new SHAs)
```

**New to this** → start with [Merge vs Rebase side-by-side](#merge-vs-rebase-side-by-side). **Interactive squashing** → [Interactive rebase guide](#interactive-rebasing-cleaning-commits-before-pr). **Branch management** → [Checkout remote branches](/blog/git-checkout-remote-branch). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

- **Git Merge**: Two highway lanes converging at a toll booth. You can clearly see where your road joined the main highway, and the toll booth ticket (`Merge Commit`) records the exact timestamp when the two roads merged.
- **Git Rebase**: Moving your highway on-ramp 5 miles further down the interstate. It looks like you entered the highway after the latest construction project was already completed, creating a smooth, straight driving line.

Rebasing your personal car's route is fine. Demolishing and moving the public interstate on-ramp while other drivers are currently driving on it is the disaster of rebasing a shared public branch.

## Merge vs Rebase side-by-side

| Aspect | `git merge` | `git rebase` |
|---|---|---|
| **History Style** | Non-linear with diamond graphs & merge commits | Purely linear, chronological commit log |
| **Commit SHAs** | Original commit SHAs are preserved intact | New commit SHAs generated for all replayed commits |
| **Conflict Resolution** | Resolved **once** inside the resulting merge commit | Resolved **per commit** as each commit is replayed |
| **Safe for Shared Branches** | **Yes** (Never corrupts teammates' histories) | **No** (Violates the Golden Rule of Rebasing) |
| **Bisect & Debugging** | Complex due to criss-cross merge commits | Extremely fast and clean with `git bisect` |

## When to use git merge

Use `git merge` when:
1. Merging a completed, approved feature branch into `main` or `develop`.
2. Working on a collaborative feature branch shared between multiple engineers.
3. Your team prioritizes preserving the exact historical truth of when features branched off.

```bash
# Merging main into your feature branch to pull latest changes:
git switch feature/payments
git fetch origin
git merge origin/main
git push origin feature/payments
```

## When to use git rebase

Use `git rebase` when:
1. Pulling the latest changes from `main` into your private, local feature branch before opening a PR.
2. Cleaning up "WIP", "fix typo", or "debug test" commits into meaningful units using interactive rebase.
3. Maintaining a clean, linear git history that makes `git log --oneline` easy to read in production audits.

```bash
# Rebasing your local feature branch on top of main:
git switch feature/payments
git fetch origin
git rebase origin/main

# Push updated rebased commits to your remote branch:
git push --force-with-lease origin feature/payments
```

## Interactive Rebasing: cleaning commits before PR

Before requesting a senior engineer review your pull request, condense your messy local commit history using interactive rebase:

```bash
# Rebase the last 4 commits on your current branch
git rebase -i HEAD~4
```

Git opens an editor with options:

```text
pick e4a19b2 Add payment DTOs and validation
squash 9f1b3c4 Fix typo in validation attribute
squash 3a4c5e6 Fix unit test failure
pick 7d8e9f0 Add Stripe gateway integration
```

### Common interactive commands:
- `pick`: Use commit as-is.
- `reword`: Change the commit message.
- `squash` (or `s`): Melds the commit into the previous commit and prompts for a combined message.
- `fixup` (or `f`): Melds into previous commit and discards this commit's log message.
- `drop` (or `d`): Deletes the commit entirely.

## Resolving conflicts during a rebase

If a rebase encounters a merge conflict:

```bash
# 1. Check which files have conflict markers
git status

# 2. Edit the conflicting files and resolve markers (<<<<<<< HEAD)
# 3. Stage the resolved files:
git add src/Services/PaymentService.cs

# 4. Continue the rebase (do NOT run git commit!):
git rebase --continue

# If the rebase gets stuck or you want to start over:
git rebase --abort
```

## GitHub Pull Request Merge Strategies

When clicking "Merge" on GitHub/GitLab, understanding the 3 strategies aligns with team culture:

1. **Create a Merge Commit (`--no-ff`)**: Preserves all individual feature commits plus a merge commit. Ideal for large enterprise releases.
2. **Squash and Merge**: Condenses all 15 commits in the PR into a single clean commit on `main`. Great for small bug fixes and fast-moving teams.
3. **Rebase and Merge**: Replays PR commits directly onto `main` with fast-forward. Retains individual commits while keeping `main` strictly linear.

## Common mistakes and pitfalls

- **Running `git push --force` instead of `--force-with-lease`**: If a teammate pushed a commit to your branch while you were rebasing, `--force` will delete their work forever. `--force-with-lease` aborts if the remote was updated.
- **Rebasing `main` onto a feature branch**: Never run `git switch main && git rebase feature`. Always rebase the feature branch onto `main`.
- **Committing during conflict resolution**: When fixing rebase conflicts, run `git add <file>` followed by `git rebase --continue`. Running `git commit` creates an unintended extra commit that interrupts the rebase sequence.

## If an interviewer asks

**30-second answer:** `git merge` joins two branches by creating a merge commit, preserving the exact historical branching graph. `git rebase` lifts and replays your branch's commits on top of the target branch, producing a clean, linear history. We use rebase on local feature branches before opening PRs, but never rebase shared public branches.

**Strong answer:** In production enterprise environments, the choice between merge and rebase is governed by the Golden Rule of Rebasing: only rewrite private, unshared history. We leverage `git rebase -i` to clean up messy local WIP commits before code review, and always use `git push --force-with-lease` to guard against overwriting teammates' remote pushes. On trunk (`main`), we configure GitHub branch protection to enforce "Squash and Merge" or "Rebase and Merge" to ensure `git log` and `git bisect` remain fast and readable.
