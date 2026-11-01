'use client'

import Link from 'next/link'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const loginSchema = z.object({
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少 8 位'),
  remember: z.boolean()
})

type LoginValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: true }
  })
  const { errors, isSubmitting } = form.formState

  function onSubmit() {
    toast.info('演示环境：登录接口未接入')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">登录到控制台</h1>
        <p className="text-sm text-muted-foreground">管理订阅、流量与设备，随时掌握账号状态。</p>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">邮箱</FieldLabel>
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

              <Field data-invalid={!!errors.password}>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="password">密码</FieldLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    忘记密码？
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="至少 8 位"
                  aria-invalid={!!errors.password}
                  {...form.register('password')}
                />
                <FieldError errors={[errors.password]} />
              </Field>

              <Controller
                control={form.control}
                name="remember"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="remember" className="cursor-pointer font-normal text-muted-foreground">
                      保持登录
                    </FieldLabel>
                    <Switch
                      id="remember"
                      size="sm"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="ml-auto"
                    />
                  </Field>
                )}
              />

              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? '登录中…' : '登录'}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        还没有账号？
        <Link href="/register" className="ml-1 font-medium text-foreground underline-offset-4 hover:underline">
          立即注册
        </Link>
      </p>

      <p className="text-center text-xs text-muted-foreground">演示环境不会发出真实请求</p>
    </div>
  )
}
