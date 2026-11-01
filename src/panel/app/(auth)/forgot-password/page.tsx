'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, KeyRound, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ApiClientError, apiFetch } from '@/lib/api/client'

const emailSchema = z.object({
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确')
})

const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, '请输入 6 位数字验证码'),
    password: z.string().min(8, '密码至少 8 位'),
    confirmPassword: z.string().min(1, '请再次输入密码')
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致'
  })

type EmailValues = z.infer<typeof emailSchema>
type ResetValues = z.infer<typeof resetSchema>

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' }
  })

  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: '', password: '', confirmPassword: '' }
  })

  async function requestCode(values: EmailValues) {
    try {
      const result = await apiFetch<{ sent: boolean; devCode?: string }>(
        '/api/v1/auth/password/forgot',
        { method: 'POST', body: { email: values.email } }
      )

      setEmail(values.email)
      setStep('reset')

      if (result?.devCode) {
        // 本地日志 provider：接口直接回显验证码，方便自测
        resetForm.setValue('code', result.devCode, { shouldValidate: true })
        toast.info(`开发模式验证码：${result.devCode}`)
      } else {
        toast.success('如果该邮箱已注册，我们已发送验证码', {
          description: '请查收邮件，验证码 30 分钟内有效'
        })
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.payload.data?.field === 'email') {
          emailForm.setError('email', { message: error.message })
          return
        }
        toast.error('验证码发送失败', { description: error.message })
        return
      }
      toast.error('验证码发送失败', { description: '请稍后重试' })
    }
  }

  async function resetPassword(values: ResetValues) {
    try {
      await apiFetch('/api/v1/auth/password/reset', {
        method: 'POST',
        body: { email, code: values.code, password: values.password }
      })
      toast.success('密码已重置，请使用新密码登录')
      router.push('/login')
      router.refresh()
    } catch (error) {
      if (error instanceof ApiClientError) {
        const field = error.payload.data?.field
        if (field === 'code' || field === 'password' || field === 'confirmPassword') {
          resetForm.setError(field, { message: error.message })
          return
        }
        toast.error('重置密码失败', { description: error.message })
        return
      }
      toast.error('重置密码失败', { description: '请稍后重试' })
    }
  }

  const emailErrors = emailForm.formState.errors
  const resetErrors = resetForm.formState.errors

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">找回密码</h1>
        <p className="text-sm text-muted-foreground">
          {step === 'email'
            ? '输入注册邮箱，我们会发送一条验证码。'
            : `验证码已发送至 ${email}，填写后即可设置新密码。`}
        </p>
      </div>

      <Card>
        <CardContent>
          {step === 'email' ? (
            <form onSubmit={emailForm.handleSubmit(requestCode)} noValidate>
              <FieldGroup>
                <Field data-invalid={!!emailErrors.email}>
                  <FieldLabel htmlFor="email">邮箱</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-invalid={!!emailErrors.email}
                    {...emailForm.register('email')}
                  />
                  <FieldError errors={[emailErrors.email]} />
                  <FieldDescription>验证码 30 分钟内有效，失效后可重新获取。</FieldDescription>
                </Field>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={emailForm.formState.isSubmitting}
                >
                  {emailForm.formState.isSubmitting ? '发送中…' : '发送验证码'}
                  <MailCheck data-icon="inline-end" />
                </Button>
              </FieldGroup>
            </form>
          ) : (
            <form onSubmit={resetForm.handleSubmit(resetPassword)} noValidate>
              <FieldGroup>
                <Field data-invalid={!!resetErrors.code}>
                  <FieldLabel htmlFor="code">验证码</FieldLabel>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6 位数字"
                    aria-invalid={!!resetErrors.code}
                    {...resetForm.register('code')}
                  />
                  <FieldError errors={[resetErrors.code]} />
                </Field>

                <Field data-invalid={!!resetErrors.password}>
                  <FieldLabel htmlFor="password">新密码</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="至少 8 位"
                    aria-invalid={!!resetErrors.password}
                    {...resetForm.register('password')}
                  />
                  <FieldError errors={[resetErrors.password]} />
                </Field>

                <Field data-invalid={!!resetErrors.confirmPassword}>
                  <FieldLabel htmlFor="confirmPassword">确认新密码</FieldLabel>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="再次输入新密码"
                    aria-invalid={!!resetErrors.confirmPassword}
                    {...resetForm.register('confirmPassword')}
                  />
                  <FieldError errors={[resetErrors.confirmPassword]} />
                </Field>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={resetForm.formState.isSubmitting}
                >
                  {resetForm.formState.isSubmitting ? '提交中…' : '重置密码'}
                  <KeyRound data-icon="inline-end" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mx-auto"
                  onClick={() => setStep('email')}
                >
                  <ArrowLeft data-icon="inline-start" />
                  换个邮箱
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>

      <Button asChild variant="ghost" size="sm" className="mx-auto">
        <Link href="/login">
          <ArrowRight data-icon="inline-start" />
          返回登录
        </Link>
      </Button>
    </div>
  )
}
