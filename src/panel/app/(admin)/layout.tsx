import { AppShell } from '@/components/layout/app-shell'
import { getSession } from '@/lib/auth/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <AppShell navKey="admin" permissions={session.permissions} title="管理后台">
      {children}
    </AppShell>
  )
}
