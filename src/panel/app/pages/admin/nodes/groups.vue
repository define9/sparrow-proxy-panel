<script setup lang="ts">
import type { NodeGroup } from '@sparrow/contracts'
import type { TableColumn } from '@nuxt/ui'
import { errorMessage } from '~/utils/error-message'

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const toast = useToast()

const { data, status, refresh } = useLazyFetch<{ data: NodeGroup[] }>('/api/v1/admin/nodes/groups')

const rows = computed(() => data.value?.data ?? [])

const columns = computed<TableColumn<NodeGroup>[]>(() => [
  { accessorKey: 'name', header: t('nodes.groups.name') },
  { accessorKey: 'region', header: t('nodes.groups.region') },
  { accessorKey: 'nodeCount', header: t('nodes.groups.nodeCount') },
  { accessorKey: 'onlineCount', header: t('nodes.groups.onlineCount') },
  { accessorKey: 'sort', header: t('nodes.groups.sort') },
  { accessorKey: 'remark', header: t('nodes.groups.remark') },
  { id: 'actions' }
])

/* ── 表单 ─────────────────────────────────────────────── */

interface GroupFormState {
  name: string
  region: string
  sort: number
  remark: string
}

const slideoverOpen = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

function emptyForm(): GroupFormState {
  return { name: '', region: '', sort: 0, remark: '' }
}

const form = reactive<GroupFormState>(emptyForm())

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  slideoverOpen.value = true
}

function openEdit(row: NodeGroup) {
  editingId.value = row.id
  Object.assign(form, {
    name: row.name,
    region: row.region ?? '',
    sort: row.sort,
    remark: row.remark ?? ''
  })
  slideoverOpen.value = true
}

async function onSubmit() {
  saving.value = true
  try {
    const body = {
      name: form.name,
      region: form.region || null,
      sort: form.sort,
      remark: form.remark || null
    }

    if (editingId.value) {
      await $fetch(`/api/v1/admin/nodes/groups/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: t('nodes.groups.updateSuccess'), color: 'success' })
    } else {
      await $fetch('/api/v1/admin/nodes/groups', { method: 'POST', body })
      toast.add({ title: t('nodes.groups.createSuccess'), color: 'success' })
    }

    slideoverOpen.value = false
    await refresh()
  } catch (error) {
    toast.add({
      title: editingId.value ? t('nodes.groups.updateFailed') : t('nodes.groups.createFailed'),
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

/* ── 删除 ─────────────────────────────────────────────── */

const deleteTarget = ref<NodeGroup | null>(null)
const deleting = ref(false)

async function onDelete() {
  if (!deleteTarget.value) {
    return
  }
  deleting.value = true
  try {
    await $fetch(`/api/v1/admin/nodes/groups/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: t('nodes.groups.delete'), color: 'success' })
    deleteTarget.value = null
    await refresh()
  } catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  } finally {
    deleting.value = false
  }
}

const rowActions = (row: NodeGroup) => [
  { label: t('nodes.groups.edit'), icon: 'i-lucide-pencil', onSelect: () => openEdit(row) },
  { label: t('nodes.groups.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = row } }
]
</script>

<template>
  <UDashboardPanel id="admin-node-groups">
    <template #header>
      <UDashboardNavbar :title="t('nodes.groups.title')">
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
            :label="t('nodes.groups.create')"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="status === 'pending'"
      >
        <template #name-cell="{ row }">
          <span class="font-medium text-default">{{ row.original.name }}</span>
        </template>

        <template #region-cell="{ row }">
          <span class="text-muted">{{ row.original.region || '—' }}</span>
        </template>

        <template #nodeCount-cell="{ row }">
          <span class="font-mono tabular-nums">{{ row.original.nodeCount ?? 0 }}</span>
        </template>

        <template #onlineCount-cell="{ row }">
          <UBadge
            color="success"
            variant="subtle"
            :label="String(row.original.onlineCount ?? 0)"
          />
        </template>

        <template #remark-cell="{ row }">
          <span class="text-muted">{{ row.original.remark || '—' }}</span>
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
          <UEmpty icon="i-lucide-folder-tree" :title="t('nodes.groups.empty')" />
        </template>
      </UTable>

      <USlideover
        v-model:open="slideoverOpen"
        :title="editingId ? t('nodes.groups.edit') : t('nodes.groups.create')"
      >
        <template #body>
          <UForm
            :state="form"
            class="space-y-4"
            @submit="onSubmit"
          >
            <UFormField
              :label="t('nodes.groups.name')"
              name="name"
              required
            >
              <UInput
                v-model="form.name"
                :placeholder="t('nodes.groups.namePlaceholder')"
                class="w-full"
              />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
              <UFormField
                :label="t('nodes.groups.region')"
                name="region"
              >
                <UInput v-model="form.region" class="w-full" />
              </UFormField>

              <UFormField
                :label="t('nodes.groups.sort')"
                name="sort"
              >
                <UInputNumber v-model="form.sort" class="w-full" />
              </UFormField>
            </div>

            <UFormField
              :label="t('nodes.groups.remark')"
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

      <UModal
        :open="Boolean(deleteTarget)"
        :title="t('nodes.groups.delete')"
        :description="deleteTarget ? t('nodes.groups.deleteConfirm', { name: deleteTarget.name }) : ''"
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
