<script setup lang="ts">
import type { Plan } from '@sparrow/contracts'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const { t } = useI18n()
const toast = useToast()

const planId = computed(() => String(route.params.id))

const { data: response, status } = await useFetch(() => `/api/v1/user/plans/${planId.value}`, {
  key: 'user-plan-detail'
})

const plan = computed<Plan | undefined>(() => response.value?.data)

const buying = ref(false)

async function buy() {
  if (!plan.value) {
    return
  }

  buying.value = true
  try {
    const result = await $fetch('/api/v1/user/orders', {
      method: 'POST',
      body: { planId: plan.value.id, quantity: 1 }
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
  } finally {
    buying.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="dashboard-plan-detail">
    <template #header>
      <UDashboardNavbar :title="t('plans.detailTitle')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-arrow-left"
            :label="t('plans.back')"
            color="neutral"
            variant="ghost"
            to="/dashboard/plans"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="status === 'pending' || status === 'idle'" class="flex flex-col gap-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-40 w-full" />
      </div>

      <div v-else-if="plan" class="flex flex-col gap-6">
        <UCard class="overflow-hidden">
          <div class="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <h2 class="text-xl font-semibold text-default">
                  {{ plan.name }}
                </h2>
                <UBadge
                  v-if="plan.isHot"
                  color="primary"
                  variant="subtle"
                  :label="t('plans.hot')"
                />
              </div>
              <p v-if="plan.description" class="text-sm text-muted">
                {{ plan.description }}
              </p>
            </div>

            <div class="flex flex-col items-start gap-1 sm:items-end">
              <span class="text-2xl font-semibold tabular-nums text-default">
                {{ formatMoney(plan.price, plan.currency) }}
              </span>
              <span class="text-sm text-muted">
                {{ t('plans.billingCycle', { days: plan.durationDays }) }}
              </span>
            </div>
          </div>

          <USeparator />

          <div class="p-6">
            <PlanSpecList :plan="plan" />
          </div>

          <USeparator />

          <div class="flex flex-wrap items-center gap-2 p-6">
            <UBadge
              v-for="tag in plan.tags"
              :key="tag"
              color="neutral"
              variant="subtle"
              :label="tag"
            />
          </div>
        </UCard>

        <div class="flex justify-end gap-3">
          <UButton
            icon="i-lucide-package"
            color="neutral"
            variant="outline"
            :label="t('plans.back')"
            to="/dashboard/plans"
          />
          <UButton
            icon="i-lucide-shopping-cart"
            :label="t('plans.buy')"
            :loading="buying"
            @click="buy"
          />
        </div>
      </div>

      <UEmpty
        v-else
        icon="i-lucide-package-open"
        :title="t('plans.empty')"
        :description="t('plans.emptyDesc')"
      />
    </template>
  </UDashboardPanel>
</template>
