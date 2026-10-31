# Git Workflow

- Terminology: the primary checkout is the canonical repository checkout for the task; an auxiliary worktree is an additional Agent Manager/task checkout. Both are Git worktrees, so do not use “worktree” alone to mean the auxiliary checkout.
- The target branch is the source branch recorded when the task checkout is created. Git does not record which branch a worktree was copied from; never guess that it was `main` or infer it from the nearest merge base. If the source branch or primary checkout cannot be identified unambiguously, stop and report the blocker.
- Keep changes on the recorded target branch. Do not commit or push to `main` unless the user explicitly requests it. Do not commit or push at all unless the user or repository instructions explicitly require it; respect any more specific user instruction not to commit or push.
- If work was done in an auxiliary worktree, transfer only the requested changes to the primary checkout on the recorded target branch. Do not commit on the auxiliary task branch; if transfer cannot be done safely, stop and explain why.
- Before committing or pushing, verify the primary checkout path, target branch, worktree list, working tree status, and upstream. Do not change branches or set a new upstream as a workaround for missing target-branch information. Exclude unrelated pre-existing changes.
- Do not remove a worktree unless explicitly requested and it is confirmed to be auxiliary; never remove the sole primary checkout.
