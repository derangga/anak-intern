---
name: create-formal-verification-skill
description: "Generate a project-local skill that formally verifies the code where a bug costs the most and tests reach the least, in any language, with Bend 2 proofs by default. Use for /create-formal-verification-skill, \"model-check this race\", \"prove this invariant\", or when concurrency, retries, state machines, parsers, or unsafe code need more than tests."
disable-model-invocation: true
---

# Create a formal verification skill

A test checks the cases that someone thought to write. Formal verification checks every case in a stated scope: every order of steps in a model, every input up to a bound, or every input. This skill finds the part of the repo where that matters most, verifies one property of it, and leaves a project-local skill that lets the next agent check a change against that property. Write that skill for an agent who reads it cold, mid-change, and has never seen your work. The user must be able to trust the result and act on it without learning the verification language.

## Choose the target from the code

Answer from the codebase, and ask the user only what you cannot observe. If the user named an area or a bug, start there.

A good target is a promise the code makes, where a break harms users and tests rarely reach the case that breaks it. Choose the strongest such target in the repo, not the one that is easiest to verify.

## Choose the tool

Bend 2 is the default, in any language. Use it for every property of the code's logic: whether events can happen in a bad order, whether an invariant survives every list of events (retries, duplicates, reordering, crashes), and whether a data-structure or state-machine rule holds at every size. You port the logic to a pure Bend function, state each property as a law, and prove it for every state and event list, with no bound. Read [references/bend.md](references/bend.md) before you write any Bend. Write `LAWS.bend` first. Show the user each law as one plain sentence, and wait for their approval before you write `PROOF.bend`. Expect thousands of lines of proof. That cost is accepted, so do not switch tools to save it.

Two cases leave Bend. A property of the real code's memory or machine arithmetic, such as memory safety, overflow, or `unsafe` code, cannot be seen in a port. It needs a verifier that runs on the code. If no verifier runs on this language, say so, and test the real code with generated inputs, not a hand model of the function. Tell the user why you chose the tool.

## What makes it good

- **True to the code.** Every part of the model or proof points to code that a reviewer can open. What the verification treats as one indivisible step is one indivisible step in the code. Names come from this repo. When the proof runs on a port, a conformance harness feeds the same event lists to the port and the real code and compares the results.
- **Able to fail.** A check that you have never seen fail proves nothing. Show each property failing on a broken variant of the code it guards, such as a removed check or a reordered step.
- **Findings stay findings.** When the current code breaks the property, report it with the counterexample in the code's terms. A failed proof names a lemma and is not yet a counterexample. It becomes a finding when a concrete input breaks the real code, and until then it is unproved. Do not weaken the property or the model until it passes, and do not change product code unless the user asks.
- **Honest about scope.** Say what is verified, under which bounds and assumptions, and what is left out. A proof covers the port and the laws as written, and a model check covers its bound. Neither covers the whole system.
- **Readable without the tool.** State the property and the harm in one plain sentence each. Tell a counterexample as a short sequence of steps in the code's words.
- **Cheap to rerun.** One command, a reproducible tool version, and a run short enough that the next agent will use it on every relevant change.
- **Kept in step with the code.** Record which files and functions each check covers, and the commit at which you last confirmed that the verification describes them. When the covered code changes after that commit, the next agent can see that the verification needs another look.

## Generate the verify skill

Write a project-local skill with frontmatter that names the area and says when to use it. Without frontmatter, the skill never registers. From the skill alone, the next agent must be able to tell whether a change touches the verified code, run the check, tell a real bug from a modeling error, and update the verification when a change is intended. Put the coverage record and the sync commit in the skill, and tell the next agent to move the sync commit forward only after it confirms that the verification describes the code at the new commit. Use this repo's real commands, paths, and nouns, and leave no placeholders.

Include a table of which stage reads which file. A Bend proof never reads the real code, so a break in the real code shows up only in the real code's tests and the conformance harness. Pair the table with this triage of failures:

- A test of the real code fails: a bug in the code.
- The harness fails while the code's tests pass: the port drifted from the code.
- The proof fails while the harness passes: the proof or the port is stale.
- A mutant is accepted: the check has lost its ability to fail. Stop and ask the user.

If the check is a Bend proof, the skill names the gate that ran, keeps `LAWS.bend` frozen unless the user approves a change, and turns a failed proof into a concrete failing input before it calls the failure a bug. [references/bend.md](references/bend.md) covers each of these.

## Prove it before you hand off

Follow the generated skill once, as the next agent would, on a scratch change that breaks the property in the real code. It must catch the break. For a Bend proof, the harness or the code's tests catch that break, and the mutants show that the proof itself can fail. See both fail. Then drop the scratch change and confirm that the check is back where it started: passing, or failing only on the findings you will report. A verify skill that was never run is a draft. If the skill misses the break or a step does not run, fix the skill or the verification, not the scratch change.

## Hand off

Tell the user what you verified, which tool you used and why, the bounds (for Bend: which gate ran and the harness sample size), what the check found in plain words, how to run it, and what it does not cover. Suggest a second target only if you found a close one. Point the user at `/maintain-formal-verification-skill` for bringing the verification back in line after changes that did not recheck it.
