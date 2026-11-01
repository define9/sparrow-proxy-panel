'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale } from 'next-intl'
import { ChevronRight, Radio } from 'lucide-react'
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
  SidebarRail
} from '@/components/ui/sidebar'
import { NavUser } from '@/components/layout/nav-user'
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
  const visible = filterNav(navKey === 'admin' ? adminNav : userNav, permissions)

  const isActive = (href: string) =>
    href === '/admin' || href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href="/">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Radio className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Sparrow</span>
                  <span className="text-xs text-muted-foreground">{title}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{title}</SidebarGroupLabel>
          <SidebarMenu>
            {visible.map((item) =>
              item.items?.length ? (
                <Collapsible key={item.href} asChild defaultOpen className="group/collapsible">
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
                              <Link href={sub.href}>
                                <span>{label(sub, locale)}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={label(item, locale)}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{label(item, locale)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            )}
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
