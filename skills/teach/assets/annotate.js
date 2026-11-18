// Lets the learner select any passage of a lesson, attach a question to it, and copy
// all questions as Markdown to paste to the teacher. Link from each lesson with
// <script src="../assets/annotate.js"></script> before </body>.
// Notes are saved in localStorage per lesson, so a reload keeps them.
(() => {
  // UI text. Translate these to the lesson's language when copying this file.
  const T = {
    ask: 'Ask about this',
    placeholder: 'What is unclear here?',
    save: 'Save',
    cancel: 'Cancel',
    questions: 'Questions',
    empty: 'Select any text in the lesson to ask about it.',
    copy: 'Copy for teacher',
    copied: 'Copied',
    copiedHint: 'Copied. Paste it into the chat.', // read out by screen readers
    jump: 'Show in lesson',
    remove: 'Delete',
    close: 'Close',
    heading: 'Questions on',
  }
  const ICON = {
    ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  }
  // A button with an icon and a label (label only for screen readers when hideLabel).
  // The icon and label sit in one .an-face span so setFace can swap both at once.
  const iconBtn = (icon, label, className = '', hideLabel = false) => {
    const b = document.createElement('button')
    b.className = className
    const face = document.createElement('span')
    face.className = 'an-face'
    face.innerHTML = ICON[icon]
    if (hideLabel) b.ariaLabel = b.title = label
    else face.append(label)
    b.append(face)
    return b
  }
  // Swaps a button's icon and label behind a short blur, so the change reads as one morph.
  function setFace(b, icon, label) {
    const face = b.querySelector('.an-face')
    face.classList.add('an-swap')
    setTimeout(() => {
      face.innerHTML = ICON[icon]
      face.append(label)
      face.classList.remove('an-swap')
    }, 90)
  }
  const CONTEXT = 32 // characters kept on each side of a quote to find it again
  const AROUND = 80 // characters of surrounding text copied with each question
  const lesson = location.pathname.split('/').slice(-2).join('/')
  const key = `annotate:${location.pathname}`
  const root = document.querySelector('main') || document.body

  let notes = []
  try { notes = JSON.parse(localStorage.getItem(key) || '[]') } catch {}
  const store = () => { try { localStorage.setItem(key, JSON.stringify(notes)) } catch {} }

  const css = `
.an-ui{--an-bg:var(--bg,#fbfaf7);--an-fg:var(--fg,#1d1d1b);--an-muted:var(--muted,#6b6a64);--an-rule:var(--rule,#d9d6cc);--an-accent:var(--accent,#1f5f8b);--an-ok:var(--ok,#2d7a3e);--an-card:var(--card,#f3f1ea);--an-shadow:0 1px 2px #0000001a,0 8px 24px #00000024;--an-ease:cubic-bezier(.23,1,.32,1);
  font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--an-fg)}
.an-ui button{font:inherit}
.an-ui button,button.an-ui{font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--an-rule);background:var(--an-bg);color:var(--an-fg);border-radius:999px;padding:.4em .95em;transition:transform .16s var(--an-ease),background-color .2s ease,border-color .2s ease,color .15s ease,filter .15s ease}
.an-ui button:active,button.an-ui:active{transform:scale(.97)}
.an-ui button:focus-visible,button.an-ui:focus-visible{outline:2px solid var(--an-accent);outline-offset:2px}
.an-face{display:inline-flex;align-items:center;gap:.45em;transition:filter .18s ease,opacity .18s ease}
.an-face.an-swap{filter:blur(2px);opacity:.3}
.an-ui .an-primary,button.an-ui.an-primary{background:var(--an-accent);border-color:var(--an-accent);color:var(--an-bg)}
.an-ui .an-primary.an-done{background:var(--an-ok);border-color:var(--an-ok)}
.an-ui .an-ghost{border-color:transparent;background:transparent;color:var(--an-muted);padding:.3em .6em}
@media (hover:hover) and (pointer:fine){
  .an-ui button:hover,button.an-ui:hover{filter:brightness(.96)}
  .an-ui .an-primary:hover,button.an-ui.an-primary:hover{filter:brightness(1.1)}
  .an-ui .an-ghost:hover{background:var(--an-bg);color:var(--an-fg);filter:none}
}
.an-ui svg{width:1.05em;height:1.05em;flex:none}
@keyframes an-in{from{opacity:0;transform:scale(.96)}}
@keyframes an-fade{from{opacity:0}}
.an-ask{position:absolute;z-index:1000;box-shadow:var(--an-shadow);animation:an-in .16s var(--an-ease)}
.an-pop,.an-panel{z-index:1001;background:var(--an-card);border:1px solid var(--an-rule);border-radius:14px;box-shadow:var(--an-shadow);animation:an-in .2s var(--an-ease)}
@media (prefers-reduced-motion:reduce){
  .an-ask,.an-pop,.an-panel{animation-name:an-fade}
  .an-ui button:active,button.an-ui:active{transform:none}
}
.an-pop{position:absolute;width:min(24rem,calc(100vw - 2rem));padding:.9rem}
.an-ui blockquote{margin:0 0 .6rem;padding:.1rem 0 .1rem .7rem;border-left:3px solid var(--an-accent);color:var(--an-muted);font-size:.92em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.an-ui blockquote strong{color:var(--an-fg);font-weight:600}
.an-pop textarea{display:block;width:100%;min-height:5rem;resize:vertical;font:inherit;padding:.55rem .7rem;border:1px solid var(--an-rule);border-radius:10px;background:var(--an-bg);color:var(--an-fg)}
.an-pop textarea:focus{outline:none;border-color:var(--an-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--an-accent) 25%,transparent)}
.an-row{display:flex;gap:.5rem;justify-content:flex-end;align-items:center;margin-top:.7rem}
.an-toggle{position:fixed;right:1.25rem;bottom:1.25rem;z-index:1000;gap:.45em;box-shadow:var(--an-shadow);padding:.55em 1.05em!important}
.an-count{display:inline-grid;place-items:center;min-width:1.5em;height:1.5em;padding:0 .4em;border-radius:999px;background:var(--an-accent);color:var(--an-bg);font-size:.78em;font-weight:600}
.an-panel{position:fixed;right:1.25rem;bottom:4.6rem;width:min(25rem,calc(100vw - 2.5rem));max-height:min(70vh,36rem);display:flex;flex-direction:column;transform-origin:bottom right}
.an-head{display:flex;align-items:center;justify-content:space-between;padding:.6rem .6rem .6rem 1rem;border-bottom:1px solid var(--an-rule)}
.an-head h2{all:unset;font-weight:600;font-size:1rem}
.an-head h2 span{color:var(--an-muted);font-weight:500;margin-left:.4em}
.an-body{overflow:auto;padding:.6rem}
.an-panel ol{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}
.an-panel li{position:relative;background:var(--an-bg);border:1px solid var(--an-rule);border-radius:10px;padding:.6rem 2.4rem .65rem .8rem}
.an-panel li blockquote{margin-bottom:.4rem;cursor:pointer;border-radius:0 4px 4px 0;transition:color .15s ease}
.an-panel li blockquote:focus-visible{outline:2px solid var(--an-accent);outline-offset:2px}
.an-panel li p{margin:0;white-space:pre-wrap}
.an-ui .an-del{position:absolute;top:.35rem;right:.35rem;padding:.4em}
@media (hover:hover) and (pointer:fine){
  .an-panel li blockquote:hover{color:var(--an-fg)}
  .an-ui .an-del{opacity:0;transition:opacity .15s ease,transform .16s var(--an-ease)}
  .an-panel li:hover .an-del,.an-panel li:focus-within .an-del{opacity:1}
}
.an-empty{margin:1.5rem .5rem;text-align:center;color:var(--an-muted)}
.an-foot{padding:.6rem;border-top:1px solid var(--an-rule)}
.an-foot button{width:100%;padding:.6em 1em}
.an-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
mark.an-mark{background:color-mix(in srgb,var(--accent,#1f5f8b) 20%,transparent);color:inherit;border-bottom:2px solid var(--accent,#1f5f8b);border-radius:2px;cursor:pointer}
@keyframes an-flash{30%{background-color:color-mix(in srgb,var(--accent,#1f5f8b) 55%,transparent)}}
mark.an-flash{animation:an-flash .9s ease}
[hidden]{display:none!important}`
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }))

  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props)
    n.append(...kids)
    return n
  }
  const ui = (n) => (n.classList.add('an-ui'), document.body.append(n), n)
  const inUi = (n) => !!(n && (n.nodeType === 1 ? n : n.parentElement)?.closest('.an-ui'))

  // Text nodes of the lesson, flattened into one string with each node's offset.
  function textMap() {
    const nodes = []
    let text = ''
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (inUi(n) || n.parentElement.closest('script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    })
    for (let n; (n = walker.nextNode()); ) {
      nodes.push({ node: n, start: text.length })
      text += n.data
    }
    return { nodes, text }
  }

  function offsetOf(map, node, offset) {
    if (node.nodeType !== 3) {
      // Element boundary: use the first text node at or after that child.
      const r = document.createRange()
      r.setStart(node, offset)
      const hit = map.nodes.find((t) => r.comparePoint(t.node, 0) >= 0)
      return hit ? hit.start : map.text.length
    }
    const hit = map.nodes.find((t) => t.node === node)
    return hit ? hit.start + offset : -1
  }

  // Wraps text from global offset a to b in <mark>, one per text node it spans.
  function wrap(map, a, b, id) {
    for (const { node, start } of map.nodes) {
      const s = Math.max(a, start)
      const e = Math.min(b, start + node.data.length)
      if (s >= e) continue
      let target = node
      if (e - start < node.data.length) target.splitText(e - start)
      if (s > start) target = target.splitText(s - start)
      const mark = el('mark', { className: 'an-mark', title: T.questions })
      mark.dataset.note = id
      target.replaceWith(mark)
      mark.append(target)
    }
  }

  function anchor(note) {
    const map = textMap()
    let i = map.text.indexOf(note.prefix + note.quote + note.suffix)
    if (i >= 0) i += note.prefix.length
    else i = map.text.indexOf(note.quote)
    if (i >= 0) wrap(map, i, i + note.quote.length, note.id)
  }

  function unwrap(id) {
    for (const m of document.querySelectorAll(`mark.an-mark[data-note="${id}"]`)) {
      const parent = m.parentNode
      m.replaceWith(...m.childNodes)
      parent.normalize()
    }
  }

  // Floating "Ask" button near the selection.
  const askBtn = ui(iconBtn('ask', T.ask, 'an-ask an-primary'))
  askBtn.hidden = true
  let pending = null

  // Puts n above the selection, centred on it, or below when there is no room above.
  function placeNear(n, rect, above = false) {
    const h = n.offsetHeight
    const top = above && rect.top > h + 16 ? rect.top - h - 10 : rect.bottom + 10
    const mid = rect.left + rect.width / 2
    const left = Math.max(8, Math.min(mid - n.offsetWidth / 2, innerWidth - n.offsetWidth - 8))
    n.style.top = `${window.scrollY + top}px`
    n.style.left = `${window.scrollX + left}px`
    // Grow from the selection, not from the box's own centre.
    n.style.transformOrigin = `${mid - left}px ${top < rect.top ? '100%' : '0'}`
  }

  document.addEventListener('selectionchange', () => {
    clearTimeout(askBtn.t)
    askBtn.t = setTimeout(() => {
      const sel = getSelection()
      if (!sel.rangeCount || sel.isCollapsed || inUi(sel.anchorNode) || !root.contains(sel.anchorNode)) {
        if (!pop.contains(document.activeElement)) askBtn.hidden = true
        return
      }
      const range = sel.getRangeAt(0)
      const quote = range.toString().trim()
      if (!quote) return
      pending = range.cloneRange()
      askBtn.hidden = false
      placeNear(askBtn, range.getBoundingClientRect(), true)
    }, 250)
  })

  // Popover to write the question.
  const quoteEl = el('blockquote')
  const input = el('textarea', { placeholder: T.placeholder, ariaLabel: T.placeholder })
  const saveBtn = el('button', { className: 'an-primary', textContent: T.save })
  const cancelBtn = el('button', { className: 'an-ghost', textContent: T.cancel })
  const pop = ui(el('div', { className: 'an-pop', hidden: true, role: 'dialog' }, quoteEl, input, el('div', { className: 'an-row' }, cancelBtn, saveBtn)))

  askBtn.addEventListener('mousedown', (e) => e.preventDefault()) // keep the selection
  askBtn.addEventListener('click', () => {
    if (!pending) return
    quoteEl.textContent = pending.toString().trim()
    input.value = ''
    askBtn.hidden = true
    pop.hidden = false
    placeNear(pop, pending.getBoundingClientRect())
    input.focus()
  })

  const closePop = () => { pop.hidden = true; pending = null }
  cancelBtn.addEventListener('click', closePop)
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePop()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveBtn.click()
  })

  // Where a quote sits, so a short quote that appears more than once is still
  // unambiguous: the nearest heading above it, and the words around it within
  // its paragraph (or list item, cell, ...), cut at word boundaries.
  const flat = (t) => t.replace(/\s+/g, ' ')
  function where(map, a, b, node) {
    const start = node.nodeType === 1 ? node : node.parentElement
    const block = start.closest('p,li,tr,dt,dd,blockquote,figcaption,pre,summary,h1,h2,h3,h4,h5,h6') || root
    const from = offsetOf(map, block, 0)
    const to = from + block.textContent.length
    let s = Math.max(from, a - AROUND)
    let e = Math.min(to, b + AROUND)
    if (s > from) { const i = map.text.indexOf(' ', s); if (i >= 0 && i < a) s = i + 1 }
    if (e < to) { const i = map.text.lastIndexOf(' ', e); if (i > b) e = i }
    const heads = [...root.querySelectorAll('h1,h2,h3,h4')]
      .filter((h) => h.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING)
    return {
      section: heads.length ? flat(heads.at(-1).textContent).trim() : '',
      before: (s > from ? '…' : '') + flat(spaced(map, s, a)).trimStart(),
      after: flat(spaced(map, b, e)).trimEnd() + (e < to ? '…' : ''),
    }
  }

  // Text from x to y, with a space where it crosses from one table cell to the
  // next (cells often have no whitespace between them), and at the x edge when
  // x itself is a cell boundary.
  function spaced(map, x, y) {
    let out = ''
    let prev = cellAt(map, x - 1)
    for (const { node, start } of map.nodes) {
      const s = Math.max(x, start)
      const e = Math.min(y, start + node.data.length)
      if (s >= e) continue
      const cell = node.parentElement.closest('td,th')
      if (cell !== prev && cell && prev) out += ' '
      out += node.data.slice(s - start, e - start)
      prev = cell
    }
    if (y > x && cellAt(map, y - 1) !== cellAt(map, y) && cellAt(map, y)) out += ' '
    return out
  }
  const cellAt = (map, i) => map.nodes.find((t) => i >= t.start && i < t.start + t.node.data.length)?.node.parentElement.closest('td,th') ?? null

  saveBtn.addEventListener('click', () => {
    const question = input.value.trim()
    if (!pending || !question) return input.focus()
    const map = textMap()
    let a = offsetOf(map, pending.startContainer, pending.startOffset)
    let b = offsetOf(map, pending.endContainer, pending.endOffset)
    if (a < 0 || b <= a) return closePop()
    while (a < b && /\s/.test(map.text[a])) a++ // trim like the shown quote
    while (b > a && /\s/.test(map.text[b - 1])) b--
    const note = {
      id: Date.now().toString(36),
      quote: map.text.slice(a, b),
      prefix: map.text.slice(Math.max(0, a - CONTEXT), a),
      suffix: map.text.slice(b, b + CONTEXT),
      ...where(map, a, b, pending.startContainer),
      question,
    }
    notes.push(note)
    store()
    wrap(map, a, b, note.id)
    getSelection().removeAllRanges()
    closePop()
    render()
  })

  // Panel listing every question, with the copy button.
  const count = el('span', { className: 'an-count' })
  const toggle = ui(iconBtn('ask', T.questions, 'an-toggle'))
  toggle.append(count)
  toggle.ariaExpanded = 'false'
  const list = el('ol')
  const emptyEl = el('p', { className: 'an-empty', textContent: T.empty })
  const copyBtn = iconBtn('copy', T.copy, 'an-primary')
  const closeBtn = iconBtn('close', T.close, 'an-ghost', true)
  const status = el('p', { className: 'an-sr', ariaLive: 'polite' })
  const headCount = el('span')
  const panel = ui(el('section', { className: 'an-panel', hidden: true, ariaLabel: T.questions },
    el('div', { className: 'an-head' }, el('h2', {}, T.questions, headCount), closeBtn),
    el('div', { className: 'an-body' }, emptyEl, list),
    el('div', { className: 'an-foot' }, copyBtn, status)))

  function showPanel(open) {
    panel.hidden = !open
    toggle.ariaExpanded = String(open)
  }

  // Scrolls the lesson to a question's passage and flashes its highlight. Closes
  // the panel first when it covers the lesson column, so the flash is visible.
  function jump(id) {
    const marks = [...document.querySelectorAll(`mark.an-mark[data-note="${id}"]`)]
    if (!marks.length) return
    if (panel.getBoundingClientRect().left < root.getBoundingClientRect().right) showPanel(false)
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    marks[0].scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
    for (const m of marks) {
      m.classList.remove('an-flash')
      void m.offsetWidth // restart the animation
      m.classList.add('an-flash')
    }
  }
  toggle.addEventListener('click', () => showPanel(panel.hidden))
  closeBtn.addEventListener('click', () => showPanel(false))
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) showPanel(false) })
  // A click outside the panel closes it; clicks on highlights open it (below).
  document.addEventListener('mousedown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target) && !e.target.closest?.('mark.an-mark')) showPanel(false)
  })

  function render() {
    count.textContent = notes.length
    count.hidden = notes.length === 0
    headCount.textContent = notes.length || ''
    emptyEl.hidden = notes.length > 0
    copyBtn.parentElement.hidden = notes.length === 0
    list.replaceChildren(...notes.map((n) => {
      const del = iconBtn('trash', T.remove, 'an-ghost an-del', true)
      del.addEventListener('click', () => {
        notes = notes.filter((x) => x.id !== n.id)
        store()
        unwrap(n.id)
        render()
        if (!notes.length) showPanel(false)
      })
      const quote = el('blockquote', { tabIndex: 0, role: 'button', title: T.jump }, n.before ?? '', el('strong', { textContent: n.quote }), n.after ?? '')
      quote.addEventListener('click', () => jump(n.id))
      quote.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(n.id) }
      })
      return el('li', {}, quote, el('p', { textContent: n.question }), del)
    }))
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest?.('mark.an-mark')) showPanel(true)
  })

  function markdown() {
    // 1. § Section heading
    //    > words before **the selected text** words after
    //
    //    the question
    const items = notes.map((n, i) => {
      const section = n.section ? `§ ${n.section}\n   ` : ''
      const passage = `${n.before ?? ''}**${flat(n.quote)}**${n.after ?? ''}`
      return `${i + 1}. ${section}> ${passage}\n\n   ${n.question.replace(/\n/g, '\n   ')}`
    })
    return `${T.heading} ${lesson}\n\n${items.join('\n\n')}\n`
  }

  copyBtn.addEventListener('click', async () => {
    const text = markdown()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // file:// pages may not get the async clipboard; fall back to a hidden textarea.
      const ta = el('textarea', { value: text })
      document.body.append(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    status.textContent = T.copiedHint
    copyBtn.classList.add('an-done')
    setFace(copyBtn, 'check', T.copied)
    clearTimeout(copyBtn.t)
    copyBtn.t = setTimeout(() => {
      copyBtn.classList.remove('an-done')
      setFace(copyBtn, 'copy', T.copy)
      status.textContent = ''
    }, 2000)
  })

  for (const n of notes) anchor(n)
  render()
})()
