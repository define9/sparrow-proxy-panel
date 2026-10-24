import { requireOwnedSubscription, clearDeviceRecords } from '../../../../../utils/subscription'

/**
 * POST /api/v1/user/subscriptions/{id}/devices
 *
 * 踢下线：清空该订阅的设备记录。
 *
 * 面板侧没有独立的设备表（设备与并发连接由 Agent / 内核维护），
 * 这里清掉面板保存的设备快照并返回清理条数；
 * 内核侧的强制断连需要 Agent 收到配置重载后完成。
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_TOKEN_EXPIRED',
      message: '请先登录',
      data: { code: 'AUTH_TOKEN_EXPIRED', message: '请先登录' }
    })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'SUB_NOT_FOUND',
      message: '订阅不存在',
      data: { code: 'SUB_NOT_FOUND', message: '订阅不存在' }
    })
  }

  const db = useDb()
  const subscription = await requireOwnedSubscription(db, user.id, id)

  const kicked = await clearDeviceRecords(db, subscription.id)

  return { ok: true, kicked }
})
