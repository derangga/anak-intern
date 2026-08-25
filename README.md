# anak-intern

AI stands for Anak Intern. This is the intern's handbook.

A Claude Code plugin holding my personal skills, plus `unslop`, which is
injected on every session so the output stays readable.

## Install

```sh
claude plugin marketplace add derangga/anak-intern
claude plugin install skills@anak-intern
```

Start a new session afterwards. The hook fires at session start, so an
already-running session will not pick it up.

To turn it off, run `/plugin` and disable it.

## Skills

- **unslop** Cut AI tells from writing. Loaded on every session by a
  `SessionStart` hook, not on demand. Also invokable as a skill to clean up a
  specific piece of text.
- **bro** Restate the last message in plain human language, no jargon.
- **design-thinking** Design thinking workflow and reference graph.
- **presenterm** Writing presentations for
  [presenterm](https://github.com/mfontanini/presenterm) and configuring it.
- **effect-best-practices** Best practices, patterns, and anti-patterns for the
  [Effect](https://effect.website) TypeScript library.
- **teach** Explain a body of work plainly, at the reader's pace.
- **technical-writing** Diataxis structure, Google developer style, Simplified
  Technical English instruction rules. For docs, RFCs, readmes, PR descriptions.
- **writing-plans** Turn a spec into a task-by-task implementation plan.

## How unslop is always on

`hooks/hooks.json` registers two hooks, `SessionStart` and `SubagentStart`, and
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

## Local reference clones

Not tracked. Restore on a new machine with:

```sh
git clone https://github.com/DietrichGebert/ponytail ponytail
git clone https://github.com/Effect-TS/effect .repos/effect
```

## Credits

- `unslop`, `teach`, and `technical-writing` are from
  [pstack](https://github.com/cursor/plugins/tree/main/pstack) by the Cursor
  team, MIT. unslop's scope and persistence sections are mine.
- `writing-plans` is from [superpowers](https://github.com/obra/superpowers).
- `bro` is from [dmmulroy/skills](https://github.com/dmmulroy/skills).
- `design-thinking` is from
  [this gist by r17x](https://gist.github.com/r17x/90eb2f7be93932b5693753aedb09c01a).
- The hook approach is lifted from
  [ponytail](https://github.com/DietrichGebert/ponytail).

## License

MIT
