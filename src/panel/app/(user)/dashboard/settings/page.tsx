'use client'

import { Bell, KeyRound, Palette, ShieldCheck, UserRound } from 'lucide-react'
import { PageHeader } from '@/components/common/page-header'
import {
  AppearancePanel,
  NotificationForm,
  ProfileForm,
  SecurityForm,
  TokenPanel
} from '@/components/user/settings-forms'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="个人设置"
        description="账号资料、登录密码、登录设备与 API Token。"
      />

      <Tabs defaultValue="profile" className="gap-4">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="profile">
            <UserRound data-icon aria-hidden="true" />
            资料
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck data-icon aria-hidden="true" />
            安全
          </TabsTrigger>
          <TabsTrigger value="notification">
            <Bell data-icon aria-hidden="true" />
            通知
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette data-icon aria-hidden="true" />
            外观
          </TabsTrigger>
          <TabsTrigger value="token">
            <KeyRound data-icon aria-hidden="true" />
            API Token
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>个人资料</CardTitle>
              <CardDescription>用户名与邮箱会展示在通知与工单中；邮箱是登录凭证，不可修改。</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>账号安全</CardTitle>
              <CardDescription>修改密码、查看登录设备；两步验证暂未开放。</CardDescription>
            </CardHeader>
            <CardContent>
              <SecurityForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notification">
          <Card>
            <CardHeader>
              <CardTitle>通知偏好</CardTitle>
              <CardDescription>通知偏好暂未接入，当前仅作展示。</CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>外观与区域</CardTitle>
              <CardDescription>主题、界面语言与时区</CardDescription>
            </CardHeader>
            <CardContent>
              <AppearancePanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="token">
          <Card>
            <CardHeader>
              <CardTitle>API Token</CardTitle>
              <CardDescription>脚本与外部工具访问 /api/v1 的凭证</CardDescription>
            </CardHeader>
            <CardContent>
              <TokenPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
