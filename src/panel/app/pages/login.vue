<script setup lang="ts">
import { LoginRequestSchema } from '@sparrow/contracts'
import type { z } from 'zod'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const toast = useToast()
const { fetch: refreshSession } = useUserSession()
const route = useRoute()

type LoginForm = z.infer<typeof LoginRequestSchema>

const state = reactive<LoginForm>({
  email: '',
  password: ''
})

const loading = ref(false)

async function onSubmit() {
  loading.value = true
  try {
    await $fetch('/api/v1/auth/login', {
      method: 'POST',
      body: state
    })

    await refreshSession()

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await navigateTo(redirect)
  } catch {
    toast.add({
      title: t('auth.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="mb-1 text-xl font-semibold">
      {{ t('auth.loginTitle') }}
    </h1>
    <p class="mb-6 text-sm text-muted">
      {{ t('auth.subtitle') }}
    </p>

    <UForm
      :schema="LoginRequestSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField :label="t('auth.email')" name="email" required>
        <UInput
          v-model="state.email"
          type="email"
          icon="i-lucide-mail"
          class="w-full"
          placeholder="you@example.com"
          autocomplete="email"
        />
      </UFormField>

      <UFormField :label="t('auth.password')" name="password" required>
        <UInput
          v-model="state.password"
          type="password"
          icon="i-lucide-lock"
          class="w-full"
          autocomplete="current-password"
        />
      </UFormField>

      <UButton
        type="submit"
        block
        :loading="loading"
        class="w-full"
      >
        {{ t('auth.login') }}
      </UButton>
    </UForm>
  </div>
</template>
