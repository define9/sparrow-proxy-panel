import { UpsertNodeSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { and, eq, ne } from 'drizzle-orm'
import { nodeCertificates, nodeGroups, nodes } from '../../../../../drizzle/schema'
import { getPathParam, loadNodeRow, toNodeDto } from '../../../../utils/node'
import { validateBody } from '../../../../utils/validate'

/**
 * PUT /api/v1/admin/nodes/:id
 *
 * 更新节点（全量 upsert）。
 *
 * 敏感字段的「不传即保留」语义：
 * - `password` / `uuid` 未提供（或为 null）时保留原值
 * - 传空字符串视为「清空」
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_WRITE)

  const id = getPathParam(event, 'id')
  const body = await validateBody(event, UpsertNodeSchema)
  const db = useDb()

  const current = await loadNodeRow(id)

  const [group] = await db
    .select({ id: nodeGroups.id, name: nodeGroups.name })
    .from(nodeGroups)
    .where(eq(nodeGroups.id, body.groupId))
    .limit(1)

  if (!group) {
    throw createError({
      statusCode: 422,
      statusMessage: 'NODE_GROUP_NOT_FOUND',
      message: '节点组不存在',
      data: { code: 'NODE_GROUP_NOT_FOUND', message: '节点组不存在' }
    })
  }

  if (body.certificateId) {
    const [certificate] = await db
      .select({ id: nodeCertificates.id })
      .from(nodeCertificates)
      .where(eq(nodeCertificates.id, body.certificateId))
      .limit(1)

    if (!certificate) {
      throw createError({
        statusCode: 422,
        statusMessage: 'NODE_CERT_NOT_FOUND',
        message: '证书不存在',
        data: { code: 'NODE_CERT_NOT_FOUND', message: '证书不存在' }
      })
    }
  }

  const [duplicated] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.host, body.host), eq(nodes.port, body.port), ne(nodes.id, id)))
    .limit(1)

  if (duplicated) {
    throw createError({
      statusCode: 409,
      statusMessage: 'NODE_DUPLICATED',
      message: '已存在相同地址与端口的节点',
      data: { code: 'NODE_DUPLICATED', message: '已存在相同地址与端口的节点' }
    })
  }

  const patch: Record<string, unknown> = {
    name: body.name,
    groupId: body.groupId,
    protocol: body.protocol,
    host: body.host,
    port: body.port,
    serverPort: body.serverPort ?? null,
    network: body.network,
    path: body.path ?? null,
    hostHeader: body.hostHeader ?? null,
    method: body.method ?? null,
    flow: body.flow ?? null,
    password: body.password ?? current.password,
    uuid: body.uuid ?? current.uuid,
    security: body.security ?? null,
    tlsMode: body.tlsMode,
    sni: body.sni ?? null,
    alpn: body.alpn,
    allowInsecure: body.allowInsecure,
    realityPublicKey: body.realityPublicKey ?? null,
    realityShortId: body.realityShortId ?? null,
    fingerprint: body.fingerprint ?? null,
    certificateId: body.certificateId ?? null,
    trafficRate: String(body.trafficRate),
    priority: body.priority,
    weight: body.weight,
    status: body.status,
    isRelay: body.isRelay,
    sort: body.sort,
    remark: body.remark ?? null,
    updatedAt: new Date()
  }

  await db.update(nodes).set(patch).where(eq(nodes.id, id))

  const updated = await loadNodeRow(id)

  return toNodeDto(updated, group.name)
})
