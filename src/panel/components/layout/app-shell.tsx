'use client'

import { CommandPalette } from '@/components/layout/command-palette'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'

interface AppShellProps {
  navKey: 'user' | 'admin'
  permissions: string[]
  title: string
  children: React.ReactNode
}

export function AppShell({ navKey, permissions, title, children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar navKey={navKey} permissions={permissions} title={title} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <CommandPalette navKey={navKey} />
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
