# Opening lessons for annotation

How to open a lesson so the learner can select any passage and ask about it, and what to do with their questions. This file is a local addition to the teach skill from mattpocock/skills. When updating `SKILL.md` from upstream, re-add the two lines under "Lessons" that point here: the one about opening the lesson, and the one about the follow-up reminder.

## Opening a lesson

In every case, open the workspace root (the directory `./lessons/` resolves from), never the lesson file. A single-file session only serves the lesson's own folder, so `../assets/` returns 404 and the lesson loses its styles and quiz scripts. Tell the learner which lesson file to open from the Files tab, and that they press Esc before using a quiz, because clicks select elements for comments until they do.

**Your harness gives you a Plannotator tool** (a tool whose name contains `plannotator`; some harnesses list it only after a tool search). Use it, not the CLI, because a harness with a Plannotator plugin may block `plannotator` shell calls. Ask it to annotate the workspace root by absolute path. Follow the tool's own description for how the learner's comments come back. If it returns before they submit, end your turn and wait for them.

**No tool, but `command -v plannotator` finds the CLI.** Run this from the workspace root:

```
plannotator annotate .
```

The command waits until the learner submits, then prints their comments. If your harness stops long-running shell commands, send the lesson through the Plannotator Inbox instead, since it does not hold your turn open. `plannotator inbox --help` explains how.

**Plannotator is missing.** Open the lesson file with a CLI command, as before. Then tell the learner, once per session, that installing Plannotator lets them select any part of a lesson and ask about it right there:

```
curl -fsSL https://plannotator.ai/install.sh | bash
```

## After the learner submits

Treat every comment as a learner question about the passage it is attached to.

1. Answer each one in chat, grounded in the lesson and its cited sources.
2. When a question shows a gap or a misconception, write a learning record in the format of [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md). Quote the question and the passage it was on. These records decide what the next lesson covers.
3. When no comments come back, the learner had no questions. Move on to the next step of teaching.

## The follow-up reminder in each lesson

When Plannotator is installed, the lesson's reminder to ask follow-up questions should say how: select the text, then choose Comment or Ask AI.
