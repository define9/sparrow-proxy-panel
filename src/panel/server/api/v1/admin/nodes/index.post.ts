import { UpsertNodeSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { nodeCertificates, nodeGroups, nodeSecrets, nodes } from '../../../../../drizzle/schema'
import { toNodeDto } from '../../../../utils/node'
import { validateBody } from '../../../../utils/validate'

/**
 * POST /api/v1/admin/nodes
 *
 * 新建节点。
 *
 * 节点密钥（HMAC 签名用）在创建时一并生成，**只在服务端保存**，
 * 不随接口返回；密钥下发流程由 Agent 注册接口负责（见报告中的协调事项）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_WRITE)

  const body = await validateBody(event, UpsertNodeSchema)
  const db = useDb()

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
    .where(and(eq(nodes.host, body.host), eq(nodes.port, body.port)))
    .limit(1)

  if (duplicated) {
    throw createError({
      statusCode: 409,
      statusMessage: 'NODE_DUPLICATED',
      message: '已存在相同地址与端口的节点',
      data: { code: 'NODE_DUPLICATED', message: '已存在相同地址与端口的节点' }
    })
  }

  const [created] = await db
    .insert(nodes)
    .values({
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
      password: body.password ?? null,
      uuid: body.uuid ?? null,
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
      remark: body.remark ?? null
    })
    .returning()

  if (!created) {
    throw createError({
      statusCode: 500,
      statusMessage: 'INTERNAL_ERROR',
      message: '节点创建失败',
      data: { code: 'INTERNAL_ERROR', message: '节点创建失败' }
    })
  }

  // 节点密钥：一节点一密钥，与节点一对一
  await db.insert(nodeSecrets).values({
    nodeId: created.id,
    secret: randomBytes(32).toString('hex')
  })

  return toNodeDto(created, group.name)
})
