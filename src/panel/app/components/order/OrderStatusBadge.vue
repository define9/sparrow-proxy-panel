<script setup lang="ts">
import type { OrderStatus } from '@sparrow/contracts'

/**
 * 订单状态徽标。
 *
 * 颜色映射与设计系统 §6「状态 → 颜色映射」保持一致：
 * 待支付 warning、已支付 success、已取消 neutral、已过期 neutral outline、已退款 error。
 */
const props = defineProps<{
  status: OrderStatus
}>()

const { t } = useI18n()

type BadgeColor = 'success' | 'warning' | 'error' | 'neutral' | 'info'
type BadgeVariant = 'subtle' | 'outline'

const MAP: Record<OrderStatus, { color: BadgeColor, variant: BadgeVariant }> = {
  pending: { color: 'warning', variant: 'subtle' },
  paid: { color: 'success', variant: 'subtle' },
  cancelled: { color: 'neutral', variant: 'subtle' },
  expired: { color: 'neutral', variant: 'outline' },
  refunded: { color: 'error', variant: 'subtle' }
}

const conf = computed(() => MAP[props.status] ?? { color: 'neutral' as BadgeColor, variant: 'subtle' as BadgeVariant })
</script>

<template>
  <UBadge :color="conf.color" :variant="conf.variant" :label="t(`orders.status.${status}`)" />
</template>
