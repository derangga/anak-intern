---
name: no-comments
description: "Delete comments in a diff or path with the comment-sicko agent, fix the code it flags, move decision records into ADRs, and file issues for what stays open. `audit` ranks folders to clean first. `cap` adds a CI check so comment lines per file can only go down."
disable-model-invocation: true
argument-hint: "[audit|cap] [files, folder, or diff]"
---

# No comments

Spawn the comment-sicko agent on the scope, check its work, then act on the label it gives each comment: fix or file the code behind an Excuse, and move a Decision Record into an ADR. Comment Sicko starts fresh, without this session's context, so trust its reading of the code over your own memory of why a comment was written.

Arguments: `$ARGUMENTS`

If the first argument is `audit`, follow Audit and stop. If it is `cap`, follow Cap and stop. Otherwise follow Scope and Steps.

## Audit

`/no-comments audit [path]` reads only. It finds the folders whose comments most likely make an agent hesitate to edit, so the user can clean them one folder at a time. The path defaults to the repo root. Change no files and spawn no agent.

1. **Count comment lines per file** with `sh <this skill's base directory>/assets/comment-cap.sh count <path>`. It prints `<lines> <file>` per file, relative to the path.
2. **Find warning comments**, the ones that tell an agent to keep away. Use `git grep -n -i -E --untracked -- <path> ':!*.md' ':!*.json' ':!*.lock' ':!*.yaml' ':!*.yml'` with this pattern: `(//|#|/\*|\*|-- ).*(do not (touch|change|remove|edit)|don'?t (touch|change|remove|edit)|careful|fragile|hack|workaround|important|warning|too risky|for now|temporary|xxx|fixme)`.
3. **Read the top hits.** Open the 10 files with the most warning comments. In each, note warning comments, comment blocks of 4 or more lines above a function, and commented-out code. Judge each against the Labels in `agents/comment-sicko.md`. A comment that a Keep protects does not count.
4. **Rank folders** by the warning comments and long blocks that no Keep protects, then by total comment lines. Group by the folder one or two levels below the path, whichever gives 5 to 15 groups.
5. **Report** a table: folder, warning comments, long blocks, commented-out code, total comment lines. Under it, quote the 3 worst comments in the top 5 folders as `file:line`. Then estimate the lines a full cleanup sheds: the total comment lines is the upper bound, and the share of Keeps and Decision Records you saw in step 3 is the likely discount. End with the commands to run next, such as `/no-comments src/payment/`, one per folder in ranked order, then `/no-comments cap <path>`.

The counts come from patterns, so they are estimates. Say so in the report.

## Cap

`/no-comments cap [path]` adds a check that fails when a file under the path gains comment lines. Each file's cap starts at its comment-line count today, so files waiting for cleanup still pass, and caps only go down. The path defaults to the repo root.

1. **Copy the script.** Copy `<this skill's base directory>/assets/comment-cap.sh` to `scripts/comment-cap.sh` in the repo, unless it is already there.
2. **Check the pattern.** Run `sh scripts/comment-cap.sh count <path>` and open the 3 files with the highest counts. If the pattern counts lines that are not comments in this repo's languages, such as C's `#include`, narrow the pattern in the copy.
3. **Write the caps.** Run `sh scripts/comment-cap.sh update <path>`. It writes `<path>/.comment-cap`. Run `check` on the same path and confirm it exits 0.
4. **Run it where lint runs.** Add `sh scripts/comment-cap.sh check <path>` next to the existing lint step: a CI workflow, a pre-commit hook, or a `package.json` script. If the repo has none, ask the user with AskUserQuestion where it should run.
5. **Report** the files capped, their total comment lines, and where the check runs. Tell the user how caps change: `update` lowers them after a cleanup, and a cap rises only through a hand edit to `.comment-cap`, which shows in review. A renamed file loses its cap, so move its line in `.comment-cap` by hand.

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
   - a Stale label without a grep result that proves it, except on commented-out code
   - a Decision Record that fails one of its three tests, or that describes behavior forced on us from outside, which is a Keep

   A flag on a surprise in our own code is valid. Do not restore that comment. A kept comment survives only with proof that it is about something we cannot change.

   For a thin `IMPORTANT` or `do not remove` call, trace the symbol yourself, or read the history of its lines (`git log -L`, `git blame`, and the PR discussion with `gh pr view`). If a deletion stays ambiguous, leave it deleted. If a keep is refuted or stays ambiguous, delete it.

   To undo a rejected report, reverse only Comment Sicko's hunks: `git diff <baseline> | git apply -R` for tracked files, and copy the untracked files back from the temporary directory. Never use `git checkout` or `git restore` on a file, because that also throws away the user's uncommitted work. Then spawn a fresh Comment Sicko with the reason for the rejection. If the second report is also rejected, undo it the same way, report it as open, and stop.

4. **Fix the simple flags** directly: delete the dead path, drop the unused parameter, or call the real API.

5. **Sketch the shaped fixes.** If any accepted flag needs a new shape, such as a new type, a split function, or a moved responsibility, sketch it once for all such flags and the code around them. Write the types and function signatures with empty bodies, and stop at the sketch. Step 6 fills it in.

6. **Implement the smallest root-cause fix in scope.** Fix the first place the code made the wrong decision, not the place the comment sat. Remove every workaround the flags name. Add no guards, retries, or swallowed errors to hide the symptom. If the root cause is outside the scope, land the smallest fix inside it and report the rest as open. Never widen the scope to fix other instances.

7. **Move Decision Records into ADRs.** Use the repo's ADR folder if it has one, such as `docs/adr/` or `docs/decisions/`. Otherwise create `docs/adr/` with the first ADR. Name each file `NNNN-slug.md`, one higher than the highest number there. Comments that record one decision become one ADR, and a decision an existing ADR already covers becomes none. Write this, and add nothing else unless the comment held it:

   ```md
   # <the decision, as a short title>

   <1 to 3 sentences: the context, what we decided, and why. Name the module or symbol it governs, not a line number.>
   ```

8. **Offer to enforce constraints.** Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave those that are about something we cannot change. For each of the rest, offer the cheapest in-scope check that would enforce it: a type, a runtime assert, a test, or a lint rule in CI. Ask with AskUserQuestion and wait for the answer. If approved, add the check, then delete the comment. If declined, or when running unattended, delete the comment, report the constraint as open, and sketch the work it needs.

9. **File issues for open work.** Collect each `MUST KILL` flag that steps 4 to 6 left unfixed and each constraint left unenforced. Each issue names the symbol, quotes the deleted comment, and gives the fix from the flag or the sketch. Use `bd create` when the repo has `.beads/`, otherwise `gh issue create` when the remote is on GitHub. Print the issues as a numbered list, then ask with AskUserQuestion whether to file all, none, or the numbers the user names. File only those. With no tracker, or when running unattended, put them in the report.

10. **Lower the caps.** For each `.comment-cap` in or above the scope, run `sh scripts/comment-cap.sh update <its folder>` so the caps drop to the new counts.

11. **Report:**
   - comments deleted per label, and comments restored
   - lines shed, from `git diff --shortstat <baseline>` plus the untracked files
   - ADRs written
   - reruns of Comment Sicko, and any report left rejected
   - the sketch from step 5, if any
   - fixes made
   - enforcement offered, and enforcement added
   - issues filed, and open work left in the report
   - `/no-comments cap <scope>` as the next step, if the scope has no `.comment-cap`

Leave all changes uncommitted.
