<script setup lang="ts">
/**
 * 占位面板：用于尚未实现的模块，避免导航指向 404。
 *
 * 实现对应模块时，直接把页面换成真实的 UDashboardPanel 内容即可。
 */
defineProps<{
  title: string
}>()

const { t } = useI18n()
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="title">
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
