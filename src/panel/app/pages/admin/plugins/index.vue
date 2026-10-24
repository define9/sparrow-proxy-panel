<script setup lang="ts">
import type { Plugin } from '@sparrow/contracts'
import type { TableColumn } from '@nuxt/ui'
import { pluginExampleManifest } from '#shared/utils/plugin-examples'

/**
 * 插件列表。
 *
 * - 列表 / 状态 / 来源用 UTable + UBadge 展示
 * - 安装支持粘贴 manifest JSON 或一键安装内置示例插件
 */

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const { can } = useAuth()
const toast = useToast()

interface PluginListResponse {
  data: Plugin[]
  meta: { total: number, page: number, pageSize: number, hasMore: boolean }
}

const canWrite = computed(() => can('admin:plugin:write'))
const canDelete = computed(() => can('admin:plugin:delete'))

// SSR 时转发会话 cookie（内部 $fetch 默认不带 cookie）
const requestFetch = useRequestFetch()

const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const statusFilter = ref<string | undefined>(undefined)
const typeFilter = ref<string | undefined>(undefined)

const requestQuery = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  q: keyword.value || undefined,
  status: statusFilter.value,
  type: typeFilter.value
}))

const { data, pending, refresh } = await useAsyncData(
  'admin-plugin-list',
  // useRequestFetch：SSR 时带上会话 cookie，否则内部请求会 401
  () => requestFetch<PluginListResponse>('/api/v1/admin/plugins', { query: requestQuery.value }),
  { watch: [requestQuery] }
)

const plugins = computed(() => data.value?.data ?? [])
const total = computed(() => data.value?.meta.total ?? 0)

const columns = computed<TableColumn<Plugin>[]>(() => [
  { accessorKey: 'name', header: t('plugins.table.name') },
  { accessorKey: 'version', header: t('plugins.table.version') },
  { accessorKey: 'type', header: t('plugins.table.type') },
  { accessorKey: 'runtime', header: t('plugins.table.runtime') },
  { accessorKey: 'sourceType', header: t('plugins.table.source') },
  { accessorKey: 'status', header: t('plugins.table.status') },
  { id: 'hooks', header: t('plugins.table.hooks') },
  { id: 'actions', header: t('common.actions') }
])

const statusOptions = computed(() => [
  { label: t('plugins.status.installed'), value: 'installed' },
  { label: t('plugins.status.disabled'), value: 'disabled' },
  { label: t('plugins.status.error'), value: 'error' }
])

const typeOptions = computed(() => [
  { label: t('plugins.type.payment'), value: 'payment' },
  { label: t('plugins.type.node_source'), value: 'node_source' },
  { label: t('plugins.type.subscription'), value: 'subscription' },
  { label: t('plugins.type.notify'), value: 'notify' },
  { label: t('plugins.type.hook'), value: 'hook' },
  { label: t('plugins.type.ui'), value: 'ui' }
])

/* ────────────────────────── 安装 ────────────────────────── */

const installOpen = ref(false)
const manifestText = ref('')
const installing = ref(false)

function openInstall() {
  manifestText.value = ''
  installOpen.value = true
}

function useExample() {
  manifestText.value = JSON.stringify(pluginExampleManifest, null, 2)
}

async function install() {
  let manifest: unknown
  try {
    manifest = JSON.parse(manifestText.value)
  } catch {
    toast.add({ title: t('plugins.messages.invalidManifest'), color: 'error' })
    return
  }

  installing.value = true
  try {
    const created = await $fetch<Plugin & { pluginToken?: string }>('/api/v1/admin/plugins', {
      method: 'POST',
      body: { manifest }
    })
    toast.add({ title: t('plugins.messages.installSuccess', { name: created.name }), color: 'success' })
    installOpen.value = false
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message ?? t('plugins.messages.installFailed')
    toast.add({ title: message, color: 'error' })
  } finally {
    installing.value = false
  }
}

/* ────────────────────────── 启用 / 禁用 / 卸载 ────────────────────────── */

const uninstallTarget = ref<Plugin | null>(null)
const uninstalling = ref(false)

async function toggleStatus(plugin: Plugin) {
  const next = plugin.status === 'installed' ? 'disabled' : 'installed'
  try {
    await $fetch(`/api/v1/admin/plugins/${plugin.id}`, {
      method: 'PATCH',
      body: { status: next }
    })
    toast.add({ title: t('plugins.messages.statusUpdated'), color: 'success' })
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message ?? t('plugins.messages.actionFailed')
    toast.add({ title: message, color: 'error' })
  }
}

async function confirmUninstall() {
  if (!uninstallTarget.value) {
    return
  }

  uninstalling.value = true
  try {
    await $fetch(`/api/v1/admin/plugins/${uninstallTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: t('plugins.messages.uninstallSuccess'), color: 'success' })
    uninstallTarget.value = null
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message ?? t('plugins.messages.actionFailed')
    toast.add({ title: message, color: 'error' })
  } finally {
    uninstalling.value = false
  }
}

function resetFilters() {
  page.value = 1
  keyword.value = ''
  statusFilter.value = undefined
  typeFilter.value = undefined
}
</script>

<template>
  <UDashboardPanel id="plugins">
    <template #header>
      <UDashboardNavbar :title="t('plugins.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="canWrite"
            icon="i-lucide-plus"
            :label="t('plugins.list.install')"
            @click="openInstall"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-wrap items-center gap-3">
        <UInput
          v-model="keyword"
          icon="i-lucide-search"
          :placeholder="t('plugins.list.search')"
          class="w-full sm:w-64"
          @update:model-value="page = 1"
        />
        <USelect
          v-model="statusFilter"
          :items="statusOptions"
          :placeholder="t('plugins.list.statusAll')"
          class="w-44"
          clearable
          @update:model-value="page = 1"
        />
        <USelect
          v-model="typeFilter"
          :items="typeOptions"
          :placeholder="t('plugins.list.typeAll')"
          class="w-44"
          clearable
          @update:model-value="page = 1"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :aria-label="t('common.refresh')"
          @click="resetFilters(); refresh()"
        />
      </div>

      <UTable
        :data="plugins"
        :columns="columns"
        :loading="pending"
        class="mt-4"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-2">
            <UIcon :name="pluginTypeIcon((row.original as Plugin).type)" class="size-4 text-muted" />
            <div class="min-w-0">
              <NuxtLink
                :to="`/admin/plugins/${(row.original as Plugin).id}`"
                class="font-medium text-default hover:text-primary"
              >
                {{ (row.original as Plugin).name }}
              </NuxtLink>
              <p class="truncate font-mono text-xs text-muted">
                {{ (row.original as Plugin).key }}
              </p>
            </div>
          </div>
        </template>

        <template #version-cell="{ row }">
          <span class="font-mono text-sm">{{ (row.original as Plugin).version }}</span>
        </template>

        <template #type-cell="{ row }">
          <span class="text-sm">{{ t(pluginTypeLabelKey((row.original as Plugin).type)) }}</span>
        </template>

        <template #runtime-cell="{ row }">
          <UBadge
            :label="t(pluginRuntimeLabelKey((row.original as Plugin).runtime))"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </template>

        <template #sourceType-cell="{ row }">
          <span class="text-sm text-muted">{{ t(pluginSourceLabelKey((row.original as Plugin).sourceType)) }}</span>
        </template>

        <template #status-cell="{ row }">
          <UBadge
            :label="t(pluginStatusLabelKey((row.original as Plugin).status))"
            :color="pluginStatusBadge((row.original as Plugin).status).color"
            :variant="pluginStatusBadge((row.original as Plugin).status).variant"
            size="sm"
          />
        </template>

        <template #hooks-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="hook in (row.original as Plugin).hooks"
              :key="hook"
              :label="hook"
              color="neutral"
              variant="outline"
              size="sm"
            />
            <span v-if="(row.original as Plugin).hooks.length === 0" class="text-sm text-dimmed">-</span>
          </div>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              v-if="canWrite"
              :icon="(row.original as Plugin).status === 'installed' ? 'i-lucide-pause' : 'i-lucide-play'"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="(row.original as Plugin).status === 'installed' ? t('plugins.actions.disable') : t('plugins.actions.enable')"
              @click="toggleStatus(row.original as Plugin)"
            />
            <UButton
              icon="i-lucide-settings"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('plugins.actions.config')"
              :to="`/admin/plugins/${(row.original as Plugin).id}`"
            />
            <UButton
              v-if="canDelete"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              :aria-label="t('plugins.actions.uninstall')"
              @click="uninstallTarget = row.original as Plugin"
            />
          </div>
        </template>
      </UTable>

      <div v-if="total > 0" class="mt-4 flex justify-end">
        <UPagination v-model:page="page" :items-per-page="pageSize" :total="total" />
      </div>

      <UModal v-model:open="installOpen" :title="t('plugins.list.install')" :description="t('plugins.list.installHint')">
        <template #body>
          <UTextarea
            v-model="manifestText"
            :rows="12"
            :placeholder="t('plugins.list.manifestPlaceholder')"
            class="w-full font-mono text-xs"
          />
          <div class="mt-3 flex justify-between gap-2">
            <UButton
              icon="i-lucide-sparkles"
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('plugins.list.useExample')"
              @click="useExample"
            />
          </div>
        </template>

        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              :label="t('common.cancel')"
              color="neutral"
              variant="ghost"
              @click="installOpen = false"
            />
            <UButton
              :label="t('plugins.list.install')"
              icon="i-lucide-download"
              :loading="installing"
              @click="install"
            />
          </div>
        </template>
      </UModal>

      <UModal
        :open="uninstallTarget !== null"
        :title="t('plugins.actions.uninstall')"
        :description="t('plugins.messages.uninstallConfirm', { name: uninstallTarget?.name ?? '' })"
        @update:open="value => { if (!value) uninstallTarget = null }"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              :label="t('common.cancel')"
              color="neutral"
              variant="ghost"
              @click="uninstallTarget = null"
            />
            <UButton
              :label="t('plugins.actions.uninstall')"
              color="error"
              icon="i-lucide-trash-2"
              :loading="uninstalling"
              @click="confirmUninstall"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
