---
name: presenterm
description: Write and configure presenterm terminal slide decks. Use when authoring a presentation markdown file for presenterm, styling one with a custom theme, or editing presenterm's config.yaml.
---

# presenterm

A presentation is one markdown file. Slides are separated by **comment commands**, HTML comments that carry behaviour vanilla markdown can't express. Distilled from the presenterm 0.16.1 docs.

## Authoring a deck

1. **Front matter.** Set `title`, `sub_title`, `author` (or `authors:` list), `theme`, `options`. Any key present makes presenterm render an intro slide, so omit them all when no intro slide is wanted. `title` accepts arbitrary markdown.
2. **Write slides.** End every one with `<!-- end_slide -->`. Slide titles are setext headers (`Title` on one line, `===` under it). Reach for comment commands as needed. See `references/comment-commands.md`.
3. **Style it.** Pick a built-in theme by name, or write a custom one. See `references/theming.md`.
4. **Verify.** Export the deck to HTML and confirm exit 0. This catches malformed front matter, unknown theme names, stray single-line HTML comments, and unresolvable `include` paths without needing the TUI. The deck is not done until this passes and every slide ends with an explicit `end_slide`.

   ```bash
   printf 'export:\n  dimensions:\n    columns: 80\n    rows: 30\n' > /tmp/pcfg.yaml
   presenterm --config-file /tmp/pcfg.yaml --export-html -o /tmp/deck.html <deck>.md
   ```

   The `--config-file` with fixed `export.dimensions` is required when there's no TTY: presenterm otherwise ioctls the terminal for its size and dies with `Inappropriate ioctl for device`. Do not try to run presenterm without `--export-html` or `--export-pdf`. It is a TUI and will hang.

```markdown
---
title: My _first_ **presentation**
sub_title: (in presenterm!)
author: Me
theme:
  name: dark
---

Slide title
===========

* a point
* another

<!-- pause -->

**The reveal.**

<!-- end_slide -->
```

## Rules that bite

- **Single-line HTML comments are parsed as commands.** `<!-- remember to say potato -->` is an error, not a note. Write notes as `<!-- // note -->` or `<!-- comment: note -->`, or set `options.command_prefix` so only prefixed comments count as commands.
- **Multi-line HTML comments are never commands.** A `pause` inside one does nothing (the exception: multi-line `speaker_note` uses YAML block syntax deliberately).
- **Image and `include` paths are relative to the presentation file**, and included files resolve their own paths relative to themselves. Remote images are unsupported by design.
- **Only `span` tags are supported**, no other HTML.
- **Code execution is off by default.** `+exec` needs `-x`, `+exec_replace` / `+image` need `-X`.

## Frequently reached

Colored text takes `color` and `background-color` only, with values as hex or a theme palette reference:

```markdown
<span style="color: #ff0000; background-color: palette:foo">colored</span>
<span class="my_class">class from the theme palette</span>
```

Font size (kitty ≥ 0.40 only, silently ignored elsewhere), 1–7, applies to the rest of the slide:

```markdown
<!-- font_size: 2 -->
```

Alignment for the rest of the slide, either `left` (default), `center`, or `right`:

```markdown
<!-- alignment: center -->
```

Skip the whole slide, or drop the footer on it:

```markdown
<!-- skip_slide -->
<!-- no_footer -->
```

## Navigation

Arrows, `hjkl`, page up/down move slides. `gg` first, `G` last, `<n>G` to slide n, `<c-e>` execute snippet, `<c-r>` reload, `<c-p>` slide index modal, `?` key bindings modal, `T` toggle the layout grid, `<c-c>`/`q` exit. All rebindable. See `references/configuration.md`.

Hot reload is on unless you pass `--present`; saving the file jumps presenterm to the slide you edited.

## References

- `references/comment-commands.md` has the full command list, column layouts, pauses and incremental lists, images, speaker notes, includes.
- `references/code-blocks.md` covers highlighting, line selection, snippet execution and its attributes, mermaid, LaTeX/typst, d2.
- `references/theming.md` covers setting themes, built-in names, and the full theme file schema.
- `references/configuration.md` covers the `config.yaml` location, front-matter `options`, `defaults`, key bindings, transitions, exports.
