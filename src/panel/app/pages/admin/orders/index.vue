<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { OrderView } from '~/types/plan-order'
import { ALL_FILTER, toFilterParam } from '~/utils/filters'

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const toast = useToast()

/* ──────────────────────────── 筛选 ──────────────────────────── */

const page = ref(1)
const pageSize = 20
const search = ref('')
const keyword = ref('')
const statusFilter = ref(ALL_FILTER)
const from = ref('')
const to = ref('')

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

const { data: response, status: fetchStatus, refresh } = await useFetch('/api/v1/admin/orders', {
  key: 'admin-orders',
  query: computed(() => ({
    page: page.value,
    pageSize,
    q: keyword.value || undefined,
    status: toFilterParam(statusFilter.value),
    from: from.value || undefined,
    to: to.value || undefined
  }))
})

const orders = computed<OrderView[]>(() => response.value?.data ?? [])
const total = computed(() => response.value?.meta?.total ?? 0)

interface FilterOption {
  label: string
  value: string
}

const statusItems = computed<FilterOption[]>(() => [
  { label: t('common.all'), value: ALL_FILTER },
  { label: t('orders.status.pending'), value: 'pending' },
  { label: t('orders.status.paid'), value: 'paid' },
  { label: t('orders.status.cancelled'), value: 'cancelled' },
  { label: t('orders.status.expired'), value: 'expired' },
  { label: t('orders.status.refunded'), value: 'refunded' }
])

const columns: TableColumn<OrderView>[] = [
  { accessorKey: 'orderNo', header: t('orders.admin.table.orderNo') },
  { accessorKey: 'userEmail', header: t('orders.admin.table.user') },
  { accessorKey: 'planName', header: t('orders.admin.table.planName') },
  { accessorKey: 'amount', header: t('orders.admin.table.amount') },
  { accessorKey: 'status', header: t('orders.admin.table.status') },
  { accessorKey: 'createdAt', header: t('orders.admin.table.createdAt') },
  { id: 'actions' }
]

/* ──────────────────────────── 详情 ──────────────────────────── */

const detailOpen = ref(false)
const detailOrder = ref<OrderView | null>(null)

function openDetail(order: OrderView) {
  detailOrder.value = order
  detailOpen.value = true
}

/* ──────────────────────────── 手动完成 ──────────────────────────── */

const completeOpen = ref(false)
const completing = ref(false)
const completingOrder = ref<OrderView | null>(null)

function openComplete(order: OrderView) {
  completingOrder.value = order
  completeOpen.value = true
}

async function confirmComplete() {
  if (!completingOrder.value) {
    return
  }

  completing.value = true
  try {
    const result = await $fetch(`/api/v1/admin/orders/${completingOrder.value.id}/complete`, {
      method: 'POST'
    })

    toast.add({
      title: t('orders.admin.completeSuccess'),
      description: result.todo?.subscription,
      color: 'success'
    })

    completeOpen.value = false
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message
    toast.add({ title: t('orders.admin.completeSuccess'), description: message, color: 'error' })
  } finally {
    completing.value = false
  }
}

/* ──────────────────────────── 退款 ──────────────────────────── */

const refundOpen = ref(false)
const refunding = ref(false)
const refundingOrder = ref<OrderView | null>(null)

function openRefund(order: OrderView) {
  refundingOrder.value = order
  refundOpen.value = true
}

async function confirmRefund() {
  if (!refundingOrder.value) {
    return
  }

  refunding.value = true
  try {
    await $fetch(`/api/v1/admin/orders/${refundingOrder.value.id}/refund`, { method: 'POST' })
    toast.add({ title: t('orders.admin.refundSuccess'), color: 'success' })
    refundOpen.value = false
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message
    toast.add({ title: t('orders.admin.refundSuccess'), description: message, color: 'error' })
  } finally {
    refunding.value = false
  }
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="admin-orders">
      <template #header>
        <UDashboardNavbar :title="t('orders.admin.title')">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UButton
              icon="i-lucide-refresh-cw"
              :label="t('common.refresh')"
              color="neutral"
              variant="ghost"
              @click="refresh()"
            />
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar>
          <template #left>
            <UInput
              v-model="search"
              icon="i-lucide-search"
              :placeholder="t('orders.admin.filter.keyword')"
              class="w-64"
            />
            <UInput
              v-model="from"
              type="date"
              :aria-label="t('orders.admin.filter.range')"
              class="w-40"
              @update:model-value="page = 1"
            />
            <UInput
              v-model="to"
              type="date"
              :aria-label="t('orders.admin.filter.range')"
              class="w-40"
              @update:model-value="page = 1"
            />
          </template>
          <template #right>
            <USelect
              v-model="statusFilter"
              :items="statusItems"
              value-key="value"
              :placeholder="t('orders.admin.filter.status')"
              class="w-36"
              @update:model-value="page = 1"
            />
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <div class="flex flex-col gap-4">
          <UTable :data="orders" :columns="columns" :loading="fetchStatus === 'pending'">
            <template #orderNo-cell="{ row }">
              <span class="font-mono text-sm text-default">{{ row.original.orderNo }}</span>
            </template>

            <template #userEmail-cell="{ row }">
              <span class="text-sm text-muted">{{ row.original.userEmail || row.original.userId }}</span>
            </template>

            <template #planName-cell="{ row }">
              <span class="text-sm text-default">{{ row.original.planName || '-' }}</span>
            </template>

            <template #amount-cell="{ row }">
              <span class="font-mono tabular-nums text-default">
                {{ formatMoney(row.original.amount, row.original.currency) }}
              </span>
            </template>

            <template #status-cell="{ row }">
              <OrderStatusBadge :status="row.original.status" />
            </template>

            <template #createdAt-cell="{ row }">
              <span class="text-sm text-muted">{{ formatDateTime(row.original.createdAt) }}</span>
            </template>

            <template #actions-cell="{ row }">
              <div class="flex items-center justify-end gap-2">
                <UButton
                  icon="i-lucide-eye"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :label="t('orders.detailTitle')"
                  @click="openDetail(row.original)"
                />
                <UButton
                  v-if="row.original.status === 'pending'"
                  icon="i-lucide-circle-check"
                  color="success"
                  variant="soft"
                  size="xs"
                  :label="t('orders.admin.complete')"
                  @click="openComplete(row.original)"
                />
                <UButton
                  v-if="row.original.status === 'paid'"
                  icon="i-lucide-undo-2"
                  color="error"
                  variant="soft"
                  size="xs"
                  :label="t('orders.admin.refund')"
                  @click="openRefund(row.original)"
                />
              </div>
            </template>

            <template #empty>
              <UEmpty icon="i-lucide-receipt" :title="t('orders.empty')" />
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

    <USlideover v-model:open="detailOpen" :title="t('orders.detailTitle')">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <span class="font-mono text-sm text-muted">{{ detailOrder?.orderNo }}</span>
          <OrderStatusBadge v-if="detailOrder" :status="detailOrder.status" />
        </div>
      </template>

      <template #body>
        <div v-if="detailOrder" class="flex flex-col gap-6">
          <dl class="grid grid-cols-1 gap-y-4">
            <div class="flex items-baseline justify-between gap-4">
              <dt class="text-sm text-muted">
                {{ t('orders.admin.table.user') }}
              </dt>
              <dd class="text-sm font-medium text-default">
                {{ detailOrder.userEmail || detailOrder.userId }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-4">
              <dt class="text-sm text-muted">
                {{ t('orders.planName') }}
              </dt>
              <dd class="text-sm font-medium text-default">
                {{ detailOrder.planName || '-' }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-4">
              <dt class="text-sm text-muted">
                {{ t('orders.amount') }}
              </dt>
              <dd class="font-mono tabular-nums text-sm font-medium text-default">
                {{ formatMoney(detailOrder.amount, detailOrder.currency) }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-4">
              <dt class="text-sm text-muted">
                {{ t('orders.discount') }}
              </dt>
              <dd class="font-mono tabular-nums text-sm font-medium text-default">
                {{ formatMoney(detailOrder.discount, detailOrder.currency) }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-4">
              <dt class="text-sm text-muted">
                {{ t('orders.createdAt') }}
              </dt>
              <dd class="text-sm font-medium text-default">
                {{ formatDateTime(detailOrder.createdAt) }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-4">
              <dt class="text-sm text-muted">
                {{ t('orders.paidAt') }}
              </dt>
              <dd class="text-sm font-medium text-default">
                {{ formatDateTime(detailOrder.paidAt) }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-4">
              <dt class="text-sm text-muted">
                {{ t('orders.expiresAt') }}
              </dt>
              <dd class="text-sm font-medium text-default">
                {{ formatDateTime(detailOrder.expiresAt) }}
              </dd>
            </div>
          </dl>

          <USeparator />

          <OrderTimeline :order="detailOrder" />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            v-if="detailOrder?.status === 'pending'"
            icon="i-lucide-circle-check"
            color="success"
            variant="soft"
            :label="t('orders.admin.complete')"
            @click="openComplete(detailOrder)"
          />
          <UButton
            v-if="detailOrder?.status === 'paid'"
            icon="i-lucide-undo-2"
            color="error"
            variant="soft"
            :label="t('orders.admin.refund')"
            @click="openRefund(detailOrder)"
          />
        </div>
      </template>
    </USlideover>

    <UModal
      v-model:open="completeOpen"
      :title="t('orders.admin.complete')"
      :description="t('orders.admin.completeConfirm')"
    >
      <template #body>
        <UAlert
          icon="i-lucide-info"
          color="warning"
          variant="subtle"
          :title="t('orders.admin.complete')"
          :description="t('orders.admin.completeTodo')"
        />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="completeOpen = false"
          />
          <UButton
            color="success"
            icon="i-lucide-circle-check"
            :label="t('orders.admin.complete')"
            :loading="completing"
            @click="confirmComplete"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="refundOpen"
      :title="t('orders.admin.refund')"
      :description="t('orders.admin.refundConfirm')"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="refundOpen = false"
          />
          <UButton
            color="error"
            icon="i-lucide-undo-2"
            :label="t('orders.admin.refund')"
            :loading="refunding"
            @click="confirmRefund"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
