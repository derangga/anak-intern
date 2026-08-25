# Configuration

`config.yaml` lives in presenterm's config directory:

- `$XDG_CONFIG_HOME/presenterm/` if set, else
- `~/.config/presenterm/` (Linux)
- `~/Library/Application Support/presenterm/` (macOS)
- `~/AppData/Roaming/presenterm/config/` (Windows)

Override with `--config-file` or `PRESENTERM_CONFIG_FILE`. Custom themes live in a `themes/` subdirectory of the same place.

Put this first line in the file for editor autocompletion via a YAML language server:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/mfontanini/presenterm/master/config-file-schema.json
```

## options, in the config file *or* front matter

Everything under `options` can be set globally in `config.yaml` or per-deck in the front matter, which is what makes a deck's source portable.

```yaml
---
options:
  implicit_slide_ends: true
  end_slide_shorthand: true
  h1_slide_titles: true
  command_prefix: "cmd:"
  incremental_lists: true
  strict_front_matter_parsing: false
  image_attributes_prefix: ""
  list_item_newlines: 2
  auto_render_languages:
    - mermaid
---
```

- **`implicit_slide_ends`.** A slide title implies the previous slide ended, so no `end_slide` needed between them.
- **`end_slide_shorthand`.** Thematic breaks (`---`) also terminate slides. `end_slide` still works.
- **`h1_slide_titles`.** The *first* `h1` in a slide becomes its title; later ones stay ordinary headings.
- **`command_prefix`.** Require a prefix on comment commands, freeing plain single-line HTML comments for notes. Without it, every single-line comment is parsed as a command and an unrecognised one errors.
- **`incremental_lists`.** Every list in the deck reveals one bullet at a time.
- **`strict_front_matter_parsing`.** Set `false` to tolerate unknown front-matter keys, e.g. a deck written for another tool.
- **`image_attributes_prefix`.** Defaults to `image:`; set `""` for `![width:50%](path.png)`.
- **`list_item_newlines`.** Blank lines between list items, default 1.
- **`auto_render_languages`.** Languages that get `+render` implicitly.

## defaults, config file only

```yaml
defaults:
  theme: light
  # or, picked by detecting terminal colors at launch:
  # theme:
  #   light: light
  #   dark: dark

  terminal_font_size: 16      # only needed on Windows, or if images size wrong
  image_protocol: kitty-local # auto | kitty-local | kitty-remote | iterm2 | sixel

  max_columns: 100
  max_columns_alignment: left # left | center | right
  max_rows: 100
  max_rows_alignment: center  # top | center | bottom

  incremental_lists:
    pause_before: true
    pause_after: true

  validate_overflows: always  # never | always | when_presenting | when_developing
```

`max_columns` / `max_rows` cap the presentation size on an oversized terminal and center it, so it doesn't look stretched.

`validate_overflows` checks every slide fits the screen at load, on reload, and on terminal resize, rather than making you scroll through looking for long lines. `when_presenting` means only under `-p`; `when_developing` means only when not under `-p`.

## Slide transitions

```yaml
transition:
  duration_millis: 750
  frames: 45
  animation:
    style: fade    # fade | slide_horizontal | collapse_horizontal
```

## Key bindings

Overrides, not additions. Redefining `next` discards its defaults entirely.

```yaml
bindings:
  next: ["l", "j", "<right>", "<page_down>", "<down>", " "]
  previous: ["h", "k", "<left>", "<page_up>", "<up>"]
  next_fast: ["n"]          # skips pauses, dynamic highlights, transitions
  previous_fast: ["p"]
  first_slide: ["gg"]
  last_slide: ["G"]
  go_to_slide: ["<number>G"]
  execute_code: ["<c-e>"]
  reload: ["<c-r>"]
  toggle_slide_index: ["<c-p>"]
  toggle_bindings: ["?"]
  close_modal: ["<esc>"]
  exit: ["<c-c>", "q"]
  suspend: ["<c-z>"]
```

## Snippets

```yaml
snippet:
  exec:
    enable: true          # same as running with -x
  exec_replace:
    enable: true          # same as running with -X
  render:
    threads: 2            # for +render blocks (mermaid, d2, typst)
```

Both `enable` flags run code from whatever deck you open, so enable them only for decks you trust.

Custom executors add or override a language:

```yaml
snippet:
  exec:
    custom:
      c++:
        filename: "snippet.cpp"
        environment:
          MY_FAVORITE_ENVIRONMENT_VAR: foo
        hidden_line_prefix: "/// "
        commands:
          - ["g++", "-std=c++20", "snippet.cpp", "-o", "snippet"]
          - ["./snippet"]
```

Every command's output goes into the snippet's output box, so silence build steps you don't want shown. The built-ins are defined in presenterm's [executors.yaml](https://github.com/mfontanini/presenterm/blob/master/executors.yaml).

## Diagram tooling

```yaml
mermaid:
  config_file: /home/foo/my_config_file.yml
  puppeteer_config_file: /home/foo/puppeteer.json
  scale: 2
d2:
  scale: 2
typst:
  ppi: 300
```

## Speaker notes

```yaml
speaker_notes:
  always_publish: true
```

## Exports

```bash
presenterm --export-html demo.md            # self-contained HTML, no dependencies
presenterm --export-pdf demo.md             # needs weasyprint
presenterm --export-pdf -o out.pdf demo.md
```

HTML export embeds all images and styles into a single file and needs nothing installed, which makes it the cheap way to check a deck parses. PDF needs [weasyprint](https://pypi.org/project/weasyprint/); with uv, `uv run --with weasyprint presenterm --export-pdf demo.md`. Output defaults to the deck's path with the extension swapped.

```yaml
export:
  dimensions:
    columns: 80         # defaults to your terminal size
    rows: 30
  pauses: new_slide     # default: pauses are ignored in exports
  snippets: sequential  # default: snippets execute in parallel
  pdf:
    fonts:
      normal: /path/Font.ttf
      italic: /path/Font-Oblique.ttf
      bold: /path/Font-Bold.ttf
      bold_italic: /path/Font-BoldOblique.ttf
```
