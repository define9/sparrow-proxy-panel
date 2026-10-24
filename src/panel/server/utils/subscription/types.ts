import type { Node, Subscription } from '@sparrow/contracts'

/**
 * 渲染器输入类型。
 *
 * 全部是 `@sparrow/contracts` 的字段子集：渲染器只依赖它需要的字段，
 * 既保证契约优先，也方便单测直接构造最小输入。
 */

/** 渲染器需要的订阅字段（内部主键 id 只用于定位，不会出现在输出里） */
export type RenderSubscription = Pick<
  Subscription,
  | 'id'
  | 'token'
  | 'format'
  | 'status'
  | 'deviceLimit'
  | 'speedLimitMbps'
  | 'trafficLimit'
  | 'trafficUsed'
  | 'upload'
  | 'download'
  | 'expireAt'
  | 'resetAt'
  | 'createdAt'
>

/** 渲染器需要的节点字段 */
export type RenderNode = Pick<
  Node,
  | 'name'
  | 'protocol'
  | 'host'
  | 'port'
  | 'network'
  | 'path'
  | 'hostHeader'
  | 'method'
  | 'flow'
  | 'password'
  | 'uuid'
  | 'security'
  | 'tlsMode'
  | 'sni'
  | 'alpn'
  | 'allowInsecure'
  | 'realityPublicKey'
  | 'realityShortId'
  | 'fingerprint'
  | 'trafficRate'
  | 'priority'
  | 'weight'
>
