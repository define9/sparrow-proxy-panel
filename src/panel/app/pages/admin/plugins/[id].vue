<script setup lang="ts">
import type { Plugin, PluginManifest } from '@sparrow/contracts'
import type { TableColumn } from '@nuxt/ui'
import {
  describeConfigSchema,
  PLUGIN_SECRET_MASK,
  validateConfigValues
} from '#shared/utils/plugin-config'

/**
 * 插件详情：概览 / 配置 / 日志。
 *
 * 配置表单由 manifest.configSchema 自动生成（JSON Schema → 字段 → UForm）。
 */

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const { can } = useAuth()
const toast = useToast()
const route = useRoute()

const pluginId = computed(() => String(route.params.id ?? ''))

interface PluginStats {
  total: number
  success: number
  error: number
  timeout: number
  avgDurationMs: number
}

interface PluginDetail extends Plugin {
  manifest: PluginManifest
  config: Record<string, unknown>
  configFields: Array<Record<string, unknown>>
  stats: PluginStats
  circuit: { open: boolean, failures: number }
}

interface PluginEvent {
  id: string
  pluginId: string
  hook: string
  status: 'success' | 'error' | 'timeout'
  durationMs: number | null
  error: string | null
  payload: Record<string, unknown>
  createdAt: string
}

interface EventListResponse {
  data: PluginEvent[]
  meta: { total: number, page: number, pageSize: number, hasMore: boolean }
}

const canWrite = computed(() => can('admin:plugin:write'))

// SSR 时转发会话 cookie（内部 $fetch 默认不带 cookie）
const requestFetch = useRequestFetch()

const { data: plugin, pending, refresh } = await useAsyncData(
  `admin-plugin-${pluginId.value}`,
  () => requestFetch<PluginDetail>(`/api/v1/admin/plugins/${pluginId.value}`)
)

/* ────────────────────────── 配置 ────────────────────────── */

const schema = computed(() => describeConfigSchema(plugin.value?.manifest.configSchema))
const fields = computed(() => schema.value.fields)

const configState = ref<Record<string, unknown>>({})
const saving = ref(false)

watch(
  plugin,
  (value) => {
    if (!value) {
      return
    }
    const next: Record<string, unknown> = {}
    for (const field of fields.value) {
      const stored = value.config[field.key]
      next[field.key] = stored === undefined ? (field.default ?? '') : stored
    }
    configState.value = next
  },
  { immediate: true }
)

/** UForm 校验：直接用 JSON Schema 校验器 */
function validateConfig(state: Record<string, unknown>) {
  return validateConfigValues(state, schema.value)
}

async function saveConfig() {
  if (!plugin.value) {
    return
  }

  saving.value = true
  try {
    await $fetch(`/api/v1/admin/plugins/${plugin.value.id}`, {
      method: 'PATCH',
      body: { config: configState.value }
    })
    toast.add({ title: t('plugins.messages.configSaved'), color: 'success' })
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message ?? t('plugins.messages.actionFailed')
    toast.add({ title: message, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function toggleStatus() {
  if (!plugin.value) {
    return
  }
  const next = plugin.value.status === 'installed' ? 'disabled' : 'installed'
  try {
    await $fetch(`/api/v1/admin/plugins/${plugin.value.id}`, {
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

/* ────────────────────────── 日志 ────────────────────────── */

const eventPage = ref(1)
const eventPageSize = ref(20)

const { data: events, pending: eventsPending } = await useAsyncData(
  `admin-plugin-events-${pluginId.value}`,
  () => requestFetch<EventListResponse>(`/api/v1/admin/plugins/${pluginId.value}/events`, {
    query: { page: eventPage.value, pageSize: eventPageSize.value }
  }),
  { watch: [eventPage] }
)

const eventColumns = computed<TableColumn<PluginEvent>[]>(() => [
  { accessorKey: 'createdAt', header: t('plugins.detail.logsTime') },
  { accessorKey: 'hook', header: t('plugins.detail.logsHook') },
  { accessorKey: 'status', header: t('common.status') },
  { accessorKey: 'durationMs', header: t('plugins.detail.logsDuration') },
  { id: 'error', header: t('plugins.detail.logsError') }
])

/* ────────────────────────── 展示辅助 ────────────────────────── */

const tabs = computed(() => [
  { label: t('plugins.detail.overview'), value: 'overview', slot: 'overview', icon: 'i-lucide-info' },
  { label: t('plugins.detail.config'), value: 'config', slot: 'config', icon: 'i-lucide-settings' },
  { label: t('plugins.detail.logs'), value: 'logs', slot: 'logs', icon: 'i-lucide-scroll-text' }
])

const tab = ref('overview')

const successRate = computed(() => {
  const stats = plugin.value?.stats
  if (!stats || stats.total === 0) {
    return '-'
  }
  return `${Math.round((stats.success / stats.total) * 100)}%`
})

function formatTime(value?: string | null) {
  if (!value) {
    return '-'
  }
  return new Date(value).toLocaleString()
}

function eventBadge(status: string) {
  if (status === 'success') {
    return { color: 'success' as const, variant: 'subtle' as const }
  }
  if (status === 'timeout') {
    return { color: 'warning' as const, variant: 'subtle' as const }
  }
  return { color: 'error' as const, variant: 'subtle' as const }
}
</script>

<template>
  <UDashboardPanel id="plugin-detail">
    <template #header>
      <UDashboardNavbar :title="plugin?.name ?? t('plugins.detail.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge
            v-if="plugin"
            :label="t(pluginStatusLabelKey(plugin.status))"
            :color="pluginStatusBadge(plugin.status).color"
            :variant="pluginStatusBadge(plugin.status).variant"
          />
          <UButton
            v-if="canWrite && plugin"
            :icon="plugin.status === 'installed' ? 'i-lucide-pause' : 'i-lucide-play'"
            color="neutral"
            variant="outline"
            size="sm"
            :label="plugin.status === 'installed' ? t('plugins.actions.disable') : t('plugins.actions.enable')"
            @click="toggleStatus"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="text-sm text-muted">
        {{ t('common.loading') }}
      </div>

      <UAlert
        v-else-if="!plugin"
        icon="i-lucide-circle-alert"
        color="error"
        variant="subtle"
        :title="t('plugins.detail.notFound')"
      />

      <UTabs
        v-else
        v-model="tab"
        :items="tabs"
        class="mt-1"
      >
        <template #overview>
          <div class="grid gap-4 lg:grid-cols-2">
            <UCard>
              <template #header>
                <span class="text-sm font-medium">{{ t('plugins.detail.basic') }}</span>
              </template>
              <template #body>
                <dl class="space-y-2 text-sm">
                  <div class="flex justify-between gap-4">
                    <dt class="text-muted">
                      {{ t('plugins.detail.key') }}
                    </dt>
                    <dd class="font-mono">
                      {{ plugin.key }}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-muted">
                      {{ t('plugins.detail.version') }}
                    </dt>
                    <dd class="font-mono">
                      {{ plugin.version }}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-muted">
                      {{ t('plugins.detail.type') }}
                    </dt>
                    <dd>{{ t(pluginTypeLabelKey(plugin.type)) }}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-muted">
                      {{ t('plugins.detail.runtime') }}
                    </dt>
                    <dd>{{ t(pluginRuntimeLabelKey(plugin.runtime)) }}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-muted">
                      {{ t('plugins.detail.source') }}
                    </dt>
                    <dd>{{ t(pluginSourceLabelKey(plugin.sourceType)) }}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-muted">
                      {{ t('plugins.detail.installedAt') }}
                    </dt>
                    <dd>{{ formatTime(plugin.installedAt) }}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-muted">
                      {{ t('plugins.detail.updatedAt') }}
                    </dt>
                    <dd>{{ formatTime(plugin.updatedAt) }}</dd>
                  </div>
                  <div v-if="plugin.sourceUrl" class="flex justify-between gap-4">
                    <dt class="text-muted">
                      {{ t('plugins.detail.sourceUrl') }}
                    </dt>
                    <dd class="truncate font-mono text-xs">
                      {{ plugin.sourceUrl }}
                    </dd>
                  </div>
                  <div v-if="plugin.checksum" class="flex justify-between gap-4">
                    <dt class="text-muted">
                      {{ t('plugins.detail.checksum') }}
                    </dt>
                    <dd class="truncate font-mono text-xs">
                      {{ plugin.checksum }}
                    </dd>
                  </div>
                </dl>
              </template>
            </UCard>

            <UCard>
              <template #header>
                <span class="text-sm font-medium">{{ t('plugins.detail.health') }}</span>
              </template>
              <template #body>
                <div class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <p class="text-muted">
                      {{ t('plugins.detail.totalCalls') }}
                    </p>
                    <p class="text-xl font-medium tabular-nums">
                      {{ plugin.stats.total }}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted">
                      {{ t('plugins.detail.successRate') }}
                    </p>
                    <p class="text-xl font-medium tabular-nums">
                      {{ successRate }}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted">
                      {{ t('plugins.detail.avgDuration') }}
                    </p>
                    <p class="text-xl font-medium tabular-nums">
                      {{ plugin.stats.avgDurationMs }}ms
                    </p>
                  </div>
                  <div>
                    <p class="text-muted">
                      {{ t('plugins.detail.failures') }}
                    </p>
                    <p class="text-xl font-medium tabular-nums">
                      {{ plugin.stats.error + plugin.stats.timeout }}
                    </p>
                  </div>
                </div>

                <div class="mt-4 flex flex-wrap gap-1">
                  <UBadge
                    v-for="hook in plugin.hooks"
                    :key="hook"
                    :label="hook"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                  <span v-if="plugin.hooks.length === 0" class="text-sm text-dimmed">-</span>
                </div>

                <div v-if="plugin.circuit.open" class="mt-4">
                  <UAlert
                    icon="i-lucide-power"
                    color="warning"
                    variant="subtle"
                    :title="t('plugins.detail.circuitOpen')"
                    :description="t('plugins.detail.circuitOpenDesc')"
                  />
                </div>

                <div v-if="plugin.permissions.length > 0" class="mt-4">
                  <p class="text-muted">
                    {{ t('plugins.detail.permissions') }}
                  </p>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <UBadge
                      v-for="permission in plugin.permissions"
                      :key="permission"
                      :label="permission"
                      color="info"
                      variant="subtle"
                      size="sm"
                    />
                  </div>
                </div>
              </template>
            </UCard>
          </div>
        </template>

        <template #config>
          <UCard>
            <template #header>
              <span class="text-sm font-medium">{{ t('plugins.detail.configTitle') }}</span>
            </template>
            <template #body>
              <UAlert
                v-if="fields.length === 0"
                icon="i-lucide-info"
                color="neutral"
                variant="subtle"
                :title="t('plugins.detail.noConfig')"
                :description="t('plugins.detail.noConfigDesc')"
              />

              <UForm
                v-else
                :state="configState"
                :validate="validateConfig"
                class="space-y-4"
                @submit="saveConfig"
              >
                <UFormField
                  v-for="field in fields"
                  :key="field.key"
                  :name="field.key"
                  :label="field.title"
                  :description="field.description"
                  :required="field.required"
                >
                  <UInput
                    v-if="field.widget === 'input' || field.widget === 'password'"
                    :model-value="String(configState[field.key] ?? '')"
                    :type="field.widget === 'password' ? 'password' : 'text'"
                    :placeholder="field.placeholder"
                    class="w-full"
                    @update:model-value="value => configState[field.key] = value"
                  />
                  <UTextarea
                    v-else-if="field.widget === 'textarea'"
                    :model-value="String(configState[field.key] ?? '')"
                    :rows="4"
                    :placeholder="field.placeholder"
                    class="w-full font-mono text-xs"
                    @update:model-value="value => configState[field.key] = value"
                  />
                  <UInputNumber
                    v-else-if="field.widget === 'number'"
                    :model-value="Number(configState[field.key] ?? 0)"
                    :min="field.minimum"
                    :max="field.maximum"
                    class="w-full"
                    @update:model-value="value => configState[field.key] = value"
                  />
                  <USwitch
                    v-else-if="field.widget === 'switch'"
                    :model-value="Boolean(configState[field.key])"
                    @update:model-value="value => configState[field.key] = value"
                  />
                  <USelect
                    v-else-if="field.widget === 'select'"
                    :model-value="String(configState[field.key] ?? '')"
                    :items="field.options ?? []"
                    class="w-full"
                    @update:model-value="value => configState[field.key] = value"
                  />
                  <p
                    v-if="field.secret && configState[field.key] === PLUGIN_SECRET_MASK"
                    class="text-xs text-muted"
                  >
                    {{ t('plugins.detail.secretStored') }}
                  </p>
                </UFormField>

                <div class="flex justify-end">
                  <UButton
                    type="submit"
                    icon="i-lucide-save"
                    :label="t('common.save')"
                    :loading="saving"
                    :disabled="!canWrite"
                  />
                </div>
              </UForm>
            </template>
          </UCard>
        </template>

        <template #logs>
          <UTable :data="events?.data ?? []" :columns="eventColumns" :loading="eventsPending">
            <template #createdAt-cell="{ row }">
              <span class="text-xs text-muted">{{ formatTime((row.original as PluginEvent).createdAt) }}</span>
            </template>
            <template #hook-cell="{ row }">
              <span class="font-mono text-xs">{{ (row.original as PluginEvent).hook }}</span>
            </template>
            <template #status-cell="{ row }">
              <UBadge
                :label="(row.original as PluginEvent).status"
                :color="eventBadge((row.original as PluginEvent).status).color"
                :variant="eventBadge((row.original as PluginEvent).status).variant"
                size="sm"
              />
            </template>
            <template #durationMs-cell="{ row }">
              <span class="font-mono text-xs tabular-nums">
                {{ (row.original as PluginEvent).durationMs ?? '-' }}ms
              </span>
            </template>
            <template #error-cell="{ row }">
              <span class="text-xs text-error">{{ (row.original as PluginEvent).error ?? '-' }}</span>
            </template>
          </UTable>

          <div v-if="(events?.meta.total ?? 0) > 0" class="mt-4 flex justify-end">
            <UPagination
              v-model:page="eventPage"
              :items-per-page="eventPageSize"
              :total="events?.meta.total ?? 0"
            />
          </div>
        </template>
      </UTabs>
    </template>
  </UDashboardPanel>
</template>
