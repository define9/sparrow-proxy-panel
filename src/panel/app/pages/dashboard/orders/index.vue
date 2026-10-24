<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { OrderView } from '~/types/plan-order'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
const toast = useToast()

const page = ref(1)
const pageSize = 20
const status = ref('')

const statusItems = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('orders.status.pending'), value: 'pending' },
  { label: t('orders.status.paid'), value: 'paid' },
  { label: t('orders.status.cancelled'), value: 'cancelled' },
  { label: t('orders.status.expired'), value: 'expired' },
  { label: t('orders.status.refunded'), value: 'refunded' }
])

const { data: response, status: fetchStatus, refresh } = await useFetch('/api/v1/user/orders', {
  key: 'user-orders',
  query: computed(() => ({
    page: page.value,
    pageSize,
    status: status.value || undefined
  }))
})

const orders = computed<OrderView[]>(() => response.value?.data ?? [])
const total = computed(() => response.value?.meta?.total ?? 0)

const columns: TableColumn<OrderView>[] = [
  { accessorKey: 'orderNo', header: t('orders.orderNo') },
  { accessorKey: 'planName', header: t('orders.planName') },
  { accessorKey: 'amount', header: t('orders.amount') },
  { accessorKey: 'status', header: t('orders.statusLabel') },
  { accessorKey: 'createdAt', header: t('orders.createdAt') },
  { id: 'actions' }
]

/* 取消订单 */
const cancelOpen = ref(false)
const cancelling = ref(false)
const cancellingOrder = ref<OrderView | null>(null)

function openCancel(order: OrderView) {
  cancellingOrder.value = order
  cancelOpen.value = true
}

async function confirmCancel() {
  if (!cancellingOrder.value) {
    return
  }

  cancelling.value = true
  try {
    await $fetch(`/api/v1/user/orders/${cancellingOrder.value.orderNo}/cancel`, { method: 'POST' })
    toast.add({ title: t('orders.cancelled'), color: 'success' })
    cancelOpen.value = false
    await refresh()
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message
    toast.add({ title: t('orders.cancelFailed'), description: message, color: 'error' })
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="dashboard-orders">
      <template #header>
        <UDashboardNavbar :title="t('orders.title')">
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
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar>
          <template #left>
            <USelect
              v-model="status"
              :items="statusItems"
              value-key="value"
              :placeholder="t('orders.statusLabel')"
              class="w-40"
              @update:model-value="page = 1"
            />
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <div class="flex flex-col gap-4">
          <UTable :data="orders" :columns="columns" :loading="fetchStatus === 'pending'">
            <template #orderNo-cell="{ row }">
              <NuxtLink
                :to="`/dashboard/orders/${row.original.orderNo}`"
                class="font-mono text-sm text-primary hover:underline"
              >
                {{ row.original.orderNo }}
              </NuxtLink>
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
                  v-if="row.original.status === 'pending'"
                  icon="i-lucide-circle-x"
                  color="error"
                  variant="soft"
                  size="xs"
                  :label="t('orders.cancel')"
                  @click="openCancel(row.original)"
                />
                <UButton
                  icon="i-lucide-eye"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :label="t('orders.detailTitle')"
                  :to="`/dashboard/orders/${row.original.orderNo}`"
                />
              </div>
            </template>

            <template #empty>
              <UEmpty
                icon="i-lucide-receipt"
                :title="t('orders.empty')"
                :description="t('orders.emptyDesc')"
              />
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

    <UModal v-model:open="cancelOpen" :title="t('orders.cancel')" :description="t('orders.cancelConfirm')">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="cancelOpen = false"
          />
          <UButton
            color="error"
            icon="i-lucide-circle-x"
            :label="t('orders.cancel')"
            :loading="cancelling"
            @click="confirmCancel"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
