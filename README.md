# anak-intern

AI stands for Anak Intern. This is the intern's handbook.

A Claude Code plugin holding my personal skills, plus `unslop`, which is
injected on every session so the output stays readable.

## Install

```sh
claude plugin marketplace add derangga/anak-intern
claude plugin install anak-intern@anak-intern
```

Start a new session afterwards. The hook fires at session start, so an
already-running session will not pick it up.

To turn it off, run `/plugin` and disable it.

## Skills

- **unslop** Cut AI tells from writing. Loaded on every session by a
  `SessionStart` hook, not on demand. Also invokable as a skill to clean up a
  specific piece of text.
- **bro** Restate the last message in plain human language, no jargon.
- **design-thinking** The design pass before writing Effect code. Draw the call
  graph, annotate A/E/R, then emit it.
- **presenterm** Writing presentations for
  [presenterm](https://github.com/mfontanini/presenterm) and configuring it.
- **effect-best-practices** Best practices, patterns, and anti-patterns for the
  [Effect](https://effect.website) TypeScript library.
- **teach** `/teach <topic>`. Teaches a topic over several sessions as short
  HTML lessons, with a mission, references and learning records kept in the
  workspace. In each lesson you can select any passage and attach a question,
  then copy all your questions and paste them into the chat. The agent answers
  them and saves the gaps they show as learning records.
- **technical-writing** Diataxis structure, Google developer style, Simplified
  Technical English instruction rules. For docs, RFCs, readmes, PR descriptions.
- **orchestrate** `/orchestrate [solo|team] <issue>`. Solo does the work in the
  main session, then reviews it. Team splits the issue across Sonnet
  implementers (`agents/implementer.md`), then reviews. Each implementer gets a
  call graph to build and reports the graph it built. The orchestrator compares
  the two before review. Reviews run through `code-review`, at most twice, and
  only findings with impact get applied.
- **orchestrate-batch** `/orchestrate-batch <source and selection>`, for example
  `/orchestrate-batch gh issues labelled bug, top 5`. Works a queue of issues
  from any tracker or markdown file. Runs at most 3 implementers and 1 review at
  once, 10 issues per run, and keeps its progress in a ledger under `.git` so a
  later run resumes.
- **code-review** Review changes since a commit, branch, or tag on two axes:
  repo standards and the originating spec. Each axis runs in its own Sonnet
  subagent. Covers uncommitted work too. Invoke as `/anak-intern:code-review`
  so it doesn't collide with the built-in `/code-review`.
- **typescript-best-practices** Type-system rules for `.ts` and `.tsx` files:
  discriminated unions, brands, boundary parsing, no `as`. Schema examples use
  Effect `Schema`, and the rules defer to whatever schema library the repo has.
- **create-formal-verification-skill** and **maintain-formal-verification-skill**
  Formally verify one property of the riskiest code in a repo with Bend 2 laws
  and proofs over every event list, with no bound, and leave a project-local
  verify skill that the next agent runs on every change to that code. The maintain
  skill brings the verification back in line after merges that skipped it. Both
  are user-invoked.
- **no-comments** `/no-comments [files or diff]`. Spawns the comment-sicko
  agent to label each comment in the diff since the default branch as a Keep,
  Tautology, Stale, Excuse, or Decision Record. It deletes all but the Keeps,
  fixes the code behind each Excuse or files an issue for it, and moves each
  Decision Record into an ADR. Constraint comments such as `do not remove` get
  an offer to enforce them with a type, test, or lint rule.
  `/no-comments audit [path]` changes nothing, ranks folders by the comments
  that make an agent afraid to edit, and estimates the lines a cleanup sheds.
  `/no-comments cap [path]` adds a CI check that fails when a file gains
  comment lines, with per-file caps that only go down.
- **english-plain** and **bahasa-indonesia-plain** Plain, inclusive writing
  rules for English and Bahasa Indonesia, with the RASA quality check.
- **comment-sicko** (agent, `agents/comment-sicko.md`) Deletes comments in a
  scoped diff and flags the code that needed them. Edits comments only.
  Spawned by `no-comments`.
- **copywriter** (agent, `agents/copywriter.md`) Writes or rewrites copy in
  English or Bahasa Indonesia. Both writing skills are preloaded through its
  `skills` frontmatter.

## How unslop is always on

`hooks/hooks.json` is loaded automatically by Claude Code, no manifest entry
needed. It registers two hooks, `SessionStart` and `SubagentStart`, and
both run `cat skills/unslop/SKILL.md`. Claude Code takes the stdout and prepends
it as context. That is the whole implementation, there is no code.

Because the hook reads the skill file directly, the always-on ruleset and the
on-demand skill cannot drift apart.

## Credits

- `teach` is from [mattpocock/skills](https://github.com/mattpocock/skills),
  MIT. `ANNOTATE.md`, `assets/annotate.js` and the two lines in `SKILL.md` that
  point to `ANNOTATE.md` are mine.
- `unslop` and `technical-writing` are from
  [pstack](https://github.com/cursor/plugins/tree/main/pstack) by the Cursor
  team, MIT. unslop's scope and persistence sections are mine.
- `typescript-best-practices` is also from pstack. I swapped its Zod examples
  for Effect `Schema` and folded in the `principle-type-system-discipline` and
  `principle-boundary-discipline` skills it depends on.
- `create-formal-verification-skill` and `maintain-formal-verification-skill`
  are also from pstack. I switched them from TLA+ to Bend 2 and dropped
  pstack's TLA+ `statechart` skill.
- `no-comments` and the `comment-sicko` agent are also from pstack. I removed
  their dependence on `poteto-mode`, `architect`, `why`, and the principle
  skills by writing the parts they used into the skill and agent, and added a
  baseline so a rejected report is undone without touching uncommitted work.
  The comment labels, ADRs, issues, and the `cap` check come from a prompt
  shared on X.
- `bro` is from [dmmulroy/skills](https://github.com/dmmulroy/skills).
- `design-thinking` is from
  [this gist by r17x](https://gist.github.com/r17x/90eb2f7be93932b5693753aedb09c01a).
- The graph protocol in `orchestrate` and `orchestrate-batch` is adapted from
  [meta7 by r17x](https://gist.github.com/r17x/fb5d68381fa4cc4630b42740f72a1225).
- `english-plain` and `bahasa-indonesia-plain` are from orepras's gists
  ([English](https://gist.github.com/orepras/61f07724a6d02d3f319e3371867dad6a),
  [Bahasa Indonesia](https://gist.github.com/orepras/3e1ca8974fc51d11825f142fa6a66635)),
  with em dashes removed.
- The hook approach is lifted from
  [ponytail](https://github.com/DietrichGebert/ponytail).

## License

MIT
