# Comment commands

Every command is a single-line HTML comment. `presenterm --list-comment-commands` prints the authoritative list at any time.

```
<!-- pause -->                      reveal the rest of the slide on next keypress
<!-- end_slide -->                  end the slide
<!-- new_line -->                   one blank line (markdown collapses repeats)
<!-- new_lines: 10 -->              n blank lines
<!-- jump_to_middle -->             vertically center what follows
<!-- column_layout: [1, 2] -->      define columns by relative size units
<!-- column: 0 -->                  enter a column (0-indexed)
<!-- reset_layout -->               leave columns, back to full width
<!-- incremental_lists: true -->    every bullet gets its own reveal, until slide end
<!-- list_item_newlines: 2 -->      blank lines between list items, until slide end
<!-- no_footer -->                  hide the footer on this slide
<!-- font_size: 2 -->               font size 1-7, until slide end (kitty only)
<!-- alignment: center -->          left | center | right, until slide end
<!-- skip_slide -->                 omit this slide from the presentation
<!-- include: file.md -->           inline another markdown file
<!-- speaker_note: text -->         note shown only to the listener instance
<!-- snippet_output: id -->         render an +exec snippet's output here
<!-- // text -->                    user comment, never rendered
<!-- comment: text -->              user comment, never rendered
```

## Column layouts

Define a layout, then enter each column. Sizes are relative units: `[3, 2]` is 60% / 40% of five total units.

~~~markdown
Layout example
==============

<!-- column_layout: [2, 1] -->

<!-- column: 0 -->

This is some code I like:

```rust
fn potato() -> u32 { 42 }
```

<!-- column: 1 -->

![](doge.png)

<!-- reset_layout -->

Below both columns.
~~~

A column stays active until the next `column`, a `reset_layout`, or the end of the slide. presenterm has no div/HTML layout — columns are the only layout primitive.

To center a block of content, define `[1, 3, 1]` and write only into column 1.

Press `T` while presenting to toggle a visual grid showing column widths.

## Incremental lists

`<!-- pause -->` between bullets works but is tedious. `incremental_lists` does it for the rest of the slide, and toggles back off:

```markdown
<!-- incremental_lists: true -->

* this
* appears
* one after the other

<!-- incremental_lists: false -->

* all at once
```

Set it deck-wide with the `options.incremental_lists` front-matter option. Pauses before and after each list are on by default; turn them off with `defaults.incremental_lists.pause_before` / `pause_after` in `config.yaml`.

## Images

Paths are relative to the presentation file. Rendered at original size, downscaled to fit if too large, aspect ratio always preserved. Remote images are unsupported by design.

```markdown
![image:width:50%](image.png)
```

The `image:` attribute prefix is configurable via `options.image_attributes_prefix` — set it to `""` to write `![width:50%](path.png)`.

Requires a terminal supporting the iterm2, kitty, or sixel graphics protocol (kitty, iterm2, WezTerm, ghostty, foot). Anything else falls back to ascii blocks. Under tmux, enable `allow-passthrough`. Protocol detection is automatic; override with `--image-protocol` or `defaults.image_protocol`.

## Speaker notes

```markdown
<!-- speaker_note: this is a speaker note -->
```

Multiline uses YAML block syntax, and is the one case where a multi-line HTML comment carries a command:

```yaml
<!--
speaker_note: |
  something
  something else
-->
```

Two instances communicate over localhost UDP:

```bash
presenterm demo.md --publish-speaker-notes   # what the audience sees
presenterm demo.md --listen-speaker-notes    # notes only, follows the main instance
```

Set `speaker_notes.always_publish: true` in `config.yaml` to skip the publish flag forever. Linux and Windows allow many publishers and listeners at once; macOS allows a single listener.

## Includes

```markdown
<!-- include: foo.md -->
```

Paths inside an included file resolve relative to that file — include `foo/bar.md` and its `tar.png` is looked up at `foo/tar.png`.
