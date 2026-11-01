import { AppShell } from '@/components/layout/app-shell'
import { requirePermission } from '@/lib/auth/guard'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePermission('admin:dashboard:read')

  return (
    <AppShell
      navKey="admin"
      permissions={session.permissions}
      title="管理后台"
      user={session.user}
    >
      {children}
    </AppShell>
  )
}
