<script setup lang="ts">
const { t } = useI18n()
const head = useLocaleHead()

const colorMode = useColorMode()
const themeColor = computed(() => (colorMode.value === 'dark' ? '#0b0b0c' : 'white'))

useHead(() => ({
  htmlAttrs: head.value.htmlAttrs,
  link: head.value.link,
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: themeColor.value }
  ]
}))

useSeoMeta({
  title: t('site.name'),
  description: t('site.description'),
  ogTitle: t('site.name'),
  ogDescription: t('site.description')
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
