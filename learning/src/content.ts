import type { ChapterMeta, Heading } from '../vite-plugin-markdown'

export type Chapter = {
  meta: ChapterMeta
  headings: Array<Heading>
  hasMermaid: boolean
  html: string
}

// Adding a chapter is one step: drop a .md file in content/.
const modules = import.meta.glob<Chapter>('/content/*.md', { eager: true })

export const chapters: Array<Chapter> = Object.values(modules).sort(
  (a, b) => a.meta.order - b.meta.order,
)

/** The numbered course, in reading order. */
export const courseChapters = chapters.filter((c) => c.meta.group === 'course')

/** Extra reading, listed separately because it assumes the course. */
export const bonusChapters = chapters.filter((c) => c.meta.group === 'bonus')

export const chapterBySlug = (slug: string) =>
  chapters.find((c) => c.meta.slug === slug)

export const neighbours = (slug: string) => {
  const i = chapters.findIndex((c) => c.meta.slug === slug)
  return {
    prev: i > 0 ? chapters[i - 1] : undefined,
    next: i >= 0 && i < chapters.length - 1 ? chapters[i + 1] : undefined,
  }
}
