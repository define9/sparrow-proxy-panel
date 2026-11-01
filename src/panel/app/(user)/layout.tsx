import { AppShell } from '@/components/layout/app-shell'
import { getSession } from '@/lib/auth/session'

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <AppShell navKey="user" permissions={session.permissions} title="用户中心">
      {children}
    </AppShell>
  )
}
