<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
</script>

<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar :title="t('nav.dashboard')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        icon="i-lucide-construction"
        :title="t('dashboard.comingSoon')"
        :description="t('dashboard.comingSoonDesc')"
      />
    </template>
  </UDashboardPanel>
</template>
