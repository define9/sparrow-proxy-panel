import { sql } from 'drizzle-orm'
import { db } from '../lib/db'
import {
  announcements,
  nodeGroups,
  nodeHeartbeats,
  nodes,
  orders,
  plans,
  roles,
  settings,
  subscriptions,
  users
} from '../lib/db/schema'
import { PERMISSIONS } from '@sparrow/contracts'
import { hashPassword } from '../lib/auth/password'

// 演示账号密码：刻意用可读字符串，方便本地登录
const ADMIN_PASSWORD = ['sparrow', '2026'].join('')
const DEMO_PASSWORD = ['lily', '2026'].join('')

const GB = 1024 ** 3
const day = 86_400_000

function daysFromNow(days: number) {
  return new Date(Date.now() + days * day)
}

async function main() {
  console.log('→ 清空演示数据')
  await db.execute(sql`
    truncate table
      subscriptions, subscription_node_groups, orders, payment_records, coupons,
      traffic_daily, traffic_daily_node, traffic_logs,
      node_heartbeats, agent_commands, agent_events, nodes, node_certificates, node_groups,
      plan_node_groups, plans, sessions, login_logs, audit_logs, personal_access_tokens,
      announcements, settings, roles, users, system_counters
    restart identity cascade
  `)

  console.log('→ 角色与用户')
  await db.insert(roles).values([
    { code: 'user', name: '普通用户', isSystem: true, permissions: [] },
    {
      code: 'admin',
      name: '管理员',
      isSystem: true,
      permissions: PERMISSIONS.filter((p) => p !== 'admin:plugin:delete')
    },
    { code: 'superadmin', name: '超级管理员', isSystem: true, permissions: ['*'] }
  ])

  const [admin] = await db
    .insert(users)
    .values({
      email: 'admin@example.com',
      username: 'admin',
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      roleCode: 'superadmin',
      status: 'active',
      balance: '128.00',
      lastLoginAt: new Date()
    })
    .returning()

  const [demo] = await db
    .insert(users)
    .values({
      email: 'lily@example.com',
      username: 'lily',
      passwordHash: await hashPassword(DEMO_PASSWORD),
      roleCode: 'user',
      status: 'active',
      balance: '20.00',
      lastLoginAt: daysFromNow(-1)
    })
    .returning()

  console.log('→ 商品')
  const planRows = await db
    .insert(plans)
    .values([
      {
        name: '轻量月付',
        slug: 'lite-monthly',
        description: '适合个人日常使用，3 台设备同时在线',
        type: 'traffic',
        price: '15.00',
        originalPrice: '25.00',
        trafficGb: 60,
        durationDays: 30,
        deviceLimit: 3,
        speedLimitMbps: 300,
        stock: null,
        soldCount: 1284,
        status: 'active',
        isHot: false,
        tags: ['入门'],
        sort: 3
      },
      {
        name: '标准月付',
        slug: 'standard-monthly',
        description: '主流选择，200 GB 流量，5 台设备',
        type: 'traffic',
        price: '30.00',
        originalPrice: '45.00',
        trafficGb: 200,
        durationDays: 30,
        deviceLimit: 5,
        speedLimitMbps: 0,
        stock: 500,
        soldCount: 3921,
        status: 'active',
        isHot: true,
        tags: ['热销', '推荐'],
        sort: 1
      },
      {
        name: '进阶季付',
        slug: 'pro-quarterly',
        description: '每季度重置流量，适合小团队',
        type: 'traffic',
        price: '78.00',
        originalPrice: '99.00',
        trafficGb: 600,
        durationDays: 90,
        deviceLimit: 8,
        speedLimitMbps: 0,
        stock: 200,
        soldCount: 742,
        status: 'active',
        isHot: false,
        tags: ['季付'],
        sort: 2
      },
      {
        name: '不限量年付',
        slug: 'unlimited-yearly',
        description: '不计量流量，限速 1 Gbps，10 台设备',
        type: 'time',
        price: '688.00',
        originalPrice: '888.00',
        trafficGb: 0,
        durationDays: 365,
        deviceLimit: 10,
        speedLimitMbps: 1000,
        stock: 50,
        soldCount: 96,
        status: 'active',
        isHot: false,
        tags: ['年付', '不限量'],
        sort: 4
      },
      {
        name: '体验 7 天',
        slug: 'trial-7d',
        description: '新用户专享，10 GB 流量',
        type: 'traffic',
        price: '1.00',
        originalPrice: null,
        trafficGb: 10,
        durationDays: 7,
        deviceLimit: 1,
        speedLimitMbps: 100,
        stock: 0,
        soldCount: 2048,
        status: 'inactive',
        isHot: false,
        tags: ['体验'],
        sort: 5
      }
    ])
    .returning()

  console.log('→ 节点组与节点')
  const groupRows = await db
    .insert(nodeGroups)
    .values([
      { name: 'Hong Kong', region: '香港', sort: 1, remark: 'BGP 优化，延迟 20-40ms' },
      { name: 'Japan', region: '日本', sort: 2, remark: 'IIJ 线路，晚高峰稳定' },
      { name: 'Singapore', region: '新加坡', sort: 3, remark: '中转落地，适合东南亚' }
    ])
    .returning()

  const nodeSeeds = [
    { name: 'hk-01', group: 0, protocol: 'vless', host: 'hk01.example.com', port: 443, network: 'grpc', tlsMode: 'reality', rate: '1.00', status: 'online', core: 'sing-box' },
    { name: 'hk-02', group: 0, protocol: 'trojan', host: 'hk02.example.com', port: 443, network: 'ws', tlsMode: 'tls', rate: '1.00', status: 'online', core: 'sing-box' },
    { name: 'jp-01', group: 1, protocol: 'hysteria2', host: 'jp01.example.com', port: 8443, network: 'quic', tlsMode: 'tls', rate: '1.20', status: 'online', core: 'sing-box' },
    { name: 'jp-02', group: 1, protocol: 'vless', host: 'jp02.example.com', port: 443, network: 'tcp', tlsMode: 'reality', rate: '1.20', status: 'offline', core: 'xray' },
    { name: 'sg-01', group: 2, protocol: 'vmess', host: 'sg01.example.com', port: 443, network: 'ws', tlsMode: 'tls', rate: '1.50', status: 'online', core: 'xray' },
    { name: 'sg-02', group: 2, protocol: 'shadowsocks', host: 'sg02.example.com', port: 8388, network: 'tcp', tlsMode: 'none', rate: '1.50', status: 'maintenance', core: 'sing-box' },
    { name: 'hk-03', group: 0, protocol: 'tuic', host: 'hk03.example.com', port: 443, network: 'quic', tlsMode: 'tls', rate: '1.00', status: 'online', core: 'sing-box' },
    { name: 'jp-03', group: 1, protocol: 'vless', host: 'jp03.example.com', port: 443, network: 'grpc', tlsMode: 'reality', rate: '1.20', status: 'online', core: 'sing-box' }
  ] as const

  const nodeRows = await db
    .insert(nodes)
    .values(
      nodeSeeds.map((seed, index) => ({
        name: seed.name,
        groupId: groupRows[seed.group].id,
        protocol: seed.protocol,
        host: seed.host,
        port: seed.port,
        network: seed.network,
        tlsMode: seed.tlsMode,
        trafficRate: seed.rate,
        status: seed.status,
        core: seed.core,
        agentVersion: '1.0.3',
        sort: index,
        lastSeenAt: seed.status === 'offline' ? daysFromNow(-1) : new Date()
      }))
    )
    .returning()

  await db.insert(nodeHeartbeats).values(
    nodeRows.map((node, index) => ({
      nodeId: node.id,
      status: node.status,
      cpu: String([18.4, 24.1, 12.7, 0, 9.2, 2.1, 6.8, 15.3][index]),
      memory: String([41.2, 52.8, 33.4, 0, 28.1, 19.6, 22.9, 37.5][index]),
      disk: String(20 + index * 2),
      onlineUsers: [183, 221, 96, 0, 58, 0, 34, 71][index],
      agentVersion: '1.0.3',
      coreVersion: '1.12.0'
    }))
  )

  console.log('→ 订单与订阅')
  const orderSeeds = [
    { plan: 1, status: 'paid', hours: 2, user: admin.id },
    { plan: 3, status: 'paid', hours: 20, user: admin.id },
    { plan: 0, status: 'paid', hours: 96, user: admin.id },
    { plan: 0, status: 'pending', hours: 1, user: demo.id },
    { plan: 2, status: 'paid', hours: 8, user: demo.id },
    { plan: 1, status: 'cancelled', hours: 26, user: demo.id },
    { plan: 2, status: 'refunded', hours: 72, user: demo.id },
    { plan: 0, status: 'expired', hours: 168, user: demo.id }
  ] as const

  const orderRows = await db
    .insert(orders)
    .values(
      orderSeeds.map((seed, index) => {
        const plan = planRows[seed.plan]
        return {
          orderNo: `SP${202611000 + index}`,
          userId: seed.user,
          planId: plan.id,
          amount: plan.price,
          status: seed.status,
          paymentMethod: seed.status === 'cancelled' ? null : 'epay',
          tradeNo: seed.status === 'paid' ? `T86${1000 + index}` : null,
          expiresAt: new Date(Date.now() - seed.hours * 3600_000 + 2 * 3600_000),
          paidAt: seed.status === 'paid' ? new Date(Date.now() - seed.hours * 3600_000) : null,
          createdAt: new Date(Date.now() - seed.hours * 3600_000)
        }
      })
    )
    .returning()

  await db.insert(subscriptions).values([
    {
      userId: admin.id,
      planId: planRows[1].id,
      orderId: orderRows[0].id,
      token: 'a1b2c3d4e5f60718',
      format: 'clash',
      status: 'active',
      deviceLimit: 5,
      speedLimitMbps: 0,
      trafficLimit: String(200 * GB),
      trafficUsed: String(Math.round(200 * GB * 0.41)),
      upload: String(Math.round(200 * GB * 0.41 * 0.28)),
      download: String(Math.round(200 * GB * 0.41 * 0.72)),
      expireAt: daysFromNow(21)
    },
    {
      userId: admin.id,
      planId: planRows[3].id,
      orderId: orderRows[1].id,
      token: 'b2c3d4e5f6071829',
      format: 'singbox',
      status: 'active',
      deviceLimit: 10,
      speedLimitMbps: 1000,
      trafficLimit: '0',
      trafficUsed: String(7 * GB),
      upload: String(2 * GB),
      download: String(5 * GB),
      expireAt: daysFromNow(318)
    },
    {
      userId: demo.id,
      planId: planRows[0].id,
      orderId: orderRows[2].id,
      token: 'c3d4e5f60718293a',
      format: 'v2ray',
      status: 'active',
      deviceLimit: 3,
      speedLimitMbps: 300,
      trafficLimit: String(60 * GB),
      trafficUsed: String(Math.round(60 * GB * 0.98)),
      upload: String(Math.round(60 * GB * 0.98 * 0.3)),
      download: String(Math.round(60 * GB * 0.98 * 0.7)),
      expireAt: daysFromNow(2)
    },
    {
      userId: demo.id,
      planId: planRows[2].id,
      orderId: orderRows[4].id,
      token: 'd4e5f60718293a4b',
      format: 'clash',
      status: 'expired',
      deviceLimit: 8,
      speedLimitMbps: 0,
      trafficLimit: String(600 * GB),
      trafficUsed: String(Math.round(600 * GB * 0.55)),
      upload: String(Math.round(600 * GB * 0.55 * 0.3)),
      download: String(Math.round(600 * GB * 0.55 * 0.7)),
      expireAt: daysFromNow(-3)
    }
  ])

  console.log('→ 公告与设置')
  await db.insert(announcements).values([
    {
      title: '新增东京 IIIJ 线路',
      content: 'jp-03 已上线，支持 VLESS + REALITY，晚高峰延迟更低。',
      level: 'info',
      publishedAt: daysFromNow(-1)
    },
    {
      title: 'jp-02 维护通知',
      content: '节点硬件升级，预计 2 小时内恢复，期间请切换其他节点。',
      level: 'warn',
      publishedAt: daysFromNow(-0.2)
    },
    {
      title: '订阅渲染速度优化',
      content: '订阅接口加入缓存，平均响应从 120ms 降到 40ms。',
      level: 'info',
      publishedAt: daysFromNow(-6)
    }
  ])

  await db.insert(settings).values([
    {
      key: 'site',
      value: JSON.stringify({
        name: 'Sparrow Panel',
        logo: '',
        announcement: '欢迎使用 Sparrow Panel 演示站，数据每日重置。',
        icp: ''
      })
    },
    {
      key: 'register',
      value: JSON.stringify({
        open: true,
        emailVerify: true,
        giftTrafficGb: 10,
        inviteRequired: false
      })
    },
    { key: 'payment', value: JSON.stringify({ epayEnabled: true, stripeEnabled: false }) },
    { key: 'mail', value: JSON.stringify({ host: '', port: 465, username: '', password: '' }) }
  ])

  console.log('✓ 种子完成')
  console.log(`  管理员 admin@example.com / ${ADMIN_PASSWORD}`)
  console.log(`  用户   lily@example.com / ${DEMO_PASSWORD}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
