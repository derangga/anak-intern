import { Link, useMatchRoute } from '@tanstack/react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { chapters } from '@/content'

export function AppSidebar() {
  const matchRoute = useMatchRoute()

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <Link to="/" className="font-semibold">
          Learning Effect
        </Link>
        <p className="text-muted-foreground text-xs">
          A course in {chapters.length} chapters
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chapters</SidebarGroupLabel>
          <SidebarMenu>
            {chapters.map(({ meta }) => (
              <SidebarMenuItem key={meta.slug}>
                <SidebarMenuButton
                  isActive={
                    !!matchRoute({ to: '/learn/$slug', params: { slug: meta.slug } })
                  }
                  render={
                    <Link to="/learn/$slug" params={{ slug: meta.slug }}>
                      <span className="text-muted-foreground tabular-nums">
                        {String(meta.order).padStart(2, '0')}
                      </span>
                      <span className="truncate">{meta.title}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
