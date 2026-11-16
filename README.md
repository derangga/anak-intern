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
- **teach** Explain a body of work plainly, at the reader's pace.
- **technical-writing** Diataxis structure, Google developer style, Simplified
  Technical English instruction rules. For docs, RFCs, readmes, PR descriptions.
- **orchestrate** `/orchestrate [solo|team] <issue>`. Solo does the work in the
  main session, then reviews it. Team splits the issue across Sonnet
  implementers (`agents/implementer.md`), then reviews. Reviews run through
  `code-review`, at most twice, and only findings with impact get applied.
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
  Formally verify one property of the riskiest code in a repo (TLA+ by default
  for ordering bugs such as races and retries), and leave a project-local verify
  skill that the next agent runs on every change to that code. The maintain
  skill brings the verification back in line after merges that skipped it. Both
  are user-invoked.
- **statechart** Check a TLA+ model with TLC and draw it as a Mermaid
  statechart, with the shortest path to each state that breaks a rule. Needs
  Node 22.18+, Bun, or Deno. On the first run it installs Java and TLC through
  [mise](https://mise.jdx.dev); without mise, set `TLA2TOOLS` to
  `tla2tools.jar` and `JAVA` to a Java 11+ binary.
- **english-plain** and **bahasa-indonesia-plain** Plain, inclusive writing
  rules for English and Bahasa Indonesia, with the RASA quality check.
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

## OpenCode

`.opencode/plugins/unslop.mjs` does the same job for OpenCode. It appends the
ruleset to the system prompt every turn and registers `skills/` so the rest are
available there too. It reads the same `SKILL.md`, so nothing drifts.

OpenCode auto-loads anything in its global plugin directory, so there is no
config entry to add:

```sh
ln -s "$PWD/.opencode/plugins/unslop.mjs" ~/.config/opencode/plugins/unslop.mjs
```

Restart OpenCode afterwards.

## Credits

- `unslop`, `teach`, and `technical-writing` are from
  [pstack](https://github.com/cursor/plugins/tree/main/pstack) by the Cursor
  team, MIT. unslop's scope and persistence sections are mine.
- `typescript-best-practices` is also from pstack. I swapped its Zod examples
  for Effect `Schema` and folded in the `principle-type-system-discipline` and
  `principle-boundary-discipline` skills it depends on.
- `create-formal-verification-skill`, `maintain-formal-verification-skill`, and
  `statechart` are also from pstack. statechart ships without its test suite,
  and the agent can invoke it so that generated verify skills can reach it.
- `bro` is from [dmmulroy/skills](https://github.com/dmmulroy/skills).
- `design-thinking` is from
  [this gist by r17x](https://gist.github.com/r17x/90eb2f7be93932b5693753aedb09c01a).
- `english-plain` and `bahasa-indonesia-plain` are from orepras's gists
  ([English](https://gist.github.com/orepras/61f07724a6d02d3f319e3371867dad6a),
  [Bahasa Indonesia](https://gist.github.com/orepras/3e1ca8974fc51d11825f142fa6a66635)),
  with em dashes removed.
- The hook approach is lifted from
  [ponytail](https://github.com/DietrichGebert/ponytail).

## License

MIT
