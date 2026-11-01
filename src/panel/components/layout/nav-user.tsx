'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Check, ChevronsUpDown, Globe, LayoutDashboard, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { localeNames, locales, type Locale } from '@/i18n/config'
import type { SessionUser } from '@/lib/auth/types'

function writeLocaleCookie(next: string) {
  document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`
}

export function NavUser({ user }: { user: SessionUser }) {
  const initials = user.username.slice(0, 2).toUpperCase()
  const isAdmin = user.role !== 'user'
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    setLoggingOut(true)
    await fetch('/api/v1/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const t = useTranslations('userMenu')
  const ta = useTranslations('auth')
  const locale = useLocale() as Locale
  const router = useRouter()
  const { isMobile } = useSidebar()
  const { theme, setTheme } = useTheme()
  const [switching, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const themeOptions = [
    { value: 'light', label: t('light'), icon: Sun },
    { value: 'dark', label: t('dark'), icon: Moon },
    { value: 'system', label: t('system'), icon: Monitor }
  ]

  function switchLocale(next: Locale) {
    writeLocaleCookie(next)
    startTransition(() => router.refresh())
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.username}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.username}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings />
                  {t('profile')}
                </Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <Link href="/admin">
                    <LayoutDashboard />
                    {t('admin')}
                  </Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun />
                {t('theme')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {themeOptions.map((option) => (
                  <DropdownMenuItem key={option.value} onSelect={() => setTheme(option.value)}>
                    <option.icon />
                    {option.label}
                    {theme === option.value ? <Check className="ml-auto" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Globe />
                {t('language')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {locales.map((code) => (
                  <DropdownMenuItem key={code} disabled={switching} onSelect={() => switchLocale(code)}>
                    {localeNames[code]}
                    {locale === code ? <Check className="ml-auto" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={loggingOut} onSelect={logout}>
              <LogOut />
              {ta('logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
