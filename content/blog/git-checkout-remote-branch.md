---
title: "Git Checkout a Remote Branch"
description: "How to check out a remote Git branch that does not exist locally yet: fetch, then create a local branch that tracks origin. A name by itself is not enough."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["Git", "Checkout", "Remote", ".NET"]
related:
  - git-merge-vs-rebase
  - docker-dotnet-angular-local
  - freelance-dotnet-project-checklist
faq:
  - q: "How do I check out a branch that exists only on the remote?"
    a: "Fetch first so your machine knows the branch exists. Then git switch -c name origin/name, or git switch name if your Git version already matches the remote name to a tracking branch."
  - q: "Why does git checkout feature fail when I can see the branch on GitHub?"
    a: "Your local repo has not fetched it, or the local name does not match. GitHub showing the branch does not put it on your disk. git fetch origin, then switch."
  - q: "What is a detached HEAD after checkout?"
    a: "You checked out the remote ref itself, origin/feature, instead of a local branch. Commits you make there are easy to lose. Create a local branch before you commit."
---

The branch is on the server. Your laptop does not have it until you fetch. Checkout is the local name you then work on, tied to that remote branch so pull and push know where to go.

This is not merge versus rebase. That choice is [git merge vs rebase](/blog/git-merge-vs-rebase). Hub: [Architecture](/learning/architecture).

## Real-world analogy

The office has a folder with today's drawings. You can read it over someone's shoulder, which is checking out `origin/feature` and ending up detached. Or you take a copy, put your name on it, and write on the copy. That copy is your local branch. Push sends your copy back. Reading over the shoulder and then writing in the margin is how a commit disappears the next time you switch away.

## Worked example

A teammate pushes `feature/invoices`. You run `git checkout feature/invoices`. Git says the path does not match any file, or it offers to create a branch and then complains it cannot see a start point. `git branch -a` does not list `origin/feature/invoices`. The remote on GitHub is ahead of your last fetch. `git fetch origin` downloads the ref. `git switch -c feature/invoices origin/feature/invoices` creates your local branch at that commit and sets upstream to `origin/feature/invoices`. `git status` says "Your branch is up to date with 'origin/feature/invoices'." Now pull and push have a destination.

| Command | What you get |
|---|---|
| `git fetch origin` | The remote branch names, no local work branch yet |
| `git switch feature/invoices` | Works when Git can match one remote branch of that name |
| `git switch -c feature/invoices origin/feature/invoices` | A local branch you can commit on, tracking the remote |
| `git switch origin/feature/invoices` | Detached HEAD. Do not commit here |

## Code

```bash
git fetch origin
git switch -c feature/invoices origin/feature/invoices
```

If the branch was fetched before and Git already knows the name:

```bash
git fetch origin
git switch feature/invoices
```

Confirm the tracking link:

```bash
git status -sb
```

You want `## feature/invoices...origin/feature/invoices`. If the second half is missing, the next push will ask you where to send it. Set it once:

```bash
git branch -u origin/feature/invoices
```

Do not commit while `git status` says "HEAD detached." Switch to a named branch first, then commit. The same fetch-then-switch is what you want before a container build that must use a review branch: [Docker with Angular](/blog/docker-dotnet-angular-local).
