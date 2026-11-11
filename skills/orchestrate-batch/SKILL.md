---
name: orchestrate-batch
description: Work a queue of issues with Sonnet subagents, at most 5 at once. Issues come from any source the user names. Each issue gets one implementer and a review. Independent issues run in parallel, the rest wait.
disable-model-invocation: true
argument-hint: "<where the issues are and how to pick them>"
---

You are the orchestrator for a queue of issues. You own the queue, the schedule, the verdict on every review finding, and the final report. The legwork goes to:

- the `anak-intern:implementer` agent, which builds one issue.
- the `anak-intern:code-review` skill, which reviews one issue's change. This is the plugin skill, not the built-in `code-review`.

You do not build issues yourself. For a single issue, the user runs `orchestrate` instead.

Arguments: `$ARGUMENTS`

## Rules for the whole run

- **At most 5 subagents at once.** That is up to 3 implementers plus 1 review, which runs 2 sub-agents. An implementer counts from its spawn until its report, and again while it works on fixes you sent it. When no build slot is free, wait for a completion notification.
- **At most 10 issues per run**, or the count the user named. The rest stay queued for the next run.
- **One writer per file.** Two running issues never own the same file. A file that was dirty before the run starts belongs to the user, and no issue may own it.
- **Retry once, unchanged.** If an implementer ends without a report, spawn it again once with the identical prompt. A second failure is final.
- **The source stays untouched.** Do not change status, comment, or close anything in the tracker unless the user asked for it.
- **Nothing gets committed.** The user reviews the working tree.

## 1. Load the queue

The arguments say where the issues are and how to pick them. Examples: `bd ready, top 5 by priority`, `tasks.md`, `gh issues labelled bug`, a Jira JQL query. Fetch them with whatever CLI, MCP server, or skill this session has for that source. A path is read as a file.

For each issue, record:

- **id and title.** Use the source's own id. For a markdown file without ids, use the heading slug.
- **text and acceptance criteria.** If the issue states none, derive them. Every criterion must be something a reviewer can check against the code.
- **priority.** Use the source's field when it has one. Otherwise use the order the source lists them in.
- **dependencies.** Use the source's field when it has one. Otherwise take the ones the text states ("blocked by #12", "after the auth task"). If neither exists, the issue has none.
- **owned files.** Predict the files the issue will change from its text and a search of the code. When unsure, own more files, not fewer. A wider guess only costs parallelism.

Sort by priority, highest first, ties in source order. Keep the first 10, or the count the user named.

## 2. Open the ledger

The ledger is the run's state on disk, so the run survives a lost context or a new session. It lives at `$(git rev-parse --git-path orchestrate-batch)/<source-slug>.md`, inside `.git`, so it never shows in `git status`.

If the ledger exists, this run resumes it. Keep its base commit. Skip issues whose last status is `done`, `open`, `failed`, or `blocked`. Reset `running` and `review` to `queued`, since no agent from the old session is alive.

Otherwise, write the header: the source arguments, `git rev-parse HEAD` as the base commit, and the output of `git status --short` as the files dirty before the run.

Every status change appends one line. Never rewrite a line. The last line for an id wins.

```
<id> | <status> | <owned files, comma-separated> | <one-line note>
```

Statuses: `queued`, `running`, `review`, `done`, `open` (done with findings left open), `failed`, `blocked`.

## 3. Announce the schedule

Print the queue as one block, then continue without waiting:

```ts
QUEUE (10 of 37, by priority)
  #41 → src/auth/login.ts, src/auth/login.test.ts      ready
  #38 → src/billing/invoice.ts                          ready
  #44 → src/auth/session.ts                             after #41
  #12 → src/auth/login.ts                               waits on #41's files
```

## 4. Run the queue

An issue is **ready** when all of these hold:

- Every dependency's status is `done` or `open`. If a dependency is `failed` or `blocked`, mark this issue `blocked` with the reason.
- Its owned files overlap no running issue, no `failed` issue, and no file that was dirty before the run.
- A build slot is free.

Then loop:

1. **Fill the slots.** Spawn an implementer in the background for each ready issue, highest priority first, until 3 are running. Mark each `running`. Each prompt carries the issue text and acceptance criteria, the files it owns, and the test or type-check command for those files.
2. **On each completion notification**, read the report. If `STATUS: failed`, mark the issue `failed` and keep its files locked for the rest of the run. Do not revert its changes. If the implementer asked for changes in files it doesn't own, make them yourself, but only in files no running issue owns. Otherwise hold the request until that issue finishes.
3. **Review it** (step 5). While a review runs, the other implementers keep working.
4. Go back to 1. Stop when nothing is running and nothing is ready.

## 5. Review one issue

Each issue gets at most 2 reviews, the same as in `orchestrate`.

Mark the issue `review`. Invoke `anak-intern:code-review` with the base commit as the fixed point, the issue's changed files as the file list, and the issue text with its acceptance criteria as the spec. Leave out the implementer's report.

Earlier issues in this run may have changed the same files. If so, tell the Spec sub-agent which ids also touched those files, so it does not flag their changes as scope creep.

Triage as in `orchestrate`: apply a finding only when it changes behaviour, fixes a bug, meets an acceptance criterion, or removes a risk you can name. Read the code before you accept a finding. Send the accepted findings to the issue's implementer with SendMessage. That takes a build slot until it reports back. Run a second review only when the fixes changed behaviour beyond the lines the findings pointed at.

Mark the issue `done`, or `open` when findings remain open after its last review. The ledger note names the open findings.

## 6. Report

When the loop stops, run the repo's full test suite and type checks once. That catches issues that broke each other.

Start with one line: how many issues are done, open, failed, and blocked, and how many remain in the source. Then:

1. One line per issue: id, status, files changed, and the open findings or failure reason.
2. Checks run and their results.
3. The ledger path, so the next run can resume.

The changes stay uncommitted for the user to review.
