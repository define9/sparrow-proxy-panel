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
import { account } from '@/lib/mock/user-data'

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="个人设置"
        description={`${account.username} · ${account.email}。所有修改均为演示，不会写入后端。`}
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
              <CardDescription>昵称与邮箱会展示在工单与通知邮件中</CardDescription>
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
              <CardDescription>修改密码、开启两步验证、查看登录设备</CardDescription>
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
              <CardDescription>选择需要通过邮件接收的消息类型</CardDescription>
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
