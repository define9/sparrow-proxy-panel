<script setup lang="ts">
import type { PluginSource } from '@sparrow/contracts'
import type { TableColumn } from '@nuxt/ui'

/**
 * 插件三方源。
 *
 * 目前只支持 url 类型（HTTP JSON 索引）：手动同步时拉取索引 → 校验 checksum → 与已安装版本比对。
 */

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const { can } = useAuth()
const toast = useToast()

interface SourceListResponse {
  data: PluginSource[]
  meta: { total: number }
}

interface SyncEntry {
  key: string
  name: string
  version: string
  state: 'new' | 'installed' | 'update'
  installedVersion: string | null
}

interface SyncResult {
  checksum: string
  total: number
  entries: SyncEntry[]
  issues: Array<{ key: string | null, message: string }>
}

const canWrite = computed(() => can('admin:plugin:write'))
const canDelete = computed(() => can('admin:plugin:delete'))

// SSR 时转发会话 cookie（内部 $fetch 默认不带 cookie）
const requestFetch = useRequestFetch()

const { data, pending, refresh } = await useAsyncData(
  'admin-plugin-sources',
  () => requestFetch<SourceListResponse>('/api/v1/admin/plugin-sources')
)

const sources = computed(() => data.value?.data ?? [])

const columns = computed<TableColumn<PluginSource>[]>(() => [
  { accessorKey: 'name', header: t('plugins.sources.name') },
  { accessorKey: 'type', header: t('plugins.sources.type') },
  { accessorKey: 'url', header: t('plugins.sources.url') },
  { accessorKey: 'lastSyncAt', header: t('plugins.sources.lastSync') },
  { accessorKey: 'lastStatus', header: t('common.status') },
  { id: 'actions', header: t('common.actions') }
])

/* ────────────────────────── 新增 ────────────────────────── */

const createOpen = ref(false)
const creating = ref(false)
const form = reactive({
  name: '',
  type: 'url',
  url: ''
})

function openCreate() {
  form.name = ''
  form.type = 'url'
  form.url = ''
  createOpen.value = true
}

async function create() {
  creating.value = true
  try {
    await $fetch('/api/v1/admin/plugin-sources', {
      method: 'POST',
      body: { name: form.name, type: form.type, url: form.url }
    })
    toast.add({ title: t('plugins.messages.sourceCreated'), color: 'success' })
    createOpen.value = false
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message ?? t('plugins.messages.actionFailed')
    toast.add({ title: message, color: 'error' })
  } finally {
    creating.value = false
  }
}

/* ────────────────────────── 同步 ────────────────────────── */

const syncing = ref<string | null>(null)
const syncResult = ref<SyncResult | null>(null)
const syncOpen = ref(false)

async function sync(source: PluginSource) {
  syncing.value = source.id
  try {
    const result = await $fetch<SyncResult>(`/api/v1/admin/plugin-sources/${source.id}/sync`, { method: 'POST' })
    syncResult.value = result
    syncOpen.value = true
    toast.add({ title: t('plugins.messages.syncSuccess'), color: 'success' })
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message ?? t('plugins.messages.syncFailed')
    toast.add({ title: message, color: 'error' })
    await refresh()
  } finally {
    syncing.value = null
  }
}

/* ────────────────────────── 删除 ────────────────────────── */

const deleteTarget = ref<PluginSource | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!deleteTarget.value) {
    return
  }
  deleting.value = true
  try {
    await $fetch(`/api/v1/admin/plugin-sources/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: t('plugins.messages.sourceDeleted'), color: 'success' })
    deleteTarget.value = null
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message ?? t('plugins.messages.actionFailed')
    toast.add({ title: message, color: 'error' })
  } finally {
    deleting.value = false
  }
}

function syncStateBadge(state: SyncEntry['state']) {
  if (state === 'new') {
    return { color: 'info' as const, variant: 'subtle' as const }
  }
  if (state === 'update') {
    return { color: 'warning' as const, variant: 'subtle' as const }
  }
  return { color: 'success' as const, variant: 'subtle' as const }
}

function formatTime(value?: string | null) {
  if (!value) {
    return '-'
  }
  return new Date(value).toLocaleString()
}
</script>

<template>
  <UDashboardPanel id="plugin-sources">
    <template #header>
      <UDashboardNavbar :title="t('plugins.sources.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="canWrite"
            icon="i-lucide-plus"
            :label="t('plugins.sources.add')"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        icon="i-lucide-info"
        color="neutral"
        variant="subtle"
        class="mb-4"
        :title="t('plugins.sources.hintTitle')"
        :description="t('plugins.sources.hintDesc')"
      />

      <UTable :data="sources" :columns="columns" :loading="pending">
        <template #name-cell="{ row }">
          <span class="font-medium">{{ (row.original as PluginSource).name }}</span>
        </template>

        <template #type-cell="{ row }">
          <UBadge
            :label="(row.original as PluginSource).type"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </template>

        <template #url-cell="{ row }">
          <span class="truncate font-mono text-xs text-muted">{{ (row.original as PluginSource).url }}</span>
        </template>

        <template #lastSyncAt-cell="{ row }">
          <span class="text-xs text-muted">
            {{ formatTime((row.original as PluginSource).lastSyncAt) }}
          </span>
        </template>

        <template #lastStatus-cell="{ row }">
          <UBadge
            :label="t(`plugins.sync.${(row.original as PluginSource).lastStatus ?? 'pending'}`)"
            :color="pluginSyncBadge((row.original as PluginSource).lastStatus).color"
            :variant="pluginSyncBadge((row.original as PluginSource).lastStatus).variant"
            size="sm"
          />
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              v-if="canWrite"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('plugins.sources.sync')"
              :loading="syncing === (row.original as PluginSource).id"
              @click="sync(row.original as PluginSource)"
            />
            <UButton
              v-if="canDelete"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              :aria-label="t('common.delete')"
              @click="deleteTarget = row.original as PluginSource"
            />
          </div>
        </template>
      </UTable>

      <USlideover v-model:open="createOpen" :title="t('plugins.sources.add')">
        <template #body>
          <UForm :state="form" class="space-y-4" @submit="create">
            <UFormField :label="t('common.name')" name="name" required>
              <UInput v-model="form.name" :placeholder="t('plugins.sources.namePlaceholder')" class="w-full" />
            </UFormField>

            <UFormField :label="t('plugins.sources.type')" name="type" required>
              <USelect v-model="form.type" :items="[{ label: t('plugins.sources.typeUrl'), value: 'url' }]" class="w-full" />
            </UFormField>

            <UFormField :label="t('plugins.sources.url')" name="url" required>
              <UInput
                v-model="form.url"
                placeholder="https://example.com/plugins/index.json"
                icon="i-lucide-link"
                class="w-full"
              />
            </UFormField>

            <div class="flex justify-end gap-2">
              <UButton
                :label="t('common.cancel')"
                color="neutral"
                variant="ghost"
                @click="createOpen = false"
              />
              <UButton
                type="submit"
                icon="i-lucide-plus"
                :label="t('common.create')"
                :loading="creating"
              />
            </div>
          </UForm>
        </template>
      </USlideover>

      <UModal
        v-model:open="syncOpen"
        :title="t('plugins.sources.syncResultTitle')"
        :description="t('plugins.sources.syncResultDesc', { total: syncResult?.total ?? 0 })"
      >
        <template #body>
          <div v-if="syncResult" class="space-y-3">
            <div v-if="syncResult.issues.length > 0">
              <p class="text-sm text-muted">
                {{ t('plugins.sources.issues') }}
              </p>
              <ul class="mt-1 space-y-1 text-xs text-error">
                <li v-for="(issue, index) in syncResult.issues" :key="index">
                  {{ issue.key ? `${issue.key}: ` : '' }}{{ issue.message }}
                </li>
              </ul>
            </div>

            <div v-if="syncResult.entries.length > 0" class="space-y-2">
              <div
                v-for="entry in syncResult.entries"
                :key="entry.key"
                class="flex items-center justify-between gap-3 text-sm"
              >
                <div class="min-w-0">
                  <p class="truncate font-medium">
                    {{ entry.name }}
                  </p>
                  <p class="truncate font-mono text-xs text-muted">
                    {{ entry.key }} · {{ entry.version }}
                    <span v-if="entry.installedVersion">← {{ entry.installedVersion }}</span>
                  </p>
                </div>
                <UBadge
                  :label="t(`plugins.sources.state.${entry.state}`)"
                  :color="syncStateBadge(entry.state).color"
                  :variant="syncStateBadge(entry.state).variant"
                  size="sm"
                />
              </div>
            </div>

            <p v-else class="text-sm text-dimmed">
              {{ t('plugins.sources.noEntries') }}
            </p>
          </div>
        </template>

        <template #footer>
          <div class="flex w-full justify-end">
            <UButton
              :label="t('common.confirm')"
              color="neutral"
              variant="ghost"
              @click="syncOpen = false"
            />
          </div>
        </template>
      </UModal>

      <UModal
        :open="deleteTarget !== null"
        :title="t('common.delete')"
        :description="t('plugins.messages.sourceDeleteConfirm', { name: deleteTarget?.name ?? '' })"
        @update:open="value => { if (!value) deleteTarget = null }"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              :label="t('common.cancel')"
              color="neutral"
              variant="ghost"
              @click="deleteTarget = null"
            />
            <UButton
              :label="t('common.delete')"
              color="error"
              icon="i-lucide-trash-2"
              :loading="deleting"
              @click="confirmDelete"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
