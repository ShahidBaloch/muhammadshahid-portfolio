---
title: "Git Checkout Remote Branch: git switch and Tracking"
description: "How to check out a remote Git branch: fetch refs, create local tracking branches with git switch, recover from detached HEAD, and prune branches."
date: "2026-09-18"
updated: "2026-10-03"
category: "devops"
tags: ["Git", "Checkout", "Remote", "DevOps", "Workflow"]
related:
  - git-merge-vs-rebase
  - docker-dotnet-angular-local
  - freelance-dotnet-project-checklist
faq:
  - q: "What is the modern Git command to check out a remote branch?"
    a: "Run 'git fetch origin' to download the latest remote refs, followed by 'git switch <branch-name>'. Modern Git automatically detects origin/<branch-name> and creates a matching local tracking branch."
  - q: "Why does 'git checkout <branch>' say 'error: pathspec did not match any file'?"
    a: "Your local Git repository index is unaware that the branch was created on the remote server (e.g. GitHub/GitLab). Run 'git fetch origin' first to update your local remote tracking references."
  - q: "What causes a 'Detached HEAD' state and how do I fix it?"
    a: "Detached HEAD occurs when you check out a commit SHA or a direct remote pointer ('git switch origin/feature') instead of a named local branch. Any commits created in detached HEAD can be lost. Fix it by running 'git switch -c <my-new-branch>' before switching away."
  - q: "How do I remove local references to branches that were deleted on GitHub?"
    a: "Run 'git fetch origin --prune' (or 'git remote prune origin'). This cleans up stale local tracking references (origin/old-feature) without deleting your unmerged local branches."
---

**Checking out a remote Git branch** creates a local branch on your developer workstation that tracks a corresponding branch on the remote server (`origin`). Understanding the difference between remote tracking references (`origin/feature`), local branches (`feature`), and `HEAD` prevents accidental lost commits and detached HEAD states.

```text
Remote Server (GitHub / GitLab):
  └── origin/feature/payments ──(git fetch origin)──► Local Repo (.git/refs/remotes/origin/...)
                                                            │
                                                            ▼ (git switch feature/payments)
                                                      Local Working Tree:
                                                        └── feature/payments [tracks origin]
```

**New to this** → start with [The standard 2-step workflow](#the-standard-2-step-workflow). **Detached HEAD recovery** → [Fixing detached HEAD](#recovering-from-a-detached-head-state). **Merge vs Rebase** → [Git merge vs rebase guide](/blog/git-merge-vs-rebase). **Interview prep** → [If an interviewer asks](#if-an-interviewer-asks).

## Real-world analogy

Imagine a central company whiteboard (`GitHub`). A colleague writes down a new project plan under `origin/feature-auth`.
- If you never look at the whiteboard (`git fetch`), your notebook won't know the project exists.
- If you read the whiteboard and transcribe it directly into your personal notebook (`git switch feature-auth`), you have a local working copy you can safely edit and annotate.
- If you try to write directly on the glass over your colleague's shoulder (`git checkout origin/feature-auth`), you enter a "Detached HEAD" state: the moment someone walks past and wipes the glass, your unstored notes are gone.

## The standard 2-step workflow

Modern Git (version 2.23+) split the overloaded `git checkout` command into `git switch` (for branches) and `git restore` (for files).

### Step 1: Fetch remote refs from origin

```bash
git fetch origin
```

This synchronizes your local repository's knowledge of all remote branches, tags, and commits without touching your current working directory or modifying your uncommitted local files.

### Step 2: Switch to the branch

```bash
# Modern syntax (Recommended):
git switch feature/invoices

# If you are using legacy Git (<2.23):
git checkout feature/invoices
```

If `feature/invoices` exists in exactly one remote (`origin/feature/invoices`) and does not exist locally yet, Git automatically:
1. Creates a local branch named `feature/invoices`.
2. Points it to the same commit as `origin/feature/invoices`.
3. Sets up upstream tracking so `git pull` and `git push` work automatically.

## Checking out with a custom local name or explicit upstream

If you want your local branch to have a different name than the remote branch:

```bash
# Creates local branch 'my-invoices' tracking 'origin/feature/invoices'
git switch -c my-invoices --track origin/feature/invoices

# Verify upstream tracking link
git status -sb
# Output: ## my-invoices...origin/feature/invoices
```

If a local branch already exists but lost its upstream tracking link:

```bash
git branch -u origin/feature/invoices
```

## Recovering from a "Detached HEAD" state

If you accidentally run:

```bash
git checkout origin/feature/invoices   # ❌ Enters Detached HEAD state
```

Git will warn: `You are in 'detached HEAD' state. You can look around, make experimental changes...`

### If you made commits in Detached HEAD and want to save them:
Do **not** switch back to `main` yet! Run:

```bash
# 1. Create a new branch pointing to your current detached commit
git switch -c feature/saved-work

# 2. Push to origin
git push -u origin feature/saved-work
```

### If you already switched away and lost your commits:
Retrieve the commit hash using the Git reference log (`git reflog`):

```bash
git reflog
# Look for the commit: "e4a19b2 HEAD@{1}: commit: Added invoice calculations"

# Restore into a new branch:
git switch -c feature/recovered-work e4a19b2
```

## Pruning deleted remote branches

When pull requests are merged and deleted on GitHub, your local machine still keeps stale `origin/feature` references. Clean them with:

```bash
git fetch --prune origin
```

To configure Git to prune deleted branches automatically on every fetch:

```bash
git config --global fetch.prune true
```

## Common mistakes and pitfalls

- **Running `git checkout feature` without fetching first**: If a teammate pushed a new branch 5 minutes ago, local Git will return `error: pathspec 'feature' did not match any file(s) known to git`. Always run `git fetch origin` first.
- **Committing directly in Detached HEAD**: Making commits while detached and then running `git checkout main` leaves those commits dangling without a branch reference, subjecting them to eventual Git garbage collection (`git gc`).
- **Name collision between branch name and file path**: In legacy `git checkout`, if a folder is named `api` and a branch is named `api`, running `git checkout api` can restore files instead of switching branches. `git switch api` avoids this ambiguity completely.

## If an interviewer asks

**30-second answer:** To check out a remote branch, run `git fetch origin` to update local tracking references, followed by `git switch <branch-name>`. Modern Git automatically creates the local branch and configures upstream tracking. Never commit directly to `origin/<branch>` as it enters a detached HEAD state.

**Strong answer:** In modern team workflows, we use `git switch` to separate branch management from file restoration. We configure `fetch.prune = true` globally so deleted remote branches are cleaned up automatically. When developers encounter detached HEAD states, we recover unreferenced commits using `git reflog` and bind them to a named branch using `git switch -c <branch> <commit-hash>`.
