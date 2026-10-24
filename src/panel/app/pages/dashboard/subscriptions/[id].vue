<script setup lang="ts">
import { z } from 'zod'
import type { SubscriptionDetail } from '~/types/subscription'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
const { bytes, datetime, percent } = useFormatters()
const toast = useToast()
const route = useRoute()

useSubscriptionI18n()

const id = computed(() => String(route.params.id ?? ''))

const { data: subscription, refresh } = await useFetch<SubscriptionDetail>(`/api/v1/user/subscriptions/${id.value}`, {
  watch: [id]
})

/** 订阅链接的三种格式 */
const formats = ['v2ray', 'clash', 'singbox'] as const

const urls = computed(() => {
  const source = subscription.value?.urls ?? {}
  return formats
    .map(format => ({ format, url: source[format] ?? '' }))
    .filter(item => item.url.length > 0)
})

/** 二维码弹窗 */
const qrOpen = ref(false)
const qrFormat = ref('')
const qrUrl = ref('')

const qr = computed(() => (qrUrl.value ? renderQrPath(qrUrl.value) : null))

function openQrcode(format: string, url: string) {
  qrFormat.value = format
  qrUrl.value = url
  qrOpen.value = true
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: t('subscriptions.actions.copySuccess'), color: 'success' })
  } catch {
    toast.add({ title: t('subscriptions.actions.copyFailed'), color: 'error' })
  }
}

/* ── 编辑订阅 ── */

const formSchema = z.object({
  format: z.enum(['v2ray', 'clash', 'singbox']),
  deviceLimit: z.coerce.number().int().min(0).max(999),
  speedLimitMbps: z.coerce.number().int().min(0).max(100000)
})

const form = reactive({
  format: 'v2ray' as 'v2ray' | 'clash' | 'singbox',
  deviceLimit: 0,
  speedLimitMbps: 0
})

watch(
  subscription,
  (value) => {
    if (!value) {
      return
    }
    form.format = value.format
    form.deviceLimit = value.deviceLimit
    form.speedLimitMbps = value.speedLimitMbps
  },
  { immediate: true }
)

const saving = ref(false)

async function saveSettings() {
  saving.value = true
  try {
    await $fetch(`/api/v1/user/subscriptions/${id.value}`, {
      method: 'PATCH',
      body: {
        format: form.format,
        deviceLimit: form.deviceLimit,
        speedLimitMbps: form.speedLimitMbps
      }
    })
    await refresh()
    toast.add({ title: t('subscriptions.actions.saveSuccess'), color: 'success' })
  } catch {
    toast.add({ title: t('subscriptions.actions.saveFailed'), color: 'error' })
  } finally {
    saving.value = false
  }
}

/* ── IP 白名单 ── */

const ipWhitelist = ref<string[]>([])

watch(
  subscription,
  (value) => {
    ipWhitelist.value = [...(value?.ipWhitelist ?? [])]
  },
  { immediate: true }
)

const savingWhitelist = ref(false)

async function saveWhitelist() {
  savingWhitelist.value = true
  try {
    await $fetch(`/api/v1/user/subscriptions/${id.value}`, {
      method: 'PATCH',
      body: { ipWhitelist: ipWhitelist.value }
    })
    await refresh()
    toast.add({ title: t('subscriptions.actions.saveSuccess'), color: 'success' })
  } catch {
    toast.add({ title: t('subscriptions.actions.saveFailed'), color: 'error' })
  } finally {
    savingWhitelist.value = false
  }
}

/* ── 重置流量 / 踢下线 ── */

const resetting = ref(false)

async function resetTraffic() {
  resetting.value = true
  try {
    await $fetch(`/api/v1/user/subscriptions/${id.value}/reset`, { method: 'POST' })
    await refresh()
    toast.add({ title: t('subscriptions.actions.resetSuccess'), color: 'success' })
  } catch {
    toast.add({ title: t('subscriptions.actions.resetFailed'), color: 'error' })
  } finally {
    resetting.value = false
  }
}

const kicking = ref(false)

async function kickDevices() {
  kicking.value = true
  try {
    await $fetch(`/api/v1/user/subscriptions/${id.value}/devices`, { method: 'POST' })
    toast.add({ title: t('subscriptions.actions.kickSuccess'), color: 'success' })
  } catch {
    toast.add({ title: t('subscriptions.actions.kickFailed'), color: 'error' })
  } finally {
    kicking.value = false
  }
}

/** 是否已到可以手动重置流量的时间 */
const canReset = computed(() => {
  const resetAt = subscription.value?.resetAt
  if (!resetAt) {
    return true
  }
  return new Date(resetAt).getTime() <= Date.now()
})

const statusColors: Record<string, { color: 'success' | 'warning' | 'neutral' | 'error', variant: 'subtle' | 'outline' }> = {
  active: { color: 'success', variant: 'subtle' },
  paused: { color: 'warning', variant: 'subtle' },
  expired: { color: 'neutral', variant: 'outline' },
  cancelled: { color: 'error', variant: 'subtle' }
}

const statusColor = (value: string) => statusColors[value] ?? { color: 'neutral', variant: 'outline' } as const
</script>

<template>
  <UDashboardPanel id="dashboard-subscription-detail">
    <template #header>
      <UDashboardNavbar :title="subscription?.planName || t('subscriptions.detail.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-arrow-left"
            :label="t('subscriptions.back')"
            color="neutral"
            variant="ghost"
            to="/dashboard/subscriptions"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!subscription" class="flex justify-center py-10">
        <UProgress :model-value="null" class="w-64" />
      </div>

      <div v-else class="flex flex-col gap-6">
        <!-- 概览 -->
        <UCard>
          <div class="flex flex-wrap items-center gap-3">
            <UBadge
              :color="statusColor(subscription.status).color"
              :variant="statusColor(subscription.status).variant"
              :label="t(`subscriptions.status.${subscription.status}`)"
            />
            <span class="text-sm text-muted">
              {{ subscription.planName || t('subscriptions.unnamed') }}
            </span>
            <span class="text-sm text-muted">
              · {{ t('subscriptions.detail.nodes', { count: subscription.nodeCount }) }}
            </span>
          </div>

          <div class="mt-4 flex flex-col gap-2">
            <UProgress
              :model-value="Math.round(subscription.quota.usedRatio * 100)"
              :max="100"
              :color="subscription.quota.overused ? 'error' : 'primary'"
            />
            <div class="flex flex-wrap gap-4 text-sm text-muted">
              <span>{{ t('subscriptions.detail.used') }}: {{ bytes(subscription.trafficUsed) }}</span>
              <span>{{ t('subscriptions.detail.total') }}: {{ subscription.trafficLimit > 0 ? bytes(subscription.trafficLimit) : t('subscriptions.unlimited') }}</span>
              <span>{{ t('subscriptions.detail.remaining') }}: {{ subscription.quota.remainingBytes > 0 ? bytes(subscription.quota.remainingBytes) : t('subscriptions.unlimited') }}</span>
              <span>{{ percent(subscription.quota.usedRatio) }}</span>
            </div>
          </div>

          <div class="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p class="text-xs text-muted">
                {{ t('subscriptions.detail.deviceLimit') }}
              </p>
              <p class="font-mono tabular-nums">
                {{ subscription.deviceLimit > 0 ? subscription.deviceLimit : t('subscriptions.unlimited') }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                {{ t('subscriptions.detail.speedLimit') }}
              </p>
              <p class="font-mono tabular-nums">
                {{ subscription.speedLimitMbps > 0 ? `${subscription.speedLimitMbps} Mbps` : t('subscriptions.unlimited') }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                {{ t('subscriptions.detail.expireAt') }}
              </p>
              <p>
                {{ datetime(subscription.expireAt) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                {{ t('subscriptions.detail.resetAt') }}
              </p>
              <p>
                {{ datetime(subscription.resetAt) }}
              </p>
            </div>
          </div>
        </UCard>

        <!-- 订阅链接 -->
        <UCard :title="t('subscriptions.detail.links')" :description="t('subscriptions.detail.linksDesc')">
          <div class="flex flex-col gap-4">
            <div v-for="item in urls" :key="item.format" class="flex flex-col gap-2">
              <p class="text-sm font-medium text-default">
                {{ t(`subscriptions.format.${item.format}`) }}
              </p>
              <div class="flex items-center gap-2">
                <UInput
                  :model-value="item.url"
                  readonly
                  class="flex-1 font-mono text-xs"
                  :aria-label="t('subscriptions.detail.links')"
                />
                <UButton
                  icon="i-lucide-copy"
                  size="sm"
                  variant="outline"
                  color="neutral"
                  :aria-label="t('subscriptions.detail.copy')"
                  @click="copyUrl(item.url)"
                />
                <UButton
                  icon="i-lucide-qr-code"
                  size="sm"
                  variant="outline"
                  color="neutral"
                  :aria-label="t('subscriptions.detail.qrcode')"
                  @click="openQrcode(item.format, item.url)"
                />
              </div>
            </div>
          </div>
        </UCard>

        <!-- 订阅设置 -->
        <UCard :title="t('subscriptions.detail.settings')">
          <UForm
            :schema="formSchema"
            :state="form"
            class="flex flex-col gap-4"
            @submit="saveSettings"
          >
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField :label="t('subscriptions.detail.format')" name="format">
                <USelect
                  v-model="form.format"
                  :items="formats.map(item => ({ label: t(`subscriptions.format.${item}`), value: item }))"
                  class="w-full"
                />
              </UFormField>

              <UFormField :label="t('subscriptions.detail.deviceLimit')" name="deviceLimit">
                <UInput
                  v-model="form.deviceLimit"
                  type="number"
                  min="0"
                  class="w-full"
                />
              </UFormField>

              <UFormField :label="t('subscriptions.detail.speedLimit')" name="speedLimitMbps">
                <UInput
                  v-model="form.speedLimitMbps"
                  type="number"
                  min="0"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="flex justify-end">
              <UButton type="submit" :loading="saving" :label="t('common.save')" />
            </div>
          </UForm>
        </UCard>

        <!-- IP 白名单 -->
        <UCard :title="t('subscriptions.detail.ipWhitelist')" :description="t('subscriptions.detail.ipWhitelistDesc')">
          <div class="flex flex-col gap-3">
            <UInputTags v-model="ipWhitelist" :placeholder="t('subscriptions.detail.ipWhitelistPlaceholder')" class="w-full" />
            <div class="flex justify-end">
              <UButton
                icon="i-lucide-save"
                :label="t('common.save')"
                color="neutral"
                variant="outline"
                :loading="savingWhitelist"
                @click="saveWhitelist"
              />
            </div>
          </div>
        </UCard>

        <!-- 设备与流量 -->
        <UCard :title="t('subscriptions.detail.actions')">
          <div class="flex flex-wrap gap-3">
            <UButton
              icon="i-lucide-rotate-cw"
              :label="t('subscriptions.detail.resetTraffic')"
              color="neutral"
              variant="outline"
              :disabled="!canReset"
              :loading="resetting"
              @click="resetTraffic"
            />
            <UButton
              icon="i-lucide-log-out"
              :label="t('subscriptions.detail.kickDevices')"
              color="error"
              variant="outline"
              :loading="kicking"
              @click="kickDevices"
            />
          </div>
        </UCard>
      </div>

      <!-- 二维码 -->
      <UModal v-model:open="qrOpen" :title="t('subscriptions.detail.qrcode')" :description="t(`subscriptions.format.${qrFormat}`)">
        <template #body>
          <div class="flex justify-center">
            <svg
              v-if="qr"
              :viewBox="`0 0 ${qr.total} ${qr.total}`"
              class="h-64 w-64 rounded-lg bg-white p-2"
              shape-rendering="crispEdges"
              role="img"
              :aria-label="t('subscriptions.detail.qrcode')"
            >
              <rect :width="qr.total" :height="qr.total" fill="#ffffff" />
              <path :d="qr.path" fill="#000000" />
            </svg>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
