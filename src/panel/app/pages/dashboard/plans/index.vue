<script setup lang="ts">
import type { Plan } from '@sparrow/contracts'
import type { PricingPlanProps } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
const toast = useToast()

const { data: response, status, refresh } = await useFetch('/api/v1/user/plans', {
  key: 'user-plans'
})

const plans = computed<Plan[]>(() => response.value?.data ?? [])

/** 商品卖点列表（UPricingPlan 的 features） */
function buildFeatures(plan: Plan): string[] {
  const features: string[] = [
    plan.trafficGb > 0
      ? t('plans.features.traffic', { value: plan.trafficGb })
      : t('plans.features.trafficUnlimited'),
    t('plans.features.duration', { value: plan.durationDays }),
    plan.deviceLimit > 0
      ? t('plans.features.devices', { value: plan.deviceLimit })
      : t('plans.features.devicesUnlimited'),
    plan.speedLimitMbps > 0
      ? t('plans.features.speed', { value: plan.speedLimitMbps })
      : t('plans.features.speedUnlimited')
  ]

  if (plan.stock !== null) {
    features.push(t('plans.stock', { count: plan.stock }))
  }

  return features
}

const pricingPlans = computed<PricingPlanProps[]>(() => plans.value.map(plan => ({
  title: plan.name,
  description: plan.description ?? undefined,
  price: formatMoney(plan.price, plan.currency),
  billingCycle: t('plans.billingCycle', { days: plan.durationDays }),
  badge: plan.isHot ? t('plans.hot') : undefined,
  highlight: plan.isHot,
  features: buildFeatures(plan),
  button: {
    label: t('plans.buy'),
    block: true,
    onClick: () => buy(plan)
  }
})))

async function buy(plan: Plan) {
  try {
    const result = await $fetch('/api/v1/user/orders', {
      method: 'POST',
      body: { planId: plan.id, quantity: 1 }
    })

    toast.add({
      title: t('plans.orderCreated'),
      description: result.data.orderNo,
      color: 'success'
    })

    await navigateTo(`/dashboard/orders/${result.data.orderNo}`)
  } catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message
    toast.add({ title: t('plans.orderFailed'), description: message, color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="dashboard-plans">
    <template #header>
      <UDashboardNavbar :title="t('plans.title')">
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
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <p class="text-sm text-muted">
          {{ t('plans.subtitle') }}
        </p>

        <div v-if="status === 'pending' || status === 'idle'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <USkeleton v-for="index in 3" :key="index" class="h-80 w-full" />
        </div>

        <UPricingPlans
          v-else-if="plans.length"
          :plans="pricingPlans"
          orientation="horizontal"
          scale
          class="w-full"
        />

        <UEmpty
          v-else
          icon="i-lucide-package-open"
          :title="t('plans.empty')"
          :description="t('plans.emptyDesc')"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
