<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const { t } = useI18n()
const { locale } = useI18n()
const colorMode = useColorMode()
const { user, can, logout } = useAuth()

const items = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t('nav.dashboard'),
      icon: 'i-lucide-gauge',
      to: '/dashboard'
    },
    {
      label: t('nav.settings'),
      icon: 'i-lucide-settings',
      to: '/dashboard/settings'
    }
  ],
  ...(can('admin:dashboard:read')
    ? [[{
        label: t('nav.admin'),
        icon: 'i-lucide-shield',
        to: '/admin'
      }]]
    : []),
  [
    {
      label: t('action.theme'),
      icon: 'i-lucide-sun-moon',
      onSelect: () => {
        colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
      }
    },
    {
      label: t('action.language'),
      icon: 'i-lucide-languages',
      onSelect: () => {
        locale.value = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
      }
    }
  ],
  [
    {
      label: t('action.logout'),
      icon: 'i-lucide-log-out',
      color: 'error',
      onSelect: () => logout()
    }
  ]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-40' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="{
        label: collapsed ? undefined : (user?.username ?? user?.email),
        trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down'
      }"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :class="[!collapsed && 'py-2']"
      :ui="{ trailingIcon: 'text-dimmed' }"
    />
  </UDropdownMenu>
</template>
