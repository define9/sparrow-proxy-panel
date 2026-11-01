'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrderStatus, Plan } from '@sparrow/contracts'
import { apiFetch, queryKeys, type ListResponse } from './client'
import { buildQuery } from './admin'

/**
 * 管理端商品 / 订单 / 订阅的客户端 hooks。
 * 路由契约见 app/api/v1/admin/{plans,orders,subscriptions}。
 */

/* ------------------------------------------------------------------ 类型 */

export type AdminPlan = Plan

export interface AdminPlanInput {
  name: string
  slug: string
  description?: string
  type?: Plan['type']
  price: string
  originalPrice?: string | null
  trafficGb?: number
  durationDays: number
  deviceLimit?: number
  speedLimitMbps?: number
  stock?: number | null
  status?: Plan['status']
  isHot?: boolean
  tags?: string[]
  sort?: number
}

export interface AdminOrderRow {
  id: string
  orderNo: string
  userId: string
  userEmail: string
  planId: string
  planName: string
  amount: string
  discount: string
  status: OrderStatus
  paymentMethod: string | null
  tradeNo: string | null
  expiresAt: string
  paidAt: string | null
  createdAt: string
}

export interface AdminOrderPaymentRecord {
  id: string
  gateway: string
  amount: string
  status: string
  tradeNo: string | null
  createdAt: string
  raw: Record<string, unknown> | null
}

export interface AdminOrderTimelineStep {
  key: string
  title: string
  at: string | null
  done: boolean
}

export interface AdminOrderDetail {
  order: AdminOrderRow
  paymentRecords: AdminOrderPaymentRecord[]
  timeline: AdminOrderTimelineStep[]
  meta: Record<string, unknown> | null
}

export interface AdminOrderListResponse extends ListResponse<AdminOrderRow> {
  /** 各状态订单数，用于 Tabs 角标 */
  counts: Record<'all' | OrderStatus, number>
}

export type AdminSubscriptionStatus = 'active' | 'paused' | 'expired' | 'cancelled'

export interface AdminSubscriptionRow {
  id: string
  token: string
  userId: string
  userEmail: string
  planId: string
  planName: string
  orderId: string | null
  status: AdminSubscriptionStatus
  format: 'v2ray' | 'clash' | 'singbox'
  deviceLimit: number
  speedLimitMbps: number
  trafficLimit: number
  trafficUsed: number
  upload: number
  download: number
  expireAt: string
  createdAt: string
}

export type AdminSubscriptionPatch = Partial<
  Pick<AdminSubscriptionRow, 'trafficLimit' | 'deviceLimit' | 'speedLimitMbps' | 'expireAt' | 'status'>
>

export type AdminSubscriptionBatchAction = 'extend' | 'quota' | 'speed'

/* ------------------------------------------------------------------ 商品 */

export function useAdminPlans(filters: { q?: string; status?: string } = {}) {
  return useQuery({
    queryKey: [...queryKeys.plans('admin'), filters],
    queryFn: () =>
      apiFetch<AdminPlan[]>(
        `/api/v1/admin/plans${buildQuery({
          q: filters.q,
          status: filters.status === 'all' ? undefined : filters.status
        })}`
      )
  })
}

function useInvalidatePlans() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['plans'] })
    qc.invalidateQueries({ queryKey: ['logs'] })
  }
}

export function useCreateAdminPlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: (body: AdminPlanInput) =>
      apiFetch<AdminPlan>('/api/v1/admin/plans', { method: 'POST', body }),
    onSuccess: invalidate
  })
}

export function useUpdateAdminPlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<AdminPlanInput> & { id: string }) =>
      apiFetch<AdminPlan>(`/api/v1/admin/plans/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate
  })
}

export function useDuplicateAdminPlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<AdminPlan>(`/api/v1/admin/plans/${id}/duplicate`, { method: 'POST' }),
    onSuccess: invalidate
  })
}

export function useDeleteAdminPlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/admin/plans/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate
  })
}

/* ------------------------------------------------------------------ 订单 */

export function useAdminOrders(filters: {
  status?: string
  q?: string
  page?: number
  pageSize?: number
}) {
  return useQuery({
    queryKey: queryKeys.orders(filters),
    queryFn: () =>
      apiFetch<AdminOrderListResponse>(
        `/api/v1/admin/orders${buildQuery({
          status: filters.status === 'all' ? undefined : filters.status,
          q: filters.q,
          page: filters.page,
          pageSize: filters.pageSize
        })}`
      )
  })
}

export function useAdminOrderDetail(id: string | null) {
  return useQuery({
    queryKey: ['admin-order', id],
    enabled: Boolean(id),
    queryFn: () => apiFetch<AdminOrderDetail>(`/api/v1/admin/orders/${id}`)
  })
}

function useInvalidateOrders() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['admin-order'] })
    qc.invalidateQueries({ queryKey: ['plans'] })
    qc.invalidateQueries({ queryKey: ['subscriptions'] })
    qc.invalidateQueries({ queryKey: ['logs'] })
  }
}

export function useCompleteAdminOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiFetch<{ order: AdminOrderDetail; subscriptionId: string | null; idempotent: boolean }>(
        `/api/v1/admin/orders/${id}/complete`,
        { method: 'POST', body: { note } }
      ),
    onSuccess: invalidate
  })
}

export function useRefundAdminOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiFetch<{ order: AdminOrderDetail; cancelledSubscriptions: number }>(
        `/api/v1/admin/orders/${id}/refund`,
        { method: 'POST', body: { reason } }
      ),
    onSuccess: invalidate
  })
}

/* ------------------------------------------------------------------ 订阅 */

export function useAdminSubscriptions(filters: {
  q?: string
  status?: string
  page?: number
  pageSize?: number
}) {
  return useQuery({
    queryKey: queryKeys.subscriptions(filters),
    queryFn: () =>
      apiFetch<ListResponse<AdminSubscriptionRow>>(
        `/api/v1/admin/subscriptions${buildQuery({
          q: filters.q,
          status: filters.status === 'all' ? undefined : filters.status,
          page: filters.page,
          pageSize: filters.pageSize
        })}`
      )
  })
}

function useInvalidateSubscriptions() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['subscriptions'] })
    qc.invalidateQueries({ queryKey: ['logs'] })
  }
}

export function useUpdateAdminSubscription() {
  const invalidate = useInvalidateSubscriptions()
  return useMutation({
    mutationFn: ({ id, ...body }: AdminSubscriptionPatch & { id: string }) =>
      apiFetch<AdminSubscriptionRow>(`/api/v1/admin/subscriptions/${id}`, {
        method: 'PATCH',
        body
      }),
    onSuccess: invalidate
  })
}

export function useBatchAdminSubscriptions() {
  const invalidate = useInvalidateSubscriptions()
  return useMutation({
    mutationFn: (body: { ids: string[]; action: AdminSubscriptionBatchAction; value: number }) =>
      apiFetch<{ updated: number; ids: string[] }>('/api/v1/admin/subscriptions/batch', {
        method: 'POST',
        body
      }),
    onSuccess: invalidate
  })
}
