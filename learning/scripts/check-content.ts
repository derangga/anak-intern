/**
 * Renders every chapter through the markdown pipeline and asserts the three
 * things that must hold. Run with `bun run check:content`.
 *
 * This is the smallest thing that fails if the pipeline breaks. A twoslash
 * error in any chapter throws here, which is the point: broken teaching code
 * must not reach a reader.
 */
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { render } from '../vite-plugin-markdown.ts'

const dir = join(import.meta.dirname, '..', 'content')
const files = (await readdir(dir)).filter((f) => f.endsWith('.md'))

assert.ok(files.length > 0, 'no chapters found in content/')

const seenSlugs = new Set<string>()
const seenOrders = new Set<number>()

for (const file of files) {
  const path = join(dir, file)
  const source = await readFile(path, 'utf8')
  const { meta, headings, hasMermaid, html } = await render(source, path)

  assert.ok(meta.title, `${file}: missing frontmatter title`)
  assert.ok(meta.summary, `${file}: missing frontmatter summary`)
  assert.ok(
    !seenSlugs.has(meta.slug),
    `${file}: duplicate slug "${meta.slug}"`,
  )
  assert.ok(
    !seenOrders.has(meta.order),
    `${file}: duplicate order ${meta.order}`,
  )
  seenSlugs.add(meta.slug)
  seenOrders.add(meta.order)

  // Mermaid source must survive untouched, not get syntax highlighted.
  if (hasMermaid) {
    assert.match(
      html,
      /<pre class="mermaid">[^<]/,
      `${file}: mermaid block was mangled`,
    )
    assert.ok(
      !/<pre class="mermaid">\s*<span/.test(html),
      `${file}: mermaid block got highlighted`,
    )
  }

  // Highlighting must be dual theme, otherwise dark mode shows black on black.
  assert.ok(html.includes('shiki'), `${file}: no highlighted code found`)
  assert.ok(
    html.includes('--shiki-dark'),
    `${file}: highlighting is not dual theme`,
  )

  // Prose rule: no em dashes anywhere in the rendered chapter.
  assert.ok(
    !source.includes('—'),
    `${file}: contains an em dash, use a comma or a full stop instead`,
  )

  console.log(
    `ok  ${file}  order=${meta.order}  headings=${headings.length}  mermaid=${hasMermaid}`,
  )
}

console.log(`\n${files.length} chapter(s) rendered clean.`)
