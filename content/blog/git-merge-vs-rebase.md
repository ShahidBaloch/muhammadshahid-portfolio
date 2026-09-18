---
title: "Git Merge vs Rebase"
description: "Git merge vs rebase for a feature branch: merge keeps the join, rebase replays your commits on the new base. Do not rebase a branch other people have already pulled."
date: "2026-09-18"
updated: "2026-09-18"
category: "architecture"
tags: ["Git", "Rebase", "Merge", ".NET"]
related:
  - docker-dotnet-angular-local
  - freelance-dotnet-project-checklist
  - modular-monolith-vs-microservices-dotnet
faq:
  - q: "What is the difference between git merge and git rebase?"
    a: "Merge adds a commit that joins two lines of history. Rebase copies your commits onto the tip of the other branch, so the history looks like you started from today's main. The file result can be the same. The history is not."
  - q: "When should I rebase?"
    a: "On a branch only you are using, before you open or update a pull request, so the review is your commits on top of current main. Do not rebase after someone else has pulled that branch."
  - q: "Does rebase lose the work?"
    a: "It drops the old commit ids, not the changes, if the replay finishes. A conflict stops the rebase until you fix it or abort. The old tip is still in the reflog for a while if you need it back."
---

Merge joins two histories and leaves the join visible. Rebase moves your commits onto a new base and leaves a straight line. Use merge when the branch is shared. Use rebase when the branch is still yours.

Hub: [Architecture](/learning/architecture). Shipping the same branch in a container is a separate step: [Docker with Angular](/blog/docker-dotnet-angular-local).

## Real-world analogy

Merge is two roads meeting at a junction. You can still see that your trip left the highway and came back. Rebase is the city moving your exit so it now leaves from the new stretch of highway. The drive looks like you were on the new road the whole time. Fine if your car was the only one using that exit. Bad if a friend was already following the old exit and you delete the ramp under them.

## Worked example

`main` moved on Monday with a fix in `OrderService`. Your branch `feature/invoices` has two commits from Friday. You run `git merge main`. The history shows a merge commit. The pull request lists your two commits plus the merge, and the reviewer can see you integrated Monday's fix.

The other day you run `git rebase main` instead, before anyone else has the branch. Your two commits are replayed on top of Monday. The pull request is two commits, no merge bubble. Then you `git push --force-with-lease`. A teammate who had already pulled `feature/invoices` now has the old commit ids. Their next push is rejected, or worse, they merge the old ids back in and the commits appear twice. That is the case for merge, not rebase.

| | Merge | Rebase |
|---|---|---|
| Shared branch | Yes | No |
| History | Keeps both parents | Straight line of new commit ids |
| Conflicts | Once, in the merge commit | Once per replayed commit |
| After others have pulled | Safe | Rewrites what they have |

## Code

Update local `main`, then pick one.

```bash
git fetch origin
git switch main
git pull

git switch feature/invoices
git merge main
```

Or, while the branch is still private:

```bash
git switch feature/invoices
git rebase main
git push --force-with-lease
```

`--force-with-lease` refuses the push if someone else pushed to that branch after your last fetch. Plain `--force` will overwrite them. Abort a rebase that is going badly with `git rebase --abort`. You are back where you were.

Do not rebase `main` itself to "clean it up." `main` is the shared road. The ecom work on this site lands the same way, as reviewable history, not a rewritten trunk: [Ecom_NET10](/work/ecom-net10).
