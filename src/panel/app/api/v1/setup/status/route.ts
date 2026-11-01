import { ok, route } from '@/lib/api/response'
import { getSetupStatus } from '@/lib/services/setup'

/** 初始化状态：登录页与 /setup 都用它决定往哪跳 */
export const GET = route(async () => ok(await getSetupStatus()))
