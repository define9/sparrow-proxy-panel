'use client'

import Link from 'next/link'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ArrowLeft, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ApiClientError, apiFetch } from '@/lib/api/client'

const forgotSchema = z.object({
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确')
})

type ForgotValues = z.infer<typeof forgotSchema>

export default function ForgotPasswordPage() {
  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' }
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit(values: ForgotValues) {
    try {
      await apiFetch('/api/v1/auth/email-code', { method: 'POST', body: { email: values.email } })
    } catch (error) {
      if (error instanceof ApiClientError && error.payload.data?.field === 'email') {
        form.setError('email', { message: error.message })
        return
      }
    }
    // 重置密码流程尚未接入，不假装发送成功邮件
    toast.info('演示环境不支持重置', {
      description: '请联系管理员在后台为你重置密码。'
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">找回密码</h1>
        <p className="text-sm text-muted-foreground">输入注册邮箱，我们会发送一封重置密码的邮件。</p>
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
                <FieldDescription>重置链接 30 分钟内有效，失效后可重新申请。</FieldDescription>
              </Field>

              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? '发送中…' : '发送重置链接'}
                <Send data-icon="inline-end" />
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Button asChild variant="ghost" size="sm" className="mx-auto">
        <Link href="/login">
          <ArrowLeft data-icon="inline-start" />
          返回登录
        </Link>
      </Button>
    </div>
  )
}
