'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ArrowRight, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ApiClientError, apiFetch } from '@/lib/api/client'

const registerSchema = z
  .object({
    email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
    code: z.string().regex(/^\d{6}$/, '请输入 6 位数字验证码'),
    password: z.string().min(8, '密码至少 8 位'),
    confirmPassword: z.string().min(1, '请再次输入密码'),
    terms: z.boolean()
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致'
  })
  .refine((values) => values.terms, {
    path: ['terms'],
    message: '请先阅读并同意服务条款'
  })

type RegisterValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(0)
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', code: '', password: '', confirmPassword: '', terms: false }
  })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  async function handleSendCode() {
    const email = form.getValues('email')
    if (!z.string().email().safeParse(email).success) {
      form.setError('email', { message: '请先填写正确的邮箱' })
      return
    }
    form.clearErrors('email')

    try {
      const result = await apiFetch<{ sent: boolean; expiresIn: number; devCode?: string }>(
        '/api/v1/auth/email-code',
        { method: 'POST', body: { email } }
      )
      setCountdown(60)

      if (result.devCode) {
        // 本地日志 provider 会把验证码直接回显，方便开发环境自测
        form.setValue('code', result.devCode, { shouldValidate: true })
        toast.info(`开发模式验证码：${result.devCode}`)
      } else {
        toast.success('验证码已发送', { description: '请查收邮箱，10 分钟内有效' })
      }
    } catch (error) {
      toast.error('验证码发送失败', {
        description: error instanceof ApiClientError ? error.message : '请稍后重试'
      })
    }
  }

  async function onSubmit(values: RegisterValues) {
    try {
      await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        body: {
          email: values.email,
          code: values.code,
          password: values.password,
          confirmPassword: values.confirmPassword
        }
      })
      toast.success('注册成功，正在进入控制台')
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      if (error instanceof ApiClientError) {
        const field = error.payload.data?.field
        if (
          field === 'email' ||
          field === 'code' ||
          field === 'password' ||
          field === 'confirmPassword'
        ) {
          form.setError(field, { message: error.message })
          return
        }
        toast.error('注册失败', { description: error.message })
        return
      }
      toast.error('注册失败', { description: '请稍后重试' })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">创建账号</h1>
        <p className="text-sm text-muted-foreground">注册后即可领取试用套餐，先跑通再决定。</p>
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

              <Field data-invalid={!!errors.code}>
                <FieldLabel htmlFor="code">邮箱验证码</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6 位数字"
                    aria-invalid={!!errors.code}
                    {...form.register('code')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={countdown > 0}
                    onClick={handleSendCode}
                  >
                    {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
                  </Button>
                </div>
                <FieldError errors={[errors.code]} />
                <FieldDescription>
                  <MailCheck className="mr-1 inline size-3.5 align-[-2px]" />
                  验证码有效期 10 分钟，演示环境会直接展示并自动填入。
                </FieldDescription>
              </Field>

              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位，建议包含大小写与数字"
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
                  placeholder="再次输入密码"
                  aria-invalid={!!errors.confirmPassword}
                  {...form.register('confirmPassword')}
                />
                <FieldError errors={[errors.confirmPassword]} />
              </Field>

              <Field data-invalid={!!errors.terms}>
                <div className="flex items-start gap-2">
                  <Controller
                    control={form.control}
                    name="terms"
                    render={({ field }) => (
                      <Checkbox
                        id="terms"
                        className="mt-0.5"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        aria-invalid={!!errors.terms}
                      />
                    )}
                  />
                  <FieldLabel htmlFor="terms" className="font-normal text-muted-foreground">
                    <span>
                      我已阅读并同意
                      <Link href="#" className="text-foreground underline underline-offset-4">
                        服务条款
                      </Link>
                      与
                      <Link href="#" className="text-foreground underline underline-offset-4">
                        隐私政策
                      </Link>
                    </span>
                  </FieldLabel>
                </div>
                <FieldError errors={[errors.terms]} />
              </Field>

              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? '注册中…' : '注册'}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        已有账号？
        <Link href="/login" className="ml-1 font-medium text-foreground underline-offset-4 hover:underline">
          直接登录
        </Link>
      </p>
    </div>
  )
}
