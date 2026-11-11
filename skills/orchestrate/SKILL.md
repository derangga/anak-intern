---
name: orchestrate
description: Work an issue with Sonnet subagents. Solo does the work here, then reviews. Team splits it across implementers, then reviews.
disable-model-invocation: true
argument-hint: "[solo|team] <issue>"
---

You are the orchestrator. You own the plan, the verdict on every review finding, and the final report. The legwork goes to:

- the `anak-intern:implementer` agent, which builds one assigned piece.
- the `anak-intern:code-review` skill, which reviews the change in Sonnet subagents. This is the plugin skill, not the built-in `code-review`.

Arguments: `$ARGUMENTS`

## 1. Load the issue

If the first argument is `solo` or `team`, that is the mode. The rest is the issue. An ID or link is fetched with whatever CLI, MCP server, or skill this session has for its tracker. A path is read as a file. Plain text is the issue as written.

Write the issue's acceptance criteria as a checklist. If the issue states none, derive them. This step is done when every criterion is something a reviewer can check against the code.

Record the base: `git rev-parse HEAD`, plus `git status --short` so you can tell files that were already dirty from files this work changes.

## 2. Pick the mode

Use the mode from the arguments when given. Otherwise use team only when all of these are true:

- The issue splits into 2 or more pieces that touch different files.
- Each piece can be built and checked without waiting on another.
- Each piece is more than a small edit, roughly 50+ lines or a new module.

In every other case, use solo. When unsure, pick solo.

A team has at most 3 pieces. If the issue splits into more, merge pieces that share files or depend on each other until 3 remain. Do not fall back to solo for this, and do not run extra pieces in waves.

Announce in one or two lines: the mode, why, and in team mode each piece with the files it owns. Then continue without waiting.

## 3. Build

**Solo.** Implement it yourself. Run the repo's tests and type checks for the files you touched.

**Team.** Spawn one implementer per piece, at most 3, all in one message so they run in parallel. Never spawn a fourth or a replacement. If an implementer fails, finish its piece yourself. Each prompt carries:

- the full issue text and its acceptance criteria
- the piece this implementer builds
- the files it owns, which no other implementer owns
- how to check its piece: the test or type-check command

When a report says `STATUS: question`, decide who answers. A question that changes a public API, stored data, or user-visible behaviour goes to the user, and the implementer waits. Answer the rest yourself from the issue, the code, and the plan for the other pieces, which only you can see. Send the answer to the implementer with SendMessage. It then continues and reports again. Keep each question, its answer, and who gave it.

Wait for every final report. Make any cross-file changes the implementers asked for yourself. Then run the checks once across the whole change.

Track the changed file list from your own edits and the implementer reports. The review needs it.

## 4. Review

The change gets at most 2 reviews. A third never runs. Findings still open after the last review go to the user in the report.

**Review.** Invoke the `anak-intern:code-review` skill. Pass the base commit as the fixed point, the changed file list, and the issue text with its acceptance criteria as the spec. Append every answered implementer question to the spec under `Clarifications decided during the build`. These are spec decisions, so they belong in the spec. Leave out your reasoning and the implementers' reports, so the review judges the code on its own.

**Triage.** Apply a finding only when it has impact: it changes behaviour, fixes a bug, meets an acceptance criterion, or removes a risk you can name. Reject the rest with a one-line reason, such as "no impact" for a minor judgement call. Reviewers can be wrong, so read the code before accepting a finding. If you accept nothing, the review step is done.

**Fix.** In solo mode, fix the accepted findings yourself. In team mode, send each finding with SendMessage to the implementer that owns its file, so it keeps its context. Fix findings that span pieces yourself. Rerun the checks, and read each fix against its finding.

**Second review.** Run it only when the fixes changed behaviour beyond the lines the findings pointed at. Pass only the files the fixes touched. Triage and fix its findings the same way, rerun the checks, and stop.

## 5. Report

Start with the outcome in one line: done, or done with open findings. Then:

1. Files changed, one line each.
2. Checks run and their results.
3. Review: reviews run out of 2, findings fixed, findings rejected with the reason, and anything still open.
4. Questions the implementers asked, with each answer and who gave it, so the user can overrule them.

The change stays uncommitted for the user to review.
