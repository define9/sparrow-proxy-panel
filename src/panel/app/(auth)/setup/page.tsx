'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ArrowRight, CheckCircle2, Database, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const schema = z
  .object({
    siteName: z.string().trim().min(1, '请填写站点名称').max(64),
    email: z.string().email('邮箱格式不正确'),
    username: z.string().trim().min(2, '用户名至少 2 位').max(32),
    password: z.string().min(8, '密码至少 8 位').max(72),
    confirmPassword: z.string().min(8, '请再次输入密码'),
    token: z.string().optional()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword']
  })

type SetupValues = z.infer<typeof schema>

interface SetupStatus {
  initialized: boolean
  siteName: string
  tokenRequired: boolean
}

export default function SetupPage() {
  const router = useRouter()
  const [status, setStatus] = useState<SetupStatus | null>(null)

  const form = useForm<SetupValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      siteName: 'Sparrow Panel',
      email: '',
      username: 'admin',
      password: '',
      confirmPassword: '',
      token: ''
    }
  })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    let alive = true
    fetch('/api/v1/setup/status')
      .then((response) => response.json())
      .then((payload: SetupStatus) => {
        if (!alive) return
        setStatus(payload)
        if (payload.siteName) form.setValue('siteName', payload.siteName)
      })
      .catch(() => {
        if (alive) setStatus({ initialized: false, siteName: 'Sparrow Panel', tokenRequired: false })
      })
    return () => {
      alive = false
    }
  }, [form])

  async function onSubmit(values: SetupValues) {
    const response = await fetch('/api/v1/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values)
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      toast.error(payload?.message ?? '初始化失败')
      const field = payload?.data?.field ?? payload?.data?.path
      if (field === 'email') form.setError('email', { message: payload.message })
      return
    }

    toast.success('初始化完成，已使用该账号登录')
    router.push('/admin')
    router.refresh()
  }

  if (status === null) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (status.initialized) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="flex items-center justify-center gap-2 font-heading text-2xl font-semibold tracking-tight">
            <CheckCircle2 className="size-5 text-success" />
            站点已初始化
          </h1>
          <p className="text-sm text-muted-foreground">
            {status.siteName} 已经完成初始化，初始化向导是一次性的。
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">
            去登录
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="flex items-center justify-center gap-2 font-heading text-2xl font-semibold tracking-tight">
          <Sparkles className="size-5 text-primary" />
          初始化站点
        </h1>
        <p className="text-sm text-muted-foreground">
          创建第一个超级管理员，之后这个页面会自动失效。
        </p>
      </div>

      <Alert>
        <Database />
        <AlertTitle>环境检查</AlertTitle>
        <AlertDescription>
          数据库连接正常、迁移已应用。完成后会自动登录并跳转到管理后台。
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>站点信息</CardTitle>
          <CardDescription>站点名会显示在浏览器标题与镜像导航中，之后可在系统设置里改。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <Field data-invalid={!!errors.siteName}>
                <FieldLabel htmlFor="siteName">站点名称</FieldLabel>
                <Input
                  id="siteName"
                  placeholder="Sparrow Panel"
                  aria-invalid={!!errors.siteName}
                  {...form.register('siteName')}
                />
                <FieldError errors={[errors.siteName]} />
              </Field>

              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">管理员邮箱</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={!!errors.email}
                  {...form.register('email')}
                />
                <FieldError errors={[errors.email]} />
              </Field>

              <Field data-invalid={!!errors.username}>
                <FieldLabel htmlFor="username">用户名</FieldLabel>
                <Input
                  id="username"
                  autoComplete="username"
                  aria-invalid={!!errors.username}
                  {...form.register('username')}
                />
                <FieldError errors={[errors.username]} />
              </Field>

              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位"
                  aria-invalid={!!errors.password}
                  {...form.register('password')}
                />
                <FieldError errors={[errors.password]} />
              </Field>

              <Field data-invalid={!!errors.confirmPassword}>
                <FieldLabel htmlFor="confirmPassword">确认密码</FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  {...form.register('confirmPassword')}
                />
                <FieldError errors={[errors.confirmPassword]} />
              </Field>

              {status.tokenRequired ? (
                <Field data-invalid={!!errors.token}>
                  <FieldLabel htmlFor="token">初始化令牌</FieldLabel>
                  <Input
                    id="token"
                    placeholder="服务端 SETUP_TOKEN 的值"
                    aria-invalid={!!errors.token}
                    {...form.register('token')}
                  />
                  <FieldError errors={[errors.token]} />
                </Field>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                    初始化中…
                  </>
                ) : (
                  <>
                    创建管理员并进入
                    <ArrowRight data-icon="inline-end" />
                  </>
                )}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        该接口只在站点未初始化时可用，公网访问需要配置 SETUP_TOKEN
      </p>
    </div>
  )
}
