<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SubscriptionListItem, SubscriptionListResponse } from '~/types/subscription'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
const { bytes, datetime } = useFormatters()

useSubscriptionI18n()

const page = ref(1)
const pageSize = 10

const { data: response, status, refresh } = await useFetch<SubscriptionListResponse>('/api/v1/user/subscriptions', {
  query: { page, pageSize },
  watch: [page]
})

const rows = computed<SubscriptionListItem[]>(() => response.value?.data ?? [])
const total = computed(() => response.value?.meta.total ?? 0)

/** 状态 → 颜色（与设计系统状态色表一致） */
const statusColors: Record<string, { color: 'success' | 'warning' | 'neutral' | 'error', variant: 'subtle' | 'outline' }> = {
  active: { color: 'success', variant: 'subtle' },
  paused: { color: 'warning', variant: 'subtle' },
  expired: { color: 'neutral', variant: 'outline' },
  cancelled: { color: 'error', variant: 'subtle' }
}

const statusColor = (value: string) => statusColors[value] ?? { color: 'neutral', variant: 'outline' } as const

const columns: TableColumn<SubscriptionListItem>[] = [
  { accessorKey: 'planName', header: t('subscriptions.columns.plan') },
  { accessorKey: 'status', header: t('subscriptions.columns.status') },
  { id: 'traffic', header: t('subscriptions.columns.traffic') },
  { accessorKey: 'format', header: t('subscriptions.columns.format') },
  { accessorKey: 'deviceLimit', header: t('subscriptions.columns.devices') },
  { accessorKey: 'expireAt', header: t('subscriptions.columns.expireAt') },
  { id: 'actions' }
]

/** 限速文案（0 表示不限速） */
const speedText = (mbps: number) => (mbps > 0 ? `${mbps} Mbps` : t('subscriptions.unlimited'))

/** 设备数文案（0 表示不限） */
const deviceText = (count: number) => (count > 0 ? String(count) : t('subscriptions.unlimited'))
</script>

<template>
  <UDashboardPanel id="dashboard-subscriptions">
    <template #header>
      <UDashboardNavbar :title="t('subscriptions.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            :label="t('common.refresh')"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
        <template #planName-cell="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-default">{{ row.original.planName || t('subscriptions.unnamed') }}</span>
            <span class="text-xs text-muted">{{ row.original.id }}</span>
          </div>
        </template>

        <template #status-cell="{ row }">
          <UBadge
            :color="statusColor(row.original.status).color"
            :variant="statusColor(row.original.status).variant"
            :label="t(`subscriptions.status.${row.original.status}`)"
          />
        </template>

        <template #traffic-cell="{ row }">
          <div class="flex w-40 flex-col gap-1">
            <UProgress
              :model-value="Math.round(row.original.quota.usedRatio * 100)"
              :max="100"
              size="sm"
              :color="row.original.quota.overused ? 'error' : 'primary'"
            />
            <span class="text-xs text-muted">
              {{ bytes(row.original.trafficUsed) }} / {{ row.original.trafficLimit > 0 ? bytes(row.original.trafficLimit) : t('subscriptions.unlimited') }}
            </span>
          </div>
        </template>

        <template #format-cell="{ row }">
          <UChip :label="t(`subscriptions.format.${row.original.format}`)" size="sm" variant="soft" />
        </template>

        <template #deviceLimit-cell="{ row }">
          <span class="font-mono tabular-nums">{{ deviceText(row.original.deviceLimit) }}</span>
        </template>

        <template #expireAt-cell="{ row }">
          <span class="text-muted">{{ datetime(row.original.expireAt) }}</span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-2">
            <span class="text-xs text-muted">{{ speedText(row.original.speedLimitMbps) }}</span>
            <UButton
              icon="i-lucide-external-link"
              size="sm"
              variant="ghost"
              color="neutral"
              :to="`/dashboard/subscriptions/${row.original.id}`"
              :aria-label="t('subscriptions.detail.title')"
            />
          </div>
        </template>

        <template #empty>
          <UEmpty
            icon="i-lucide-rss"
            :title="t('subscriptions.empty')"
            :description="t('subscriptions.emptyDesc')"
          />
        </template>
      </UTable>

      <div v-if="total > pageSize" class="flex justify-end pt-4">
        <UPagination
          v-model:page="page"
          :items-per-page="pageSize"
          :total="total"
          :sibling-count="1"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
