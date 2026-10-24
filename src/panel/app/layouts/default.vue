<script setup lang="ts">
const { t } = useI18n()
const { locale } = useI18n()
const localeOptions = useLocaleOptions()
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <UHeader>
      <template #left>
        <NuxtLink to="/" class="focus-visible:outline-3 outline-primary/25 rounded-md p-1 -ms-1">
          <AppLogo class="w-auto h-6 shrink-0" />
        </NuxtLink>
      </template>

      <template #right>
        <ULocaleSelect v-model="locale" :locales="localeOptions" class="hidden sm:block" />
        <UColorModeButton />

        <UButton
          to="/login"
          :label="t('nav.login')"
          color="neutral"
          variant="ghost"
        />
        <UButton to="/dashboard" :label="t('nav.dashboard')" />
      </template>
    </UHeader>

    <UMain class="flex-1">
      <slot />
    </UMain>

    <USeparator />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          © {{ new Date().getFullYear() }} {{ t('site.name') }}
        </p>
      </template>

      <template #right>
        <ULocaleSelect v-model="locale" :locales="localeOptions" />
      </template>
    </UFooter>
  </div>
</template>
