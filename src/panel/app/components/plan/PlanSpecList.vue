<script setup lang="ts">
import type { Plan } from '@sparrow/contracts'

/**
 * 商品规格列表：把商品的流量、时长、设备数、限速等规格平铺展示。
 */
const props = defineProps<{
  plan: Plan
}>()

const { t } = useI18n()

const specs = computed(() => {
  const items: { label: string, value: string }[] = [
    { label: t('plans.typeLabel'), value: t(`plans.type.${props.plan.type}`) },
    {
      label: t('plans.features.trafficLabel'),
      value: props.plan.trafficGb > 0
        ? t('plans.features.traffic', { value: props.plan.trafficGb })
        : t('plans.features.trafficUnlimited')
    },
    {
      label: t('plans.features.durationLabel'),
      value: t('plans.features.duration', { value: props.plan.durationDays })
    },
    {
      label: t('plans.features.devicesLabel'),
      value: props.plan.deviceLimit > 0
        ? t('plans.features.devices', { value: props.plan.deviceLimit })
        : t('plans.features.devicesUnlimited')
    },
    {
      label: t('plans.features.speedLabel'),
      value: props.plan.speedLimitMbps > 0
        ? t('plans.features.speed', { value: props.plan.speedLimitMbps })
        : t('plans.features.speedUnlimited')
    }
  ]

  if (props.plan.resetDay) {
    items.push({
      label: t('plans.features.resetLabel'),
      value: t('plans.features.reset', { day: props.plan.resetDay })
    })
  }

  return items
})
</script>

<template>
  <dl class="grid grid-cols-1 gap-y-3 sm:grid-cols-2">
    <div v-for="spec in specs" :key="spec.label" class="flex items-baseline justify-between gap-4">
      <dt class="text-sm text-muted">
        {{ spec.label }}
      </dt>
      <dd class="text-sm font-medium text-default text-right">
        {{ spec.value }}
      </dd>
    </div>
  </dl>
</template>
