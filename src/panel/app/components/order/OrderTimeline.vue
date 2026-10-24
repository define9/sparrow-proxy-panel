<script setup lang="ts">
import type { TimelineItem } from '@nuxt/ui'
import type { OrderView } from '~/types/plan-order'

/**
 * 订单流转时间线：创建 → 支付 / 取消 / 过期 → 退款。
 */
const props = defineProps<{
  order: OrderView
}>()

const { t } = useI18n()

const items = computed<TimelineItem[]>(() => {
  const list: TimelineItem[] = [
    {
      icon: 'i-lucide-receipt-text',
      title: t('orders.timeline.created'),
      date: formatDateTime(props.order.createdAt)
    }
  ]

  if (props.order.paidAt) {
    list.push({
      icon: 'i-lucide-circle-check',
      title: t('orders.timeline.paid'),
      date: formatDateTime(props.order.paidAt)
    })
  }

  if (props.order.status === 'cancelled') {
    list.push({
      icon: 'i-lucide-circle-x',
      title: t('orders.timeline.cancelled'),
      date: formatDateTime(props.order.updatedAt)
    })
  }

  if (props.order.status === 'expired') {
    list.push({
      icon: 'i-lucide-clock-alert',
      title: t('orders.timeline.expired'),
      date: formatDateTime(props.order.updatedAt)
    })
  }

  if (props.order.status === 'refunded') {
    list.push({
      icon: 'i-lucide-undo-2',
      title: t('orders.timeline.refunded'),
      date: formatDateTime(props.order.updatedAt)
    })
  }

  return list
})
</script>

<template>
  <UTimeline :items="items" />
</template>
