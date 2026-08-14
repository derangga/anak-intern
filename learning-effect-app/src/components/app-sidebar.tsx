import { Link, useMatchRoute } from '@tanstack/react-router'
import { Compass, FlaskConical } from 'lucide-react'
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
import { bonusChapters, courseChapters } from '@/content'

export function AppSidebar() {
  const matchRoute = useMatchRoute()

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <Link to="/" className="font-semibold">
          Learning Effect
        </Link>
        <p className="text-muted-foreground text-xs">
          A course in {courseChapters.length} chapter
          {courseChapters.length === 1 ? '' : 's'}
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chapters</SidebarGroupLabel>
          <SidebarMenu>
            {courseChapters.map(({ meta }) => (
              <SidebarMenuItem key={meta.slug}>
                <SidebarMenuButton
                  isActive={
                    !!matchRoute({
                      to: '/learn/$slug',
                      params: { slug: meta.slug },
                    })
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
        {bonusChapters.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Bonus</SidebarGroupLabel>
            <SidebarMenu>
              {bonusChapters.map(({ meta }) => (
                <SidebarMenuItem key={meta.slug}>
                  <SidebarMenuButton
                    isActive={
                      !!matchRoute({
                        to: '/learn/$slug',
                        params: { slug: meta.slug },
                      })
                    }
                    render={
                      <Link to="/learn/$slug" params={{ slug: meta.slug }}>
                        <Compass className="size-4" />
                        <span className="truncate">{meta.title}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
        <SidebarGroup>
          <SidebarGroupLabel>Try it</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={!!matchRoute({ to: '/demo' })}
                render={
                  <Link to="/demo">
                    <FlaskConical className="size-4" />
                    <span className="truncate">Live demo</span>
                  </Link>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
