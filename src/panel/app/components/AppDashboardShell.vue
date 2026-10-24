<script setup lang="ts">
import { adminNav, filterNav, toNavigationItems, userNav } from '~/utils/navigation'

const props = defineProps<{
  scope: 'user' | 'admin'
}>()

const { t } = useI18n()
const { can } = useAuth()
const route = useRoute()
const open = ref(false)

const entries = computed(() => (props.scope === 'admin' ? adminNav : userNav))
const navItems = computed(() => toNavigationItems(filterNav(entries.value, can), t))

// 路由变化时收起移动端侧边栏
watch(() => route.fullPath, () => {
  open.value = false
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      :id="`${scope}-sidebar`"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-2 px-1">
          <AppLogo class="w-auto h-6 shrink-0" :class="collapsed && 'mx-auto'" />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="navItems"
          orientation="vertical"
          tooltip
          popover
        />
      </template>

      <template #footer="{ collapsed }">
        <AppUserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
