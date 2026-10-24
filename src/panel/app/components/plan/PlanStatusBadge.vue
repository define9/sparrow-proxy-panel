<script setup lang="ts">
import type { PlanStatus } from '@sparrow/contracts'

/**
 * 商品状态徽标。
 *
 * 颜色映射与设计系统 §6「状态 → 颜色映射」保持一致：
 * 草稿 / 已下架为中性色，已上架为成功色。
 */
const props = defineProps<{
  status: PlanStatus
}>()

const { t } = useI18n()

type BadgeColor = 'success' | 'warning' | 'error' | 'neutral' | 'info'
type BadgeVariant = 'subtle' | 'outline'

const MAP: Record<PlanStatus, { color: BadgeColor, variant: BadgeVariant }> = {
  draft: { color: 'neutral', variant: 'subtle' },
  active: { color: 'success', variant: 'subtle' },
  inactive: { color: 'neutral', variant: 'outline' }
}

const conf = computed(() => MAP[props.status] ?? { color: 'neutral' as BadgeColor, variant: 'subtle' as BadgeVariant })
</script>

<template>
  <UBadge :color="conf.color" :variant="conf.variant" :label="t(`plans.status.${status}`)" />
</template>
