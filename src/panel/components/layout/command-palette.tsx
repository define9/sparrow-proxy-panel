'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Package, Search, Server, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { adminNav, label, userNav, type NavItem } from '@/lib/navigation'

interface CommandPaletteProps {
  navKey: 'user' | 'admin'
  items?: NavItem[]
}

export function CommandPalette({ navKey, items }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('search')

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const pages = (items ?? (navKey === 'admin' ? adminNav : userNav)).flatMap((item) => [
    item,
    ...(item.items ?? [])
  ])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <Button variant="outline" size="sm" className="w-full max-w-64 justify-start text-muted-foreground md:w-64" onClick={() => setOpen(true)}>
        <Search data-icon="inline-start" />
        <span className="truncate">{t('placeholder')}</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] md:inline">⌘K</kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t('placeholder')} />
        <CommandList>
          <CommandEmpty>{t('empty')}</CommandEmpty>
          <CommandGroup heading={t('pages')}>
            {pages.map((item) => (
              <CommandItem
                key={`${item.href}-${item.label.en}`}
                value={`${label(item, locale)} ${item.label.en}`}
                onSelect={() => go(item.href)}
              >
                <item.icon />
                <span>{label(item, locale)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t('actions')}>
            <CommandItem value="new plan create" onSelect={() => go('/admin/plans?create=1')}>
              <Package />
              <span>新建商品</span>
            </CommandItem>
            <CommandItem value="new node create" onSelect={() => go('/admin/nodes?create=1')}>
              <Server />
              <span>新建节点</span>
            </CommandItem>
            <CommandItem value="users" onSelect={() => go('/admin/users')}>
              <UserPlus />
              <span>查看用户</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
