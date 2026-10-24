<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
</script>

<template>
  <AppPlaceholderPanel :title="t('nav.traffic')" />
</template>
