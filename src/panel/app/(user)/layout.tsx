import { AppShell } from '@/components/layout/app-shell'
import { requireSession } from '@/lib/auth/guard'

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession('/dashboard')

  return (
    <AppShell
      navKey="user"
      permissions={session.permissions}
      title="用户中心"
      user={session.user}
    >
      {children}
    </AppShell>
  )
}
