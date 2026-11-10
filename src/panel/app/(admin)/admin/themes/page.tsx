'use client'

import { PageHeader } from '@/components/common/page-header'
import { ThemeManager } from '@/components/admin/theme-manager'

export default function AdminThemesPage() {
  return (
    <>
      <PageHeader
        title="主题"
        description="安装、发现并激活前台主题；主题只接管落地页，不影响管理后台"
      />
      <ThemeManager />
    </>
  )
}
