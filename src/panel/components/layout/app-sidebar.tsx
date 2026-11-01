'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale } from 'next-intl'
import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar
} from '@/components/ui/sidebar'
import { SparrowMark } from '@/components/brand/sparrow-mark'
import { NavUser } from '@/components/layout/nav-user'
import { usePrefetchRoute } from '@/lib/api/prefetch'
import type { SessionUser } from '@/lib/auth/types'
import { adminNav, filterNav, label, userNav } from '@/lib/navigation'

interface AppSidebarProps {
  navKey: 'user' | 'admin'
  permissions: string[]
  title: string
  user: SessionUser
}

export function AppSidebar({ navKey, permissions, title, user }: AppSidebarProps) {
  const pathname = usePathname()
  const locale = useLocale()
  const { state, isMobile } = useSidebar()
  const collapsed = state === 'collapsed' && !isMobile
  const prefetch = usePrefetchRoute()

  // 悬停/聚焦即预热：路由 chunk + 该页首个列表请求
  const warm = (href: string) => ({
    onMouseEnter: () => prefetch(href),
    onFocus: () => prefetch(href)
  })

  const visible = filterNav(navKey === 'admin' ? adminNav : userNav, permissions)

  const isActive = (href: string) =>
    href === '/admin' || href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={collapsed ? 'Sparrow Panel' : undefined}>
              <Link href="/">
                <SparrowMark className="size-8 shrink-0" />
                {collapsed ? null : (
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">Sparrow</span>
                    <span className="truncate text-xs text-muted-foreground">{title}</span>
                  </div>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {collapsed ? null : <SidebarGroupLabel>{title}</SidebarGroupLabel>}
          <SidebarMenu>
            {visible.map((item) => {
              // 折叠成图标时，分组父项退化为普通链接（点击进入该组的首页），
              // 否则点了没反应——子菜单在图标态也没地方展开。
              if (item.items?.length && collapsed) {
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={label(item, locale)}
                    >
                      <Link href={item.href} {...warm(item.href)}>
                        <item.icon />
                        <span>{label(item, locale)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              }

              if (item.items?.length) {
                return (
                  <Collapsible
                    key={item.href}
                    asChild
                    defaultOpen
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={label(item, locale)}>
                          <item.icon />
                          <span>{label(item, locale)}</span>
                          <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.items.map((sub) => (
                            <SidebarMenuSubItem key={sub.href}>
                              <SidebarMenuSubButton asChild isActive={pathname === sub.href}>
                                <Link href={sub.href} {...warm(sub.href)}>
                                  <span>{label(sub, locale)}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )
              }

              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={label(item, locale)}
                  >
                    <Link href={item.href} {...warm(item.href)}>
                      <item.icon />
                      <span>{label(item, locale)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
