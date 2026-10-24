<script setup lang="ts">
import type { OrderView } from '~/types/plan-order'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const { t } = useI18n()
const toast = useToast()

const orderNo = computed(() => String(route.params.orderNo))

const { data: response, status, refresh } = await useFetch(() => `/api/v1/user/orders/${orderNo.value}`, {
  key: 'user-order-detail'
})

const order = computed<OrderView | undefined>(() => response.value?.data)

const cancelling = ref(false)

async function cancel() {
  if (!order.value) {
    return
  }

  cancelling.value = true
  try {
    await $fetch(`/api/v1/user/orders/${order.value.orderNo}/cancel`, { method: 'POST' })
    toast.add({ title: t('orders.cancelled'), color: 'success' })
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
  <UDashboardPanel id="dashboard-order-detail">
    <template #header>
      <UDashboardNavbar :title="t('orders.detailTitle')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-arrow-left"
            :label="t('orders.back')"
            color="neutral"
            variant="ghost"
            to="/dashboard/orders"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="status === 'pending' || status === 'idle'" class="flex flex-col gap-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-48 w-full" />
      </div>

      <div v-else-if="order" class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <UCard class="lg:col-span-2">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <span class="font-mono text-sm text-muted">{{ order.orderNo }}</span>
              <OrderStatusBadge :status="order.status" />
            </div>
          </template>

          <template #body>
            <dl class="grid grid-cols-1 gap-y-4 sm:grid-cols-2">
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-sm text-muted">
                  {{ t('orders.planName') }}
                </dt>
                <dd class="text-sm font-medium text-default">
                  {{ order.planName || '-' }}
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-sm text-muted">
                  {{ t('orders.amount') }}
                </dt>
                <dd class="font-mono tabular-nums text-sm font-medium text-default">
                  {{ formatMoney(order.amount, order.currency) }}
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-sm text-muted">
                  {{ t('orders.discount') }}
                </dt>
                <dd class="font-mono tabular-nums text-sm font-medium text-default">
                  {{ formatMoney(order.discount, order.currency) }}
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-sm text-muted">
                  {{ t('orders.createdAt') }}
                </dt>
                <dd class="text-sm font-medium text-default">
                  {{ formatDateTime(order.createdAt) }}
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-sm text-muted">
                  {{ t('orders.expiresAt') }}
                </dt>
                <dd class="text-sm font-medium text-default">
                  {{ formatDateTime(order.expiresAt) }}
                </dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-sm text-muted">
                  {{ t('orders.paidAt') }}
                </dt>
                <dd class="text-sm font-medium text-default">
                  {{ formatDateTime(order.paidAt) }}
                </dd>
              </div>
            </dl>
          </template>
        </UCard>

        <UCard>
          <template #header>
            <span class="text-sm font-medium text-default">
              {{ t('orders.timeline.created') }}
            </span>
          </template>
          <template #body>
            <OrderTimeline :order="order" />
          </template>
        </UCard>

        <div class="flex justify-end gap-3 lg:col-span-3">
          <UButton
            v-if="order.status === 'pending'"
            icon="i-lucide-circle-x"
            color="error"
            variant="soft"
            :label="t('orders.cancel')"
            :loading="cancelling"
            @click="cancel"
          />
        </div>
      </div>

      <UEmpty
        v-else
        icon="i-lucide-receipt"
        :title="t('orders.empty')"
        :description="t('orders.emptyDesc')"
      />
    </template>
  </UDashboardPanel>
</template>
