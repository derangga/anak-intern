import { useEffect, useRef } from 'react'

/** Watch the html element for the dark class, so mermaid can re-theme. */
function useIsDark() {
  const ref = useRef(
    typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'),
  )
  const listeners = useRef(new Set<(dark: boolean) => void>())

  useEffect(() => {
    const el = document.documentElement
    const observer = new MutationObserver(() => {
      const dark = el.classList.contains('dark')
      if (dark === ref.current) return
      ref.current = dark
      for (const fn of listeners.current) fn(dark)
    })
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return {
    get current() {
      return ref.current
    },
    subscribe(fn: (dark: boolean) => void) {
      listeners.current.add(fn)
      return () => listeners.current.delete(fn)
    },
  }
}

/** Add a copy button to every highlighted code block. */
function useCopyButtons(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const blocks = root.current?.querySelectorAll('pre.shiki')
    if (!blocks) return

    const cleanups: Array<() => void> = []
    for (const pre of blocks) {
      if (!(pre instanceof HTMLElement)) continue

      // The button lives on a wrapper, not inside the pre. The pre is the
      // scrolling box, so a button inside it slides away with the code.
      const wrapper = document.createElement('div')
      wrapper.className = 'code-block'
      pre.replaceWith(wrapper)
      wrapper.appendChild(pre)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'copy-button'
      button.textContent = 'Copy'
      button.setAttribute('aria-label', 'Copy code')

      const onClick = async () => {
        // Twoslash injects popups into the DOM; the code element's text is
        // still the source the reader sees, so copy exactly that.
        const code = pre.querySelector('code')?.textContent ?? ''
        await navigator.clipboard.writeText(code)
        button.textContent = 'Copied'
        setTimeout(() => {
          button.textContent = 'Copy'
        }, 1500)
      }

      button.addEventListener('click', onClick)
      wrapper.appendChild(button)
      cleanups.push(() => {
        button.removeEventListener('click', onClick)
        button.remove()
        wrapper.replaceWith(pre)
      })
    }

    return () => {
      for (const fn of cleanups) fn()
    }
  }, [root])
}

/**
 * Render mermaid diagrams, loading the library only on chapters that have one.
 * Mermaid is around half a megabyte, so a chapter without a diagram must not
 * pay for it.
 */
function useMermaid(
  root: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  theme: ReturnType<typeof useIsDark>,
) {
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const draw = async (dark: boolean) => {
      const nodes = root.current?.querySelectorAll<HTMLElement>('pre.mermaid')
      if (!nodes?.length) return

      const mermaid = (await import('mermaid')).default
      if (cancelled) return

      for (const node of nodes) {
        // Mermaid replaces the element's contents with an SVG, so keep the
        // source around or a re-theme has nothing left to draw from.
        node.dataset.source ??= node.textContent ?? ''
        node.textContent = node.dataset.source
        node.removeAttribute('data-processed')
      }

      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? 'dark' : 'default',
      })
      await mermaid.run({ nodes: Array.from(nodes) })
    }

    void draw(theme.current)
    const unsubscribe = theme.subscribe((dark) => void draw(dark))

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [root, enabled, theme])
}

export function ChapterContent({
  html,
  hasMermaid,
}: {
  html: string
  hasMermaid: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useIsDark()

  useCopyButtons(ref)
  useMermaid(ref, hasMermaid, theme)

  return (
    <div
      ref={ref}
      className="chapter-prose"
      // Built at compile time by vite-plugin-markdown, never user input.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time HTML
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
