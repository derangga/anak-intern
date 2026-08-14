import { createFileRoute, notFound } from '@tanstack/react-router'
import { chapterBySlug } from '@/content'

export const Route = createFileRoute('/learn/$slug')({
  loader: ({ params }) => {
    const chapter = chapterBySlug(params.slug)
    if (!chapter) throw notFound()
    return chapter
  },
  component: Chapter,
})

function Chapter() {
  const chapter = Route.useLoaderData()

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">
        {chapter.meta.title}
      </h1>
      {/* Built at compile time by vite-plugin-markdown, never user input. */}
      <div
        className="chapter-prose"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time HTML
        dangerouslySetInnerHTML={{ __html: chapter.html }}
      />
    </article>
  )
}
