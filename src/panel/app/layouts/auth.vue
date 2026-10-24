<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-muted px-4">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <NuxtLink to="/">
          <AppLogo class="h-8 w-auto" />
        </NuxtLink>
        <p class="text-sm text-muted">
          {{ t('auth.subtitle') }}
        </p>
      </div>

      <UCard>
        <slot />
      </UCard>

      <p class="mt-6 text-center text-sm text-muted">
        <NuxtLink to="/" class="hover:text-primary">{{ t('common.backToHome') }}</NuxtLink>
      </p>
    </div>
  </div>
</template>
