<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { DateValue } from '@internationalized/date'
import { parseAbsoluteToLocal } from '@internationalized/date'
import { errorMessage } from '~/utils/error-message'

definePageMeta({ layout: 'admin' })

interface CertificateRow {
  id: string
  name: string
  type: string
  source: string
  cert: string
  key: string | null
  hasKey: boolean
  issuer: string | null
  notBefore: string | null
  notAfter: string | null
  daysRemaining: number | null
  expired: boolean
  expiringSoon: boolean
  createdAt: string
  updatedAt: string
}

const { t } = useI18n()
const toast = useToast()

const { data, status, refresh } = useLazyFetch<{ data: CertificateRow[] }>('/api/v1/admin/nodes/certificates')

const rows = computed(() => data.value?.data ?? [])
const expiring = computed(() => rows.value.filter(row => row.expiringSoon))
const expired = computed(() => rows.value.filter(row => row.expired))

const columns = computed<TableColumn<CertificateRow>[]>(() => [
  { accessorKey: 'name', header: t('nodes.certificates.name') },
  { accessorKey: 'type', header: t('nodes.certificates.type') },
  { accessorKey: 'source', header: t('nodes.certificates.source') },
  { accessorKey: 'issuer', header: t('nodes.certificates.issuer') },
  { accessorKey: 'notAfter', header: t('nodes.certificates.notAfter') },
  { id: 'actions' }
])

/* ── 表单 ─────────────────────────────────────────────── */

interface CertificateFormState {
  name: string
  type: string
  source: string
  cert: string
  key: string
}

/**
 * 到期时间用 `shallowRef` 单独存：
 *
 * `reactive()` 会深度解包类型，`CalendarDate` / `ZonedDateTime` 这类带私有字段的类
 * 解包后会丢失类型品牌，导致无法赋给 `UInputDate` 的 `modelValue`。
 */
const notAfter = shallowRef<DateValue | undefined>(undefined)

/** DateValue → ISO 字符串 */
function toIsoDate(value: DateValue): string {
  if ('timeZone' in value) {
    // ZonedDateTime
    return value.toDate().toISOString()
  }
  if ('hour' in value) {
    // CalendarDateTime
    return value.toDate('UTC').toISOString()
  }
  // CalendarDate
  return value.toDate('UTC').toISOString()
}

function onNotAfterChange(value: DateValue | null | undefined) {
  notAfter.value = value ?? undefined
}

const slideoverOpen = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

function emptyForm(): CertificateFormState {
  return {
    name: '',
    type: 'custom',
    source: 'manual',
    cert: '',
    key: ''
  }
}

const form = reactive<CertificateFormState>(emptyForm())
const certFile = ref<File | null>(null)
const keyFile = ref<File | null>(null)

const typeOptions = computed(() => [
  { label: t('nodes.certificateType.custom'), value: 'custom' },
  { label: t('nodes.certificateType.generic'), value: 'generic' }
])

const sourceOptions = computed(() => [
  { label: t('nodes.certificateSource.manual'), value: 'manual' },
  { label: t('nodes.certificateSource.acme'), value: 'acme' }
])

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  notAfter.value = undefined
  certFile.value = null
  keyFile.value = null
  slideoverOpen.value = true
}

function openEdit(row: CertificateRow) {
  editingId.value = row.id
  Object.assign(form, {
    name: row.name,
    type: row.type,
    source: row.source,
    cert: row.cert,
    key: ''
  })
  notAfter.value = row.notAfter ? parseAbsoluteToLocal(row.notAfter) : undefined
  certFile.value = null
  keyFile.value = null
  slideoverOpen.value = true
}

async function onCertFile(file: File | null | undefined) {
  certFile.value = file ?? null
  if (file) {
    form.cert = await file.text()
  }
}

async function onKeyFile(file: File | null | undefined) {
  keyFile.value = file ?? null
  if (file) {
    form.key = await file.text()
  }
}

async function onSubmit() {
  saving.value = true
  try {
    const body = {
      name: form.name,
      type: form.type,
      source: form.source,
      cert: form.cert,
      key: form.key || undefined,
      notAfter: notAfter.value ? toIsoDate(notAfter.value) : null
    }

    if (editingId.value) {
      await $fetch(`/api/v1/admin/nodes/certificates/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: t('nodes.certificates.updateSuccess'), color: 'success' })
    } else {
      await $fetch('/api/v1/admin/nodes/certificates', { method: 'POST', body })
      toast.add({ title: t('nodes.certificates.createSuccess'), color: 'success' })
    }

    slideoverOpen.value = false
    await refresh()
  } catch (error) {
    toast.add({
      title: editingId.value ? t('nodes.certificates.updateFailed') : t('nodes.certificates.createFailed'),
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

/* ── 删除 ─────────────────────────────────────────────── */

const deleteTarget = ref<CertificateRow | null>(null)
const deleting = ref(false)

async function onDelete() {
  if (!deleteTarget.value) {
    return
  }
  deleting.value = true
  try {
    await $fetch(`/api/v1/admin/nodes/certificates/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: t('nodes.certificates.delete'), color: 'success' })
    deleteTarget.value = null
    await refresh()
  } catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  } finally {
    deleting.value = false
  }
}

const rowActions = (row: CertificateRow) => [
  { label: t('nodes.certificates.edit'), icon: 'i-lucide-pencil', onSelect: () => openEdit(row) },
  { label: t('nodes.certificates.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = row } }
]
</script>

<template>
  <UDashboardPanel id="admin-node-certificates">
    <template #header>
      <UDashboardNavbar :title="t('nodes.certificates.title')">
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
            :label="t('nodes.certificates.create')"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mb-4 space-y-3">
        <UAlert
          v-if="expired.length"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('nodes.certificates.expiredAlert', { count: expired.length })"
          :description="expired.map(item => item.name).join('、')"
        />
        <UAlert
          v-if="expiring.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-clock-alert"
          :title="t('nodes.certificates.expiringAlert', { count: expiring.length })"
          :description="expiring.map(item => item.name).join('、')"
        />
      </div>

      <UTable
        :data="rows"
        :columns="columns"
        :loading="status === 'pending'"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-2">
            <span class="font-medium text-default">{{ row.original.name }}</span>
            <UBadge
              v-if="!row.original.hasKey"
              color="warning"
              variant="subtle"
              :label="t('nodes.certificates.noKey')"
            />
          </div>
        </template>

        <template #type-cell="{ row }">
          <UBadge
            color="neutral"
            variant="outline"
            :label="t(`nodes.certificateType.${row.original.type}`)"
          />
        </template>

        <template #source-cell="{ row }">
          <span class="text-muted">{{ t(`nodes.certificateSource.${row.original.source}`) }}</span>
        </template>

        <template #issuer-cell="{ row }">
          <span class="text-muted">{{ row.original.issuer || '—' }}</span>
        </template>

        <template #notAfter-cell="{ row }">
          <div class="flex flex-col gap-1">
            <span class="text-default">
              {{ row.original.notAfter ? new Date(row.original.notAfter).toLocaleDateString() : '—' }}
            </span>
            <UBadge
              v-if="row.original.expired"
              color="error"
              variant="subtle"
              :label="t('nodes.certificates.expired')"
            />
            <UBadge
              v-else-if="row.original.expiringSoon"
              color="warning"
              variant="subtle"
              :label="t('nodes.certificates.daysRemaining', { days: row.original.daysRemaining ?? 0 })"
            />
          </div>
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
          <UEmpty icon="i-lucide-shield-off" :title="t('nodes.certificates.empty')" />
        </template>
      </UTable>

      <USlideover
        v-model:open="slideoverOpen"
        :title="editingId ? t('nodes.certificates.edit') : t('nodes.certificates.create')"
      >
        <template #body>
          <UForm
            :state="form"
            class="space-y-4"
            @submit="onSubmit"
          >
            <UFormField
              :label="t('nodes.certificates.name')"
              name="name"
              required
            >
              <UInput v-model="form.name" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
              <UFormField
                :label="t('nodes.certificates.type')"
                name="type"
              >
                <USelect
                  v-model="form.type"
                  :items="typeOptions"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('nodes.certificates.source')"
                name="source"
              >
                <USelect
                  v-model="form.source"
                  :items="sourceOptions"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField
              :label="t('nodes.certificates.uploadCert')"
              name="cert"
              required
            >
              <UFileUpload
                :model-value="certFile"
                accept=".pem,.crt,.cer,.txt"
                :label="t('nodes.certificates.uploadCert')"
                :description="t('nodes.certificates.uploadCertHint')"
                @update:model-value="onCertFile"
              />
            </UFormField>

            <UFormField
              :label="t('nodes.certificates.uploadKey')"
              name="key"
            >
              <UFileUpload
                :model-value="keyFile"
                accept=".pem,.key,.txt"
                :label="t('nodes.certificates.uploadKey')"
                :description="t('nodes.certificates.uploadKeyHint')"
                @update:model-value="onKeyFile"
              />
            </UFormField>

            <UFormField
              :label="t('nodes.certificates.notAfter')"
              name="notAfter"
            >
              <UInputDate
                :model-value="notAfter"
                :range="false"
                class="w-full"
                @update:model-value="onNotAfterChange"
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

      <UModal
        :open="Boolean(deleteTarget)"
        :title="t('nodes.certificates.delete')"
        :description="deleteTarget ? t('nodes.certificates.deleteConfirm', { name: deleteTarget.name }) : ''"
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
    </template>
  </UDashboardPanel>
</template>
