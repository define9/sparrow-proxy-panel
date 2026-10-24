<script setup lang="ts">
import type { Plan, PlanStatus, PlanType } from '@sparrow/contracts'
import { CurrencySchema, MoneySchema, PlanStatusSchema, PlanTypeSchema } from '@sparrow/contracts'
import type { TableColumn } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const toast = useToast()

/* ──────────────────────────── 列表 ──────────────────────────── */

const page = ref(1)
const pageSize = 20
const search = ref('')
const keyword = ref('')
const statusFilter = ref('')
const typeFilter = ref('')

let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(search, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    keyword.value = value.trim()
    page.value = 1
  }, 300)
})

const { data: response, status: fetchStatus, refresh } = await useFetch('/api/v1/admin/plans', {
  key: 'admin-plans',
  query: computed(() => ({
    page: page.value,
    pageSize,
    q: keyword.value || undefined,
    status: statusFilter.value || undefined,
    type: typeFilter.value || undefined
  }))
})

const plans = computed<Plan[]>(() => response.value?.data ?? [])
const total = computed(() => response.value?.meta?.total ?? 0)

const statusItems = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('plans.status.draft'), value: 'draft' },
  { label: t('plans.status.active'), value: 'active' },
  { label: t('plans.status.inactive'), value: 'inactive' }
])

const typeItems = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('plans.type.traffic'), value: 'traffic' },
  { label: t('plans.type.time'), value: 'time' },
  { label: t('plans.type.bandwidth'), value: 'bandwidth' }
])

const columns: TableColumn<Plan>[] = [
  { accessorKey: 'name', header: t('plans.admin.table.name') },
  { accessorKey: 'slug', header: t('plans.admin.table.slug') },
  { accessorKey: 'type', header: t('plans.admin.table.type') },
  { accessorKey: 'price', header: t('plans.admin.table.price') },
  { accessorKey: 'stock', header: t('plans.admin.table.stock') },
  { accessorKey: 'soldCount', header: t('plans.admin.table.soldCount') },
  { accessorKey: 'status', header: t('plans.admin.table.status') },
  { id: 'actions' }
]

/* ──────────────────────────── 表单 ──────────────────────────── */

interface PlanFormState {
  name: string
  slug: string
  description: string
  type: PlanType
  price: string
  originalPrice: string
  currency: string
  trafficGb: number
  durationDays: number
  deviceLimit: number
  speedLimitMbps: number
  resetDay: number | undefined
  renewResetRatio: number
  stock: number | undefined
  status: PlanStatus
  sort: number
  isHot: boolean
  tags: string[]
}

const formSchema = computed(() => z.object({
  name: z.string().trim().min(1, t('plans.admin.form.errors.required')).max(128),
  slug: z.string().trim().min(1, t('plans.admin.form.errors.required')).max(64).regex(/^[a-z0-9-]+$/, t('plans.admin.form.errors.slug')),
  description: z.string().max(500),
  type: PlanTypeSchema,
  price: MoneySchema,
  originalPrice: z.string(),
  currency: CurrencySchema,
  trafficGb: z.number().int().nonnegative(),
  durationDays: z.number().int().nonnegative(),
  deviceLimit: z.number().int().nonnegative(),
  speedLimitMbps: z.number().int().nonnegative(),
  resetDay: z.number().int().min(1).max(28).optional(),
  renewResetRatio: z.number().min(0).max(1),
  stock: z.number().int().nonnegative().optional(),
  status: PlanStatusSchema,
  sort: z.number().int(),
  isHot: z.boolean(),
  tags: z.array(z.string()).max(5, t('plans.admin.form.errors.tags'))
}))

const state = reactive<PlanFormState>({
  name: '',
  slug: '',
  description: '',
  type: 'traffic',
  price: '',
  originalPrice: '',
  currency: 'CNY',
  trafficGb: 0,
  durationDays: 30,
  deviceLimit: 3,
  speedLimitMbps: 0,
  resetDay: undefined,
  renewResetRatio: 1,
  stock: undefined,
  status: 'draft',
  sort: 0,
  isHot: false,
  tags: []
})

const modalOpen = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

function resetForm() {
  Object.assign(state, {
    name: '',
    slug: '',
    description: '',
    type: 'traffic',
    price: '',
    originalPrice: '',
    currency: 'CNY',
    trafficGb: 0,
    durationDays: 30,
    deviceLimit: 3,
    speedLimitMbps: 0,
    resetDay: undefined,
    renewResetRatio: 1,
    stock: undefined,
    status: 'draft',
    sort: 0,
    isHot: false,
    tags: []
  } satisfies PlanFormState)
}

function openCreate() {
  editingId.value = null
  resetForm()
  modalOpen.value = true
}

function openEdit(plan: Plan) {
  editingId.value = plan.id
  Object.assign(state, {
    name: plan.name,
    slug: plan.slug,
    description: plan.description ?? '',
    type: plan.type,
    price: plan.price,
    originalPrice: plan.originalPrice ?? '',
    currency: plan.currency,
    trafficGb: plan.trafficGb,
    durationDays: plan.durationDays,
    deviceLimit: plan.deviceLimit,
    speedLimitMbps: plan.speedLimitMbps,
    resetDay: plan.resetDay ?? undefined,
    renewResetRatio: plan.renewResetRatio,
    stock: plan.stock ?? undefined,
    status: plan.status,
    sort: plan.sort,
    isHot: plan.isHot,
    tags: [...plan.tags]
  } satisfies PlanFormState)
  modalOpen.value = true
}

async function onSubmit() {
  saving.value = true
  try {
    const payload = {
      name: state.name.trim(),
      slug: state.slug.trim(),
      description: state.description.trim() || null,
      type: state.type,
      price: state.price.trim(),
      originalPrice: state.originalPrice.trim() || null,
      currency: state.currency.trim().toUpperCase(),
      trafficGb: state.trafficGb,
      durationDays: state.durationDays,
      deviceLimit: state.deviceLimit,
      speedLimitMbps: state.speedLimitMbps,
      resetDay: state.resetDay ?? null,
      renewResetRatio: state.renewResetRatio,
      stock: state.stock ?? null,
      status: state.status,
      sort: state.sort,
      isHot: state.isHot,
      tags: state.tags
    }

    if (editingId.value) {
      await $fetch(`/api/v1/admin/plans/${editingId.value}`, { method: 'PATCH', body: payload })
      toast.add({ title: t('plans.admin.updated'), color: 'success' })
    } else {
      await $fetch('/api/v1/admin/plans', { method: 'POST', body: payload })
      toast.add({ title: t('plans.admin.created'), color: 'success' })
    }

    modalOpen.value = false
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message
    toast.add({ title: t('plans.admin.form.errors.save'), description: message, color: 'error' })
  } finally {
    saving.value = false
  }
}

/* ──────────────────────────── 上下架 / 删除 ──────────────────────────── */

const busyId = ref<string | null>(null)

async function toggleStatus(plan: Plan) {
  const next: PlanStatus = plan.status === 'active' ? 'inactive' : 'active'
  busyId.value = plan.id
  try {
    await $fetch(`/api/v1/admin/plans/${plan.id}/status`, {
      method: 'POST',
      body: { status: next }
    })
    toast.add({
      title: next === 'active' ? t('plans.admin.published') : t('plans.admin.unpublished'),
      color: 'success'
    })
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message
    toast.add({ title: t('plans.admin.form.errors.save'), description: message, color: 'error' })
  } finally {
    busyId.value = null
  }
}

const deleteOpen = ref(false)
const deleting = ref(false)
const deletingPlan = ref<Plan | null>(null)

function openDelete(plan: Plan) {
  deletingPlan.value = plan
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!deletingPlan.value) {
    return
  }

  deleting.value = true
  try {
    await $fetch(`/api/v1/admin/plans/${deletingPlan.value.id}`, { method: 'DELETE' })
    toast.add({ title: t('plans.admin.deleted'), color: 'success' })
    deleteOpen.value = false
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message
    toast.add({ title: t('plans.admin.deleteBlocked'), description: message, color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="admin-plans">
      <template #header>
        <UDashboardNavbar :title="t('plans.admin.title')">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UButton
              icon="i-lucide-refresh"
              :label="t('common.refresh')"
              color="neutral"
              variant="ghost"
              @click="refresh()"
            />
            <UButton
              icon="i-lucide-plus"
              :label="t('plans.admin.create')"
              @click="openCreate"
            />
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar>
          <template #left>
            <UInput
              v-model="search"
              icon="i-lucide-search"
              :placeholder="t('plans.admin.filter.keyword')"
              class="w-64"
            />
          </template>
          <template #right>
            <USelect
              v-model="typeFilter"
              :items="typeItems"
              value-key="value"
              :placeholder="t('plans.admin.filter.type')"
              class="w-36"
              @update:model-value="page = 1"
            />
            <USelect
              v-model="statusFilter"
              :items="statusItems"
              value-key="value"
              :placeholder="t('plans.admin.filter.status')"
              class="w-36"
              @update:model-value="page = 1"
            />
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <div class="flex flex-col gap-4">
          <UTable :data="plans" :columns="columns" :loading="fetchStatus === 'pending'">
            <template #name-cell="{ row }">
              <span class="text-sm font-medium text-default">{{ row.original.name }}</span>
            </template>

            <template #slug-cell="{ row }">
              <span class="font-mono text-xs text-muted">{{ row.original.slug }}</span>
            </template>

            <template #type-cell="{ row }">
              <span class="text-sm text-muted">{{ t(`plans.type.${row.original.type}`) }}</span>
            </template>

            <template #price-data="{ row }">
              <span class="font-mono tabular-nums text-default">
                {{ formatMoney(row.original.price, row.original.currency) }}
              </span>
            </template>

            <template #stock-cell="{ row }">
              <span class="text-sm text-muted">
                {{ row.original.stock === null ? t('plans.unlimited') : row.original.stock }}
              </span>
            </template>

            <template #soldCount-cell="{ row }">
              <span class="text-sm text-muted">{{ row.original.soldCount }}</span>
            </template>

            <template #status-cell="{ row }">
              <PlanStatusBadge :status="row.original.status" />
            </template>

            <template #actions-cell="{ row }">
              <div class="flex items-center justify-end">
                <UDropdownMenu
                  :items="[
                    [{
                      label: t('common.edit'),
                      icon: 'i-lucide-pencil',
                      onSelect: () => openEdit(row.original)
                    }],
                    [{
                      label: row.original.status === 'active' ? t('plans.admin.unpublish') : t('plans.admin.publish'),
                      icon: row.original.status === 'active' ? 'i-lucide-eye-off' : 'i-lucide-eye',
                      onSelect: () => toggleStatus(row.original)
                    }],
                    [{
                      label: t('plans.admin.delete'),
                      icon: 'i-lucide-trash-2',
                      color: 'error',
                      onSelect: () => openDelete(row.original)
                    }]
                  ]"
                >
                  <UButton
                    icon="i-lucide-ellipsis"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :loading="busyId === row.original.id"
                    :aria-label="t('plans.admin.table.actions')"
                  />
                </UDropdownMenu>
              </div>
            </template>

            <template #empty>
              <UEmpty icon="i-lucide-package-open" :title="t('plans.empty')" />
            </template>
          </UTable>

          <UPagination
            v-if="total > 0"
            v-model:page="page"
            :items-per-page="pageSize"
            :total="total"
            :sibling-count="1"
          />
        </div>
      </template>
    </UDashboardPanel>

    <UModal
      v-model:open="modalOpen"
      :title="editingId ? t('plans.admin.edit') : t('plans.admin.create')"
      :description="t('plans.admin.subtitle')"
    >
      <template #body>
        <UForm
          :schema="formSchema"
          :state="state"
          class="flex flex-col gap-4"
          @submit="onSubmit"
        >
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField :label="t('plans.admin.form.name')" name="name" required>
              <UInput v-model="state.name" class="w-full" />
            </UFormField>

            <UFormField
              :label="t('plans.admin.form.slug')"
              name="slug"
              required
              :description="t('plans.admin.form.slugHint')"
            >
              <UInput v-model="state.slug" class="w-full" />
            </UFormField>
          </div>

          <UFormField :label="t('plans.admin.form.description')" name="description">
            <UTextarea v-model="state.description" :rows="3" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField :label="t('plans.admin.form.type')" name="type" required>
              <USelect
                v-model="state.type"
                :items="typeItems.slice(1)"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField :label="t('plans.admin.form.status')" name="status" required>
              <USelect
                v-model="state.status"
                :items="statusItems.slice(1)"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <UFormField
              :label="t('plans.admin.form.price')"
              name="price"
              required
              :description="t('plans.admin.form.priceHint')"
            >
              <UInput v-model="state.price" class="w-full" />
            </UFormField>

            <UFormField
              :label="t('plans.admin.form.originalPrice')"
              name="originalPrice"
              :description="t('plans.admin.form.originalPriceHint')"
            >
              <UInput v-model="state.originalPrice" class="w-full" />
            </UFormField>

            <UFormField :label="t('plans.admin.form.currency')" name="currency" required>
              <UInput v-model="state.currency" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('plans.admin.form.trafficGb')"
              name="trafficGb"
              :description="t('plans.admin.form.trafficHint')"
            >
              <UInputNumber v-model="state.trafficGb" :min="0" class="w-full" />
            </UFormField>

            <UFormField :label="t('plans.admin.form.durationDays')" name="durationDays">
              <UInputNumber v-model="state.durationDays" :min="0" class="w-full" />
            </UFormField>

            <UFormField
              :label="t('plans.admin.form.deviceLimit')"
              name="deviceLimit"
              :description="t('plans.admin.form.deviceLimitHint')"
            >
              <UInputNumber v-model="state.deviceLimit" :min="0" class="w-full" />
            </UFormField>

            <UFormField
              :label="t('plans.admin.form.speedLimitMbps')"
              name="speedLimitMbps"
              :description="t('plans.admin.form.speedLimitHint')"
            >
              <UInputNumber v-model="state.speedLimitMbps" :min="0" class="w-full" />
            </UFormField>

            <UFormField
              :label="t('plans.admin.form.resetDay')"
              name="resetDay"
              :description="t('plans.admin.form.resetDayHint')"
            >
              <UInputNumber
                v-model="state.resetDay"
                :min="1"
                :max="28"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="t('plans.admin.form.renewResetRatio')"
              name="renewResetRatio"
              :description="t('plans.admin.form.renewResetRatioHint')"
            >
              <UInputNumber
                v-model="state.renewResetRatio"
                :min="0"
                :max="1"
                :step="0.1"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="t('plans.admin.form.stock')"
              name="stock"
              :description="t('plans.admin.form.stockHint')"
            >
              <UInputNumber v-model="state.stock" :min="0" class="w-full" />
            </UFormField>

            <UFormField
              :label="t('plans.admin.form.sort')"
              name="sort"
              :description="t('plans.admin.form.sortHint')"
            >
              <UInputNumber v-model="state.sort" class="w-full" />
            </UFormField>
          </div>

          <UFormField
            :label="t('plans.admin.form.tags')"
            name="tags"
            :description="t('plans.admin.form.tagsHint')"
          >
            <UInputTags v-model="state.tags" :max="5" class="w-full" />
          </UFormField>

          <UFormField :label="t('plans.admin.form.isHot')" name="isHot">
            <USwitch v-model="state.isHot" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('common.cancel')"
              @click="modalOpen = false"
            />
            <UButton
              type="submit"
              icon="i-lucide-check"
              :label="t('common.save')"
              :loading="saving"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteOpen"
      :title="t('plans.admin.delete')"
      :description="t('plans.admin.deleteConfirm')"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="deleteOpen = false"
          />
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            :loading="deleting"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
