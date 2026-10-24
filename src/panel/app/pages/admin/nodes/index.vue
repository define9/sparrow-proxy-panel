<script setup lang="ts">
import type { Node, NodeGroup, NodeProtocol, NodeStatus, NodeTlsMode, NodeTransport, UpsertNode } from '@sparrow/contracts'
import type { TableColumn } from '@nuxt/ui'
import { UpsertNodeSchema } from '@sparrow/contracts'
import { errorMessage } from '~/utils/error-message'

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const toast = useToast()

const ALL = '__all__'

/* ── 列表数据 ─────────────────────────────────────────── */

const keyword = ref('')
const q = ref('')

/** 搜索防抖：300ms */
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(keyword, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    q.value = value
  }, 300)
})

const statusFilter = ref<string>(ALL)
const protocolFilter = ref<string>(ALL)
const groupFilter = ref<string>(ALL)
const page = ref(1)
const pageSize = ref(20)
const rowSelection = ref<Record<string, boolean>>({})

const query = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  q: q.value || undefined,
  status: statusFilter.value === ALL ? undefined : statusFilter.value,
  protocol: protocolFilter.value === ALL ? undefined : protocolFilter.value,
  groupId: groupFilter.value === ALL ? undefined : groupFilter.value
}))

const { data, status, refresh } = useLazyFetch<{ data: Node[], meta: { total: number } }>(
  '/api/v1/admin/nodes',
  { query, watch: [query] }
)

const { data: groupData } = useLazyFetch<{ data: NodeGroup[] }>('/api/v1/admin/nodes/groups')

const rows = computed(() => data.value?.data ?? [])
const total = computed(() => data.value?.meta.total ?? 0)
const groups = computed(() => groupData.value?.data ?? [])

const groupOptions = computed(() => [
  { label: t('nodes.list.filterGroup'), value: ALL },
  ...groups.value.map(group => ({ label: group.name, value: group.id }))
])

const statusOptions = computed(() => [
  { label: t('nodes.list.filterStatus'), value: ALL },
  { label: t('nodes.status.online'), value: 'online' },
  { label: t('nodes.status.offline'), value: 'offline' },
  { label: t('nodes.status.maintenance'), value: 'maintenance' }
])

const protocolOptions = computed(() => [
  { label: t('nodes.list.filterProtocol'), value: ALL },
  ...(['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic'] as NodeProtocol[]).map(protocol => ({
    label: t(`nodes.protocol.${protocol}`),
    value: protocol
  }))
])

const protocolSelectOptions = computed<Array<{ label: string, value: NodeProtocol }>>(() =>
  (['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic'] as NodeProtocol[]).map(protocol => ({
    label: t(`nodes.protocol.${protocol}`),
    value: protocol
  }))
)

const networkOptions = computed<Array<{ label: string, value: NodeTransport }>>(() =>
  (['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic'] as NodeTransport[]).map(network => ({
    label: t(`nodes.network.${network}`),
    value: network
  }))
)

const tlsModeOptions = computed<Array<{ label: string, value: NodeTlsMode }>>(() =>
  (['none', 'tls', 'reality'] as NodeTlsMode[]).map(mode => ({
    label: t(`nodes.tlsMode.${mode}`),
    value: mode
  }))
)

const statusSelectOptions = computed<Array<{ label: string, value: NodeStatus }>>(() =>
  (['online', 'offline', 'maintenance'] as NodeStatus[]).map(value => ({
    label: t(`nodes.status.${value}`),
    value
  }))
)

const statusColorMap: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  online: 'success',
  offline: 'error',
  maintenance: 'warning'
}

const columns = computed<TableColumn<Node>[]>(() => [
  { accessorKey: 'name', header: t('nodes.list.name') },
  { accessorKey: 'groupName', header: t('nodes.list.group') },
  { accessorKey: 'protocol', header: t('nodes.list.protocol') },
  { accessorKey: 'host', header: t('nodes.list.address') },
  { accessorKey: 'network', header: t('nodes.list.network') },
  { accessorKey: 'tlsMode', header: t('nodes.list.tls') },
  { accessorKey: 'status', header: t('nodes.list.status') },
  { accessorKey: 'trafficRate', header: t('nodes.list.trafficRate') },
  { accessorKey: 'priority', header: t('nodes.list.priority') },
  { accessorKey: 'lastSeenAt', header: t('nodes.list.lastSeenAt') },
  { id: 'actions' }
])

/* ── 编辑表单 ─────────────────────────────────────────── */

interface NodeFormState {
  name: string
  groupId: string
  protocol: NodeProtocol
  host: string
  port: number
  serverPort: number
  network: NodeTransport
  path: string
  hostHeader: string
  method: string
  flow: string
  password: string
  uuid: string
  security: string
  tlsMode: NodeTlsMode
  sni: string
  alpn: string[]
  allowInsecure: boolean
  realityPublicKey: string
  realityShortId: string
  fingerprint: string
  certificateId: string
  trafficRate: number
  priority: number
  weight: number
  status: NodeStatus
  isRelay: boolean
  sort: number
  remark: string
}

const slideoverOpen = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

function emptyForm(): NodeFormState {
  return {
    name: '',
    groupId: groups.value[0]?.id ?? '',
    protocol: 'vless',
    host: '',
    port: 443,
    serverPort: 0,
    network: 'tcp',
    path: '',
    hostHeader: '',
    method: '',
    flow: '',
    password: '',
    uuid: '',
    security: '',
    tlsMode: 'none',
    sni: '',
    alpn: [],
    allowInsecure: false,
    realityPublicKey: '',
    realityShortId: '',
    fingerprint: '',
    certificateId: '',
    trafficRate: 1,
    priority: 0,
    weight: 100,
    status: 'online',
    isRelay: false,
    sort: 0,
    remark: ''
  }
}

const form = reactive<NodeFormState>(emptyForm())
const alpnText = ref('')

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  alpnText.value = ''
  slideoverOpen.value = true
}

function openEdit(row: Node) {
  editingId.value = row.id
  Object.assign(form, {
    name: row.name,
    groupId: row.groupId,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    serverPort: row.serverPort ?? 0,
    network: row.network,
    path: row.path ?? '',
    hostHeader: row.hostHeader ?? '',
    method: row.method ?? '',
    flow: row.flow ?? '',
    password: '',
    uuid: row.uuid ?? '',
    security: row.security ?? '',
    tlsMode: row.tlsMode,
    sni: row.sni ?? '',
    alpn: row.alpn ?? [],
    allowInsecure: row.allowInsecure,
    realityPublicKey: row.realityPublicKey ?? '',
    realityShortId: row.realityShortId ?? '',
    fingerprint: row.fingerprint ?? '',
    certificateId: row.certificateId ?? '',
    trafficRate: row.trafficRate,
    priority: row.priority,
    weight: row.weight,
    status: row.status,
    isRelay: row.isRelay,
    sort: row.sort,
    remark: row.remark ?? ''
  })
  alpnText.value = (row.alpn ?? []).join(',')
  slideoverOpen.value = true
}

function toPayload(): UpsertNode {
  return {
    name: form.name,
    groupId: form.groupId,
    protocol: form.protocol,
    host: form.host,
    port: form.port,
    serverPort: form.serverPort > 0 ? form.serverPort : null,
    network: form.network,
    path: form.path || null,
    hostHeader: form.hostHeader || null,
    method: form.method || null,
    flow: form.flow || null,
    password: form.password || null,
    uuid: form.uuid || null,
    security: form.security || null,
    tlsMode: form.tlsMode,
    sni: form.sni || null,
    alpn: alpnText.value.split(',').map(item => item.trim()).filter(Boolean),
    allowInsecure: form.allowInsecure,
    realityPublicKey: form.realityPublicKey || null,
    realityShortId: form.realityShortId || null,
    fingerprint: form.fingerprint || null,
    certificateId: form.certificateId || null,
    trafficRate: form.trafficRate,
    priority: form.priority,
    weight: form.weight,
    status: form.status,
    isRelay: form.isRelay,
    sort: form.sort,
    remark: form.remark || null
  }
}

async function onSubmit() {
  saving.value = true
  try {
    const payload = toPayload()

    if (editingId.value) {
      await $fetch(`/api/v1/admin/nodes/${editingId.value}`, { method: 'PUT', body: payload })
      toast.add({ title: t('nodes.form.updateSuccess'), color: 'success' })
    } else {
      await $fetch('/api/v1/admin/nodes', { method: 'POST', body: payload })
      toast.add({ title: t('nodes.form.createSuccess'), color: 'success' })
    }

    slideoverOpen.value = false
    await refresh()
  } catch (error) {
    toast.add({
      title: editingId.value ? t('nodes.form.updateFailed') : t('nodes.form.createFailed'),
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

/* ── 删除 ─────────────────────────────────────────────── */

const deleteTarget = ref<Node | null>(null)
const deleting = ref(false)

async function onDelete() {
  if (!deleteTarget.value) {
    return
  }
  deleting.value = true
  try {
    await $fetch(`/api/v1/admin/nodes/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: t('nodes.list.delete'), color: 'success' })
    deleteTarget.value = null
    await refresh()
  } catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  } finally {
    deleting.value = false
  }
}

/* ── 批量启停 ─────────────────────────────────────────── */

const selectedIds = computed(() => Object.keys(rowSelection.value).filter(id => rowSelection.value[id]))

async function onBatch(action: 'enable' | 'disable') {
  if (!selectedIds.value.length) {
    return
  }
  try {
    const result = await $fetch<{ affected: number }>('/api/v1/admin/nodes/batch', {
      method: 'POST',
      body: { ids: selectedIds.value, action }
    })
    toast.add({ title: t('nodes.list.batchDone', { count: result.affected }), color: 'success' })
    rowSelection.value = {}
    await refresh()
  } catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
}

/* ── 配置预览 ─────────────────────────────────────────── */

const previewOpen = ref(false)
const previewText = ref('')

async function onPreview(row: Node) {
  try {
    const result = await $fetch<{ core: string, config: unknown }>(`/api/v1/admin/nodes/${row.id}/config`)
    previewText.value = JSON.stringify(result.config, null, 2)
    previewOpen.value = true
  } catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
}

const rowActions = (row: Node) => [
  { label: t('nodes.list.edit'), icon: 'i-lucide-pencil', onSelect: () => openEdit(row) },
  { label: t('nodes.list.previewConfig'), icon: 'i-lucide-file-json-2', onSelect: () => onPreview(row) },
  { label: t('nodes.list.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = row } }
]
</script>

<template>
  <UDashboardPanel id="admin-nodes">
    <template #header>
      <UDashboardNavbar :title="t('nodes.list.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :aria-label="t('common.refresh')"
            @click="refresh()"
          />
          <UButton
            icon="i-lucide-plus"
            :label="t('nodes.list.create')"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="keyword"
            icon="i-lucide-search"
            :placeholder="t('nodes.list.searchPlaceholder')"
            class="w-full sm:w-64"
          />
        </template>
        <template #right>
          <USelect
            v-model="groupFilter"
            :items="groupOptions"
            class="w-44"
          />
          <USelect
            v-model="statusFilter"
            :items="statusOptions"
            class="w-36"
          />
          <USelect
            v-model="protocolFilter"
            :items="protocolOptions"
            class="w-36"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div
        v-if="selectedIds.length"
        class="mb-4 flex items-center gap-3"
      >
        <span class="text-sm text-muted">{{ t('nodes.list.selected', { count: selectedIds.length }) }}</span>
        <UButton
          size="sm"
          color="success"
          variant="subtle"
          icon="i-lucide-play"
          @click="onBatch('enable')"
        >
          {{ t('nodes.list.batchEnable') }}
        </UButton>
        <UButton
          size="sm"
          color="error"
          variant="subtle"
          icon="i-lucide-pause"
          @click="onBatch('disable')"
        >
          {{ t('nodes.list.batchDisable') }}
        </UButton>
      </div>

      <UTable
        v-model:row-selection="rowSelection"
        :data="rows"
        :columns="columns"
        :loading="status === 'pending'"
        :get-row-id="(row: Node) => row.id"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-2">
            <span class="font-medium text-default">{{ row.original.name }}</span>
            <UBadge
              v-if="row.original.isRelay"
              color="info"
              variant="subtle"
              :label="t('nodes.form.isRelay')"
            />
          </div>
        </template>

        <template #protocol-cell="{ row }">
          <UBadge
            color="neutral"
            variant="subtle"
            :label="t(`nodes.protocol.${row.original.protocol}`)"
          />
        </template>

        <template #host-cell="{ row }">
          <span class="font-mono text-sm text-default">
            {{ row.original.host }}:{{ row.original.port }}
          </span>
        </template>

        <template #network-cell="{ row }">
          <span class="text-muted">{{ t(`nodes.network.${row.original.network}`) }}</span>
        </template>

        <template #tlsMode-cell="{ row }">
          <UBadge
            color="neutral"
            variant="outline"
            :label="t(`nodes.tlsMode.${row.original.tlsMode}`)"
          />
        </template>

        <template #status-cell="{ row }">
          <UBadge
            :color="statusColorMap[row.original.status] ?? 'neutral'"
            variant="subtle"
            :label="t(`nodes.status.${row.original.status}`)"
          />
        </template>

        <template #trafficRate-cell="{ row }">
          <span class="font-mono tabular-nums">{{ row.original.trafficRate }}×</span>
        </template>

        <template #lastSeenAt-cell="{ row }">
          <span class="text-muted">
            {{ row.original.lastSeenAt ? new Date(row.original.lastSeenAt).toLocaleString() : '—' }}
          </span>
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu :items="rowActions(row.original)">
            <UButton
              icon="i-lucide-more-horizontal"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('common.actions')"
            />
          </UDropdownMenu>
        </template>

        <template #empty>
          <UEmpty icon="i-lucide-server-off" :title="t('nodes.list.empty')" />
        </template>
      </UTable>

      <div class="mt-4 flex justify-end">
        <UPagination
          v-model:page="page"
          :items-per-page="pageSize"
          :total="total"
        />
      </div>

      <!-- 编辑节点 -->
      <USlideover
        v-model:open="slideoverOpen"
        :title="editingId ? t('nodes.list.edit') : t('nodes.list.create')"
      >
        <template #body>
          <UForm
            :schema="UpsertNodeSchema"
            :state="form"
            class="space-y-4"
            @submit="onSubmit"
          >
            <UFormField
              :label="t('nodes.form.name')"
              name="name"
              required
            >
              <UInput
                v-model="form.name"
                :placeholder="t('nodes.form.namePlaceholder')"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="t('nodes.form.group')"
              name="groupId"
              required
            >
              <USelect
                v-model="form.groupId"
                :items="groups.map(group => ({ label: group.name, value: group.id }))"
                class="w-full"
              />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
              <UFormField
                :label="t('nodes.form.protocol')"
                name="protocol"
                required
              >
                <USelect
                  v-model="form.protocol"
                  :items="protocolSelectOptions"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('nodes.form.network')"
                name="network"
              >
                <USelect
                  v-model="form.network"
                  :items="networkOptions"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <UFormField
                :label="t('nodes.form.host')"
                name="host"
                required
              >
                <UInput
                  v-model="form.host"
                  :placeholder="t('nodes.form.hostPlaceholder')"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('nodes.form.port')"
                name="port"
                required
              >
                <UInputNumber
                  v-model="form.port"
                  :min="1"
                  :max="65535"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField
              :label="t('nodes.form.serverPort')"
              name="serverPort"
              :hint="t('nodes.form.serverPortHint')"
            >
              <UInputNumber
                v-model="form.serverPort"
                :min="0"
                :max="65535"
                class="w-full"
              />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
              <UFormField
                :label="t('nodes.form.path')"
                name="path"
              >
                <UInput v-model="form.path" class="w-full" />
              </UFormField>

              <UFormField
                :label="t('nodes.form.hostHeader')"
                name="hostHeader"
              >
                <UInput v-model="form.hostHeader" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <UFormField
                :label="t('nodes.form.uuid')"
                name="uuid"
              >
                <UInput
                  v-model="form.uuid"
                  :placeholder="t('nodes.form.uuidPlaceholder')"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('nodes.form.password')"
                name="password"
              >
                <UInput
                  v-model="form.password"
                  type="password"
                  :placeholder="t('nodes.form.passwordPlaceholder')"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <UFormField
                :label="t('nodes.form.flow')"
                name="flow"
              >
                <UInput v-model="form.flow" class="w-full" />
              </UFormField>

              <UFormField
                :label="t('nodes.form.method')"
                name="method"
              >
                <UInput v-model="form.method" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <UFormField
                :label="t('nodes.form.tlsMode')"
                name="tlsMode"
              >
                <USelect
                  v-model="form.tlsMode"
                  :items="tlsModeOptions"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('nodes.form.sni')"
                name="sni"
              >
                <UInput v-model="form.sni" class="w-full" />
              </UFormField>
            </div>

            <template v-if="form.tlsMode === 'reality'">
              <UFormField
                :label="t('nodes.form.realityPublicKey')"
                name="realityPublicKey"
              >
                <UInput v-model="form.realityPublicKey" class="w-full" />
              </UFormField>

              <div class="grid grid-cols-2 gap-4">
                <UFormField
                  :label="t('nodes.form.realityShortId')"
                  name="realityShortId"
                >
                  <UInput v-model="form.realityShortId" class="w-full" />
                </UFormField>

                <UFormField
                  :label="t('nodes.form.fingerprint')"
                  name="fingerprint"
                >
                  <UInput v-model="form.fingerprint" class="w-full" />
                </UFormField>
              </div>
            </template>

            <template v-else>
              <UFormField
                :label="t('nodes.form.alpn')"
                name="alpn"
                :hint="t('nodes.form.alpnPlaceholder')"
              >
                <UInput v-model="alpnText" class="w-full" />
              </UFormField>
            </template>

            <UFormField
              :label="t('nodes.form.allowInsecure')"
              name="allowInsecure"
            >
              <USwitch v-model="form.allowInsecure" />
            </UFormField>

            <div class="grid grid-cols-3 gap-4">
              <UFormField
                :label="t('nodes.form.trafficRate')"
                name="trafficRate"
              >
                <UInputNumber
                  v-model="form.trafficRate"
                  :min="0"
                  :max="100"
                  :step="0.1"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('nodes.form.priority')"
                name="priority"
              >
                <UInputNumber v-model="form.priority" class="w-full" />
              </UFormField>

              <UFormField
                :label="t('nodes.form.weight')"
                name="weight"
              >
                <UInputNumber
                  v-model="form.weight"
                  :min="0"
                  :max="1000"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <UFormField
                :label="t('nodes.form.status')"
                name="status"
              >
                <USelect
                  v-model="form.status"
                  :items="statusSelectOptions"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('nodes.form.sort')"
                name="sort"
              >
                <UInputNumber v-model="form.sort" class="w-full" />
              </UFormField>
            </div>

            <UFormField
              :label="t('nodes.form.isRelay')"
              name="isRelay"
            >
              <USwitch v-model="form.isRelay" />
            </UFormField>

            <UFormField
              :label="t('nodes.form.remark')"
              name="remark"
            >
              <UTextarea
                v-model="form.remark"
                :rows="3"
                class="w-full"
              />
            </UFormField>
          </UForm>
        </template>

        <template #footer>
          <div class="flex w-full justify-end gap-3">
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('common.cancel')"
              @click="slideoverOpen = false"
            />
            <UButton
              :label="t('common.save')"
              :loading="saving"
              @click="onSubmit"
            />
          </div>
        </template>
      </USlideover>

      <!-- 删除确认 -->
      <UModal
        :open="Boolean(deleteTarget)"
        :title="t('nodes.list.delete')"
        :description="deleteTarget ? t('nodes.list.deleteConfirm', { name: deleteTarget.name }) : ''"
        @update:open="value => { if (!value) deleteTarget = null }"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-3">
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('common.cancel')"
              @click="deleteTarget = null"
            />
            <UButton
              color="error"
              :label="t('common.delete')"
              :loading="deleting"
              @click="onDelete"
            />
          </div>
        </template>
      </UModal>

      <!-- 配置预览 -->
      <UModal
        v-model:open="previewOpen"
        :title="t('nodes.list.previewConfig')"
      >
        <template #body>
          <pre class="max-h-96 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs text-default">{{ previewText }}</pre>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
