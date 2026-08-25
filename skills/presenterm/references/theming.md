# Theming

## Setting a theme

Four ways, in increasing specificity:

- `defaults.theme` in `config.yaml` (also supports `theme: {light: …, dark: …}`, picked by detecting the terminal's colors at launch).
- `--theme <name>` on the command line.
- Front matter, which wins over both:

```yaml
---
theme:
  name: dark          # built-in or custom theme by name
---
```

```yaml
---
theme:
  path: /home/me/epic-theme.yaml   # a theme file, by path
---
```

- Front-matter overrides, patched on top of whatever theme is active. Reloaded on save, so this is the fastest way to iterate on styling:

```yaml
---
theme:
  override:
    default:
      colors:
        foreground: "beeeff"
---
```

## Built-in themes

`dark`, `light`, `terminal-dark`, `terminal-light` (inherit the terminal's own colors, including a transparent or image background), `gruvbox-dark`, `catppuccin-latte`, `catppuccin-frappe`, `catppuccin-macchiato`, `catppuccin-mocha`, `tokyonight-day`, `tokyonight-moon`, `tokyonight-night`, `tokyonight-storm`.

`presenterm --list-themes` runs a deck rendering the same content in every theme. `presenterm --current-theme` prints the active one.

Any `.yaml` file in `<config-dir>/themes/` (e.g. `~/.config/presenterm/themes/`) is loaded at startup and usable exactly like a built-in.

## Theme file schema

### extends

Inherit everything from another theme, custom or built-in, and override the rest:

```yaml
extends: dark
default:
  colors:
    background: "000000"
```

### Alignment

Supported on code blocks, slide titles, tables, and the intro slide's title/subtitle/author.

```yaml
alignment: left        # left | center | right
margin:
  fixed: 5             # columns, regardless of terminal size
# or
margin:
  percent: 8           # percent of terminal columns; degrades better on resize
```

Center alignment takes different keys: `minimum_size` (useful on code blocks, to extend the background past the code) and `minimum_margin` (same structure as `margin`). The two interact badly; prefer one.

### default

Margin applied to every slide, and the fallback colors for all text. Colors are hex, everywhere.

```yaml
default:
  margin:
    percent: 8
  colors:
    foreground: "e6e6e6"
    background: "040312"
```

### intro_slide

Rendered when the front matter sets `title`, `sub_title`, or `author`. `positioning` is `page_bottom` or `below_title`.

```yaml
intro_slide:
  title:
    alignment: left
    margin:
      percent: 8
  author:
    colors:
      foreground: black
    positioning: below_title
```

### footer

Three styles. Template footers put markdown (including `span` tags) at left, center, and/or right:

```yaml
footer:
  style: template
  left: "My **name** is {author}"
  center: "_@myhandle_"
  right: "{current_slide} / {total_slides}"
  height: 3            # terminal rows, default 2
```

Substitutable variables are `{current_slide}`, `{total_slides}`, and any front-matter attribute: `title`, `sub_title`, `event`, `location`, `date`, `author`. Referencing a variable that isn't set, or one that doesn't exist, is an error. Escape a literal brace by doubling it: `{{potato}}` renders as `{potato}`.

Images work in any of the three positions, looked up first relative to the presentation and then relative to the themes directory. They scale to `footer.height` rows, so raise it for tall images:

```yaml
footer:
  style: template
  left:
    image: potato.png
  height: 5
```

The other two styles:

```yaml
footer:
  style: progress_bar
  character: 🚀        # optional; defaults to a block character
```

```yaml
footer:
  style: empty
```

### slide_title

```yaml
slide_title:
  prefix: "██"
  font_size: 2         # kitty only
  padding_top: 1
  padding_bottom: 1
  separator: true      # horizontal rule under the title
  bold: true
  underlined: true
  italics: true
  colors:
    foreground: beeeff
    background: feeedd
```

### headings

`h1` through `h6`, each taking `prefix`, `colors`, `bold`, `underlined`, `italics`:

```yaml
headings:
  h1:
    prefix: "██"
    colors:
      foreground: beeeff
  h2:
    prefix: "▓▓▓"
```

### code

```yaml
code:
  theme_name: base16-eighties.dark
  padding:
    horizontal: 2
    vertical: 1
  background: false    # use the highlight theme's background around the block
  line_numbers: false  # default for all snippets
```

Highlighting themes (via [syntect](https://github.com/trishume/syntect)): base16-ocean.dark, base16-eighties.dark, base16-mocha.dark, base16-ocean.light, Catppuccin, Coldark, DarkNeon, InspiredGitHub, Nord-sublime, Solarized, Solarized (dark), Solarized (light), TwoDark, dracula-sublime, github-sublime-theme, gruvbox, onehalf, sublime-monokai-extended, sublime-snazzy, visual-studio-dark-plus, zenburn. Drop a `.tmTheme` file into `<config-dir>/themes/highlighting/` to add your own.

### block_quote, bold, italics

```yaml
block_quote:
  prefix: "▍ "
bold:
  colors:
    foreground: red
italics:
  colors:
    background: blue
```

Bold and italics have no color by default.

### alert

GitHub-style markdown alerts:

```yaml
alert:
  base_colors:
    foreground: red
    background: black
  prefix: "▍ "
  styles:
    note:      { color: blue,   title: Note,      icon: I }
    tip:       { color: green,  title: Tip,       icon: T }
    important: { color: cyan,   title: Important, icon: I }
    warning:   { color: orange, title: Warning,   icon: W }
    caution:   { color: red,    title: Caution,   icon: C }
```

### mermaid

```yaml
mermaid:
  background: transparent   # or a color, e.g. red / #F0F0F0
  theme: dark               # a mermaid theme name
```

## Color palette

Named colors and foreground/background pairs ("classes"), usable both inside the theme and from `span` tags in the presentation. This is how you avoid repeating hex values across a theme.

```yaml
palette:
  colors:
    red: "f78ca2"
    purple: "986ee2"
  classes:
    foo:
      foreground: "ff0000"
      background: "00ff00"
```

Reference a color anywhere a color is expected as `palette:red` or `p:red`. In the presentation:

```html
<span style="color: palette:red">this is red</span>
<span class="foo">this is foo-colored</span>
```

Palette colors also work in template footers and the intro slide.
