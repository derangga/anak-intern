# Asking questions inside a lesson

How the learner selects any passage of a lesson and asks about it, and what to do with their questions. This file and [assets/annotate.js](./assets/annotate.js) are a local addition to the teach skill from mattpocock/skills. When updating `SKILL.md` from upstream, re-add the two lines under "Lessons" that point here: the one about opening the lesson, and the one about the follow-up reminder.

## Adding the annotation component

Before writing the first lesson, copy [assets/annotate.js](./assets/annotate.js) from this skill's folder into the workspace's `./assets/`, unless it is already there. Translate the strings in its `T` object into the language the lessons are written in.

Every lesson loads it as its last script, before `</body>`:

```html
<script src="../assets/annotate.js"></script>
```

The component needs no server. The learner selects text, presses the button that appears, and types a question. The passage is highlighted and the question saved in the browser, so a reload keeps it. The Questions button in the corner lists every question, and "Copy for teacher" copies them all as Markdown for the learner to paste into the chat. Plain clicks do nothing, so quizzes keep working.

## Opening a lesson

Open the lesson file in the browser with a CLI command, such as `open` on macOS or `xdg-open` on Linux.

## After the learner pastes questions

The pasted text starts with a heading line that ends in `lessons/<file>.html` (its words are the translated `heading` string), followed by a numbered list. Each item looks like this:

```
1. § The nearest heading above the passage
   > …words before **the selected text** words after…

   The learner's question.
```

The bold text is what the learner selected. The words around it come from the same paragraph, list item or table row, so a short quote that appears more than once still points to one place.

1. Answer each question in chat, grounded in the lesson and its cited sources.
2. When a question shows a gap or a misconception, write a learning record in the format of [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md). Quote the question and the passage it was on. These records decide what the next lesson covers.
3. Tell the learner they can delete answered questions from the Questions list.

## The follow-up reminder in each lesson

The lesson's reminder to ask follow-up questions should say how: select the text, press the button that appears, then copy the questions from the Questions list and paste them into the chat.
