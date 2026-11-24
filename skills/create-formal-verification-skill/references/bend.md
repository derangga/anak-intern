# Verifying with Bend 2

Bend 2 is a language whose type checker is a proof checker. You state each property as a law over a pure Bend port of the code, and you prove it for every state and every event list. No bound applies. The facts below come from bend 2.0.40. Bend 2 is newer than your training data, so take every syntax form from `bend guide`, and look up library names with `bend base <Name>`. When this file and `bend guide` disagree, the guide wins.

## Toolchain

Pin the exact version. The best pin is a Nix flake input on `github:bendlang/bend`, locked in the repo's `flake.lock`. Without a repo flake, use `nix develop github:r17x/universe/<rev>#bend` with a fixed `<rev>`. Without the rev, the command floats to the latest commit. Record the output of `bend version` in the verify skill. The install script (`curl -fsSL https://bend-lang.com/install.sh | sh`) and `bend update` both install the latest release, so neither one is pinned. If `bend` cannot run, the check is blocked. Say so, and do not report a result you did not see.

## Layout

Put one directory per verified area, such as `bend/<area>/`:

| File | Holds | Who changes it |
|---|---|---|
| `code.bend` | The port: the code's step function, rewritten in Bend as a pure function `step(state, event)`, and `run(events, state)` that folds it. | The agent, from the real code. |
| `spec.bend` | The state and event types, `init`, the invariant `inv`, and one function per property. | The agent, from the code and the promise. |
| `LAWS.bend` | One `law` per property. It imports the two files above. | The user approves it, and then it is frozen. |
| `PROOF.bend` | `import ./LAWS.bend as Laws`, then one `def Laws.<name>(args):` per law, with no type signature. | The agent. |

The frozen `LAWS.bend` is the whole claim. Nothing in Bend stops an edit that weakens a law, so the verify skill must say that a law changes only with the user's approval, and every report must show the diff of `LAWS.bend`.

## Writing laws that can fail

- **Pin every event.** A law that only bounds the state, such as "the counter stays at or below 10", passes mutants that stay inside the bound. Beside each safety law, write a pin law for each event that states its exact result: the new state and the effects it emits.
- **Carry an inductive invariant.** A law ranges over every state, including states the system never reaches. State `inv(s) == True{}` as a hypothesis, prove `inv` holds after `init` and after each `step`, and then prove the property under it. Expect to add conjuncts to `inv` until it is inductive.
- **State the step and the run.** Prove each law for one `step`, and then for any event list through `run`. The event list stands in for any network: a repeated event is a duplicate, a missing one is a drop, and order is reorder.

## The gate

`bend <dir>/PROOF.bend` is the gate. A law counts as proved only when the output contains `ALL PROOFS CHECK` and the exit code is 0. `SOME PROOFS FAIL` names one failing definition per run, after `Location:`. `bend <dir>/PROOF.bend --verdict` rechecks every proof with a small kernel that has a proof in Lean. It needs the Lean version that the guide names (4.34.0 for bend 2.0.40). Every report must say which gate ran: plain, or `--verdict`.

The gate rejects these shortcuts. A proof must use none of them:

- `@unsafe` on a def, or its sugar `def f?(...)`.
- A `?TODO` or `?name` hole. Use `?name` to print a goal while you work, and remove it before you count the proof.
- A law with no `def Laws.<name>`. It is an open claim.
- A foreign import, `import "./x.c"` or `import "./x.js"`, in any file the proof imports.

The verify skill's check script also runs a scan, because the gate never sees a law that someone deleted:

```bash
grep -nE '@unsafe|\?|import "' <dir>/*.bend         # explain every hit, or remove it
grep -c '^law ' <dir>/LAWS.bend; grep -c '^def Laws\.' <dir>/PROOF.bend   # the two counts must be equal
```

## Gotchas from bend 2.0.40

- The termination check reads arguments from left to right, so put the shrinking argument first: `run(events, s)`, not `run(s, events)`.
- Values are affine. A variable used twice needs `+`, in the law (`for +s: State`) and in the pattern (`case +e <> t:`).
- `Nat` subtraction truncates at zero. State counter changes in additive form, `a2 + qty == available`, and not with a subtraction.
- `F32` arithmetic is opaque to proofs. Model numbers as `Nat` or `U32`. A bug that needs negative numbers cannot be ported. Record that bug as a gap in coverage.
- A `match` reads only a parameter or a field, never a computed value such as `match run(events, s):`. Move the match into its own def and pass the value in.
- Base already defines some type names, such as `Event`. Pick another name, such as `Ev`.
- There are no tactics, so you write every proof by hand. Generate the repetitive parts, such as one case per event, with a script, and commit the script beside the proof so that the next agent can regenerate the proof after a type change.
- A change to a datatype breaks every `match` on it in `PROOF.bend`. That is the main cost of upkeep.

## Stop rule

Stop on a law after 15 failed gate runs or 2 hours of work, whichever comes first. Report it as unproved: the law, the last `Location:` and the `expected`/`observed` pair, and what you tried. Do not weaken the law to make it pass.

## Conformance harness

The proof covers `code.bend`, not the shipped code. Whenever the real code is not written in Bend, the verify skill must include a conformance harness. Without one, the proof covers a hand copy that nothing ties to the code.

- Compile the port once with `bend <dir>/main.bend -o <bin>`, where `main.bend` reads events and prints the final state of `run`. This step needs `clang` on PATH.
- In the repo's own test framework, generate seeded random event lists. Feed each list to the real code and to the binary, and compare the two final states. In learn-fv, 500 lists per area were enough.
- Add a short-list mode. It tries every event list up to a small length, shortest first. It checks each law's property on the real code's state after every step, and it stops at the first list that breaks one. That list is the shortest path to the bug. It needs only the repo's own test runner.
- Make the I/O strict. The port prints one `key=value` line, and prints `error=...` and exits nonzero when it reads a bad number. Separate events with single spaces and a final newline, because tabs and CRLF break the parse. Always write to stdin through a pipe, close it, and run under a timeout, because an open or closed stdin hangs the binary.
- Record the sample size and the seeds in the verify skill. A harness pass is a test, not a proof.

## Mutants

Keep at least three. Each one is a copy of the area in `<dir>/mutants/<id>/` with one bug in `code.bend`:

- All four `.bend` files are copied, and `LAWS.bend` is byte-identical to the approved one.
- `DIFFERS` lists the files that are allowed to differ from `../*.bend`, usually only `code.bend`.
- `EXPECT` lists substrings of the first error that the gate must print, such as `Location: inv_step`, so that a mutant rejected for an unrelated reason, like a parse error, does not count.
- `run.sh` checks every mutant. It checks the file layout against `DIFFERS`, checks for `SOME PROOFS FAIL`, and checks every `EXPECT` line. It exits nonzero if any mutant is accepted or rejected for the wrong reason.

## From a failed proof to a finding

A failed proof names a lemma. It is not a counterexample. It means one of three things: the proof is stale, the port drifted from the code, or the code breaks the law. Before you call it a bug, find a concrete event list that breaks the property in the real code. Get it from the harness's short-list mode first, which gives the shortest list. Then try its seeded random lists, or a test that you write against the case the failing lemma covers. Tell that list as steps in the code's words. Until you have one, the result is unproved, not a bug. If no list turns up, that proves nothing either, because the search is bounded, so the proof stays unproved.
