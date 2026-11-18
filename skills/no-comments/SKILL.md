---
name: no-comments
description: "Delete comments in a diff or path with the comment-sicko agent, fix the code it flags, and offer to enforce claimed constraints in code. `audit` ranks folders to clean first."
disable-model-invocation: true
---

# No comments

Spawn the comment-sicko agent on the scope, check its work, then fix the code it flags. Comment Sicko starts fresh, without this session's context, so trust its reading of the code over your own memory of why a comment was written.

If the first argument is `audit`, follow Audit and stop. Otherwise follow Scope and Steps.

## Audit

`/no-comments audit [path]` reads only. It finds the folders whose comments most likely make an agent hesitate to edit, so the user can clean them one folder at a time. The path defaults to the repo root. Change no files and spawn no agent.

1. **Count comment lines per file** with `git grep -c --untracked -E '^\s*(//|#|/\*|\*|-- |<!--)' -- <path> ':!*.md' ':!*.json' ':!*.lock' ':!*.yaml' ':!*.yml'`.
2. **Find warning comments**, the ones that tell an agent to keep away. Use `git grep -n -i -E --untracked` with the same pathspec and this pattern: `(//|#|/\*|\*|-- ).*(do not (touch|change|remove|edit)|don'?t (touch|change|remove|edit)|careful|fragile|hack|workaround|important|warning|too risky|for now|temporary|xxx|fixme)`.
3. **Read the top hits.** Open the 10 files with the most warning comments. In each, note warning comments, comment blocks of 4 or more lines above a function, and commented-out code. Judge each against the Keeps in `agents/comment-sicko.md`. A comment that a Keep protects does not count.
4. **Rank folders** by the warning comments and long blocks that no Keep protects, then by total comment lines. Group by the folder one or two levels below the path, whichever gives 5 to 15 groups.
5. **Report** a table: folder, warning comments, long blocks, commented-out code, total comment lines. Under it, quote the 3 worst comments in the top 5 folders as `file:line`, and end with the commands to run next, such as `/no-comments src/payment/`, one per folder in ranked order.

The counts come from patterns, so they are estimates. Say so in the report.

## Scope

Use the files, directories, or diff the user gave. A directory means every tracked and untracked file under it. Otherwise use every change since the default branch:

1. Find the default branch: `git symbolic-ref --short refs/remotes/origin/HEAD`, else `main` if it exists, else `master`.
2. The diff is `git diff $(git merge-base <default> HEAD)`. It covers commits and uncommitted edits.
3. Add the untracked files from `git ls-files --others --exclude-standard`. The diff misses them.

Stop with a message if the diff and the untracked list are both empty.

With a diff scope, only comments on lines the diff adds or changes are in scope. Untracked files and files the user named, directly or through a directory, are in scope whole.

## Steps

1. **Save a baseline.** Run `git stash create` and keep the SHA it prints. It records the working tree without changing it. Prints nothing when the tree is clean, so use `HEAD` then. Later, `git diff <baseline>` shows exactly what Comment Sicko and you changed in tracked files. The baseline does not record untracked files, so copy each untracked file in scope to a temporary directory, keeping its path.

2. **Spawn.** Call the Agent tool with `subagent_type: "anak-intern:comment-sicko"` and pass the scope: the diff command, the untracked files, or the file list. Do not restate its rules.

3. **Check the report** against `git diff <baseline>` and against the saved copies of the untracked files. Reject the report if it has any of these:
   - changes to anything other than comments, or edits outside the scope
   - a deleted comment that a Keep protects
   - a `MUST KILL` flag with a wrong reason, or one that blames code the user wrote on purpose and wants to keep
   - a missed lint or type suppression in scope. A suppression that protects correctness or safety is a `MUST KILL`.

   A flag on a surprise in our own code is valid. Do not restore that comment. A kept comment survives only with proof that it is about something we cannot change.

   For a thin `IMPORTANT` or `do not remove` call, trace the symbol yourself, or read the history of its lines (`git log -L`, `git blame`, and the PR discussion with `gh pr view`). If a deletion stays ambiguous, leave it deleted. If a keep is refuted or stays ambiguous, delete it.

   To undo a rejected report, reverse only Comment Sicko's hunks: `git diff <baseline> | git apply -R` for tracked files, and copy the untracked files back from the temporary directory. Never use `git checkout` or `git restore` on a file, because that also throws away the user's uncommitted work. Then spawn a fresh Comment Sicko with the reason for the rejection. If the second report is also rejected, undo it the same way, report it as open, and stop.

4. **Fix the simple flags** directly: delete the dead path, drop the unused parameter, or call the real API.

5. **Sketch the shaped fixes.** If any accepted flag needs a new shape, such as a new type, a split function, or a moved responsibility, sketch it once for all such flags and the code around them. Write the types and function signatures with empty bodies, and stop at the sketch. Step 6 fills it in.

6. **Implement the smallest root-cause fix in scope.** Fix the first place the code made the wrong decision, not the place the comment sat. Remove every workaround the flags name. Add no guards, retries, or swallowed errors to hide the symptom. If the root cause is outside the scope, land the smallest fix inside it and report the rest as open. Never widen the scope to fix other instances.

7. **Offer to enforce constraints.** Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave those that are about something we cannot change. For each of the rest, offer the cheapest in-scope check that would enforce it: a type, a runtime assert, a test, or a lint rule in CI. Ask with AskUserQuestion and wait for the answer. If approved, add the check, then delete the comment. If declined, or when running unattended, delete the comment, report the constraint as open, and sketch the work it needs.

8. **Report:**
   - comments deleted, and comments restored
   - reruns of Comment Sicko, and any report left rejected
   - the sketch from step 5, if any
   - fixes made
   - enforcement offered, and enforcement added
   - constraints left unenforced, and other open work

Leave all changes uncommitted.
