<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div>
    <UPageHero
      :title="t('home.hero.title')"
      :description="t('home.hero.description')"
      :links="[{
        label: t('home.hero.cta'),
        to: '/register',
        size: 'xl',
        trailingIcon: 'i-lucide-arrow-right'
      }, {
        label: t('home.hero.secondary'),
        to: '/login',
        size: 'xl',
        color: 'neutral',
        variant: 'subtle'
      }]"
    />

    <UPageSection
      id="features"
      :title="t('home.features.title')"
      :description="t('home.features.description')"
      :features="[{
        icon: 'i-lucide-layout-dashboard',
        title: t('home.features.panel.title'),
        description: t('home.features.panel.description')
      }, {
        icon: 'i-lucide-terminal',
        title: t('home.features.agent.title'),
        description: t('home.features.agent.description')
      }, {
        icon: 'i-lucide-plug',
        title: t('home.features.plugin.title'),
        description: t('home.features.plugin.description')
      }, {
        icon: 'i-lucide-languages',
        title: t('home.features.i18n.title'),
        description: t('home.features.i18n.description')
      }]"
    />
  </div>
</template>
