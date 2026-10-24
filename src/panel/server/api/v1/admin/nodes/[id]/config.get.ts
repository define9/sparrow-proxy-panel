import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { nodeCertificates } from '../../../../../../drizzle/schema'
import { getPathParam, loadNodeRow, renderCoreConfig } from '../../../../../utils/node'

/**
 * GET /api/v1/admin/nodes/:id/config
 *
 * 预览该节点的内核配置（渲染器是纯函数，此处只负责取数 + 调用）。
 *
 * - `?core=sing-box`（默认）或 `?core=xray`
 * - 用户规则（`CoreUserRule[]`）由「配置下发」链路填充，本接口暂以空规则预览入站结构
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_READ)

  const id = getPathParam(event, 'id')
  const query = getQuery(event)
  const core = query.core === 'xray' ? 'xray' : 'sing-box'

  const row = await loadNodeRow(id)

  const db = useDb()

  const certificates = row.certificateId
    ? await db.select().from(nodeCertificates).where(eq(nodeCertificates.id, row.certificateId))
    : []

  const config = renderCoreConfig(core, row, [], certificates.map(item => ({
    id: item.id,
    name: item.name,
    cert: item.cert,
    key: item.key
  })))

  return {
    core,
    config
  }
})
