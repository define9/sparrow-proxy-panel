import type { Node, Order, Plan, Subscription } from '@sparrow/contracts'
import { iso } from './util'

/**
 * 全站共享的演示数据（商品、节点、订单、订阅、概览指标、公告）。
 * 只读：页面里直接 import，不要修改这个文件。
 */

export const plans: Plan[] = [
  {
    id: 'plan_001',
    name: '轻量月付',
    slug: 'lite-monthly',
    description: '适合个人日常使用，10 台设备同时在线',
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
    id: 'plan_002',
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
    id: 'plan_003',
    name: '进阶季付',
    slug: 'pro-quarterly',
    description: '每季度重置流量，适合团队小规模使用',
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
    id: 'plan_004',
    name: '不限量年付',
    slug: 'unlimited-yearly',
    description: '不计量流量，仅限速 1 Gbps，10 台设备',
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
    id: 'plan_005',
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
]

export const nodeGroups = [
  { id: 'grp_1', name: 'Hong Kong', region: '香港', sort: 1, remark: 'BGP 优化，延迟 20-40ms' },
  { id: 'grp_2', name: 'Japan', region: '日本', sort: 2, remark: 'IIJ 线路，晚高峰稳定' },
  { id: 'grp_3', name: 'Singapore', region: '新加坡', sort: 3, remark: '中转落地，适合东南亚' }
]

export const nodes: Node[] = [
  {
    id: 'node_01',
    name: 'hk-01',
    groupId: 'grp_1',
    groupName: 'Hong Kong',
    protocol: 'vless',
    host: 'hk01.example.com',
    port: 443,
    network: 'grpc',
    tlsMode: 'reality',
    rate: 1,
    status: 'online',
    onlineUsers: 183,
    cpu: 18.4,
    memory: 41.2,
    agentVersion: '1.0.3',
    core: 'sing-box',
    lastSeenAt: iso(0, 0),
    createdAt: iso(-180)
  },
  {
    id: 'node_02',
    name: 'hk-02',
    groupId: 'grp_1',
    groupName: 'Hong Kong',
    protocol: 'trojan',
    host: 'hk02.example.com',
    port: 443,
    network: 'ws',
    tlsMode: 'tls',
    rate: 1,
    status: 'online',
    onlineUsers: 221,
    cpu: 24.1,
    memory: 52.8,
    agentVersion: '1.0.3',
    core: 'sing-box',
    lastSeenAt: iso(0, 0),
    createdAt: iso(-160)
  },
  {
    id: 'node_03',
    name: 'jp-01',
    groupId: 'grp_2',
    groupName: 'Japan',
    protocol: 'hysteria2',
    host: 'jp01.example.com',
    port: 8443,
    network: 'quic',
    tlsMode: 'tls',
    rate: 1.2,
    status: 'online',
    onlineUsers: 96,
    cpu: 12.7,
    memory: 33.4,
    agentVersion: '1.0.2',
    core: 'sing-box',
    lastSeenAt: iso(0, 0),
    createdAt: iso(-120)
  },
  {
    id: 'node_04',
    name: 'jp-02',
    groupId: 'grp_2',
    groupName: 'Japan',
    protocol: 'vless',
    host: 'jp02.example.com',
    port: 443,
    network: 'tcp',
    tlsMode: 'reality',
    rate: 1.2,
    status: 'offline',
    onlineUsers: 0,
    cpu: 0,
    memory: 0,
    agentVersion: '1.0.1',
    core: 'xray',
    lastSeenAt: iso(-1, -3),
    createdAt: iso(-110)
  },
  {
    id: 'node_05',
    name: 'sg-01',
    groupId: 'grp_3',
    groupName: 'Singapore',
    protocol: 'vmess',
    host: 'sg01.example.com',
    port: 443,
    network: 'ws',
    tlsMode: 'tls',
    rate: 1.5,
    status: 'online',
    onlineUsers: 58,
    cpu: 9.2,
    memory: 28.1,
    agentVersion: '1.0.3',
    core: 'xray',
    lastSeenAt: iso(0, 0),
    createdAt: iso(-90)
  },
  {
    id: 'node_06',
    name: 'sg-02',
    groupId: 'grp_3',
    groupName: 'Singapore',
    protocol: 'shadowsocks',
    host: 'sg02.example.com',
    port: 8388,
    network: 'tcp',
    tlsMode: 'none',
    rate: 1.5,
    status: 'maintenance',
    onlineUsers: 0,
    cpu: 2.1,
    memory: 19.6,
    agentVersion: '1.0.3',
    core: 'sing-box',
    lastSeenAt: iso(0, -1),
    createdAt: iso(-88)
  },
  {
    id: 'node_07',
    name: 'hk-03',
    groupId: 'grp_1',
    groupName: 'Hong Kong',
    protocol: 'tuic',
    host: 'hk03.example.com',
    port: 443,
    network: 'quic',
    tlsMode: 'tls',
    rate: 1,
    status: 'online',
    onlineUsers: 34,
    cpu: 6.8,
    memory: 22.9,
    agentVersion: '1.0.3',
    core: 'sing-box',
    lastSeenAt: iso(0, 0),
    createdAt: iso(-40)
  },
  {
    id: 'node_08',
    name: 'jp-03',
    groupId: 'grp_2',
    groupName: 'Japan',
    protocol: 'vless',
    host: 'jp03.example.com',
    port: 443,
    network: 'grpc',
    tlsMode: 'reality',
    rate: 1.2,
    status: 'online',
    onlineUsers: 71,
    cpu: 15.3,
    memory: 37.5,
    agentVersion: '1.0.3',
    core: 'sing-box',
    lastSeenAt: iso(0, 0),
    createdAt: iso(-20)
  }
]

const orderSeeds: Array<Pick<Order, 'status' | 'paymentMethod'> & { planIndex: number; hoursAgo: number }> = [
  { status: 'paid', paymentMethod: 'epay', planIndex: 1, hoursAgo: 1 },
  { status: 'pending', paymentMethod: 'epay', planIndex: 0, hoursAgo: 2 },
  { status: 'paid', paymentMethod: 'stripe', planIndex: 2, hoursAgo: 6 },
  { status: 'paid', paymentMethod: 'epay', planIndex: 1, hoursAgo: 20 },
  { status: 'cancelled', paymentMethod: null, planIndex: 3, hoursAgo: 26 },
  { status: 'expired', paymentMethod: 'epay', planIndex: 0, hoursAgo: 30 },
  { status: 'paid', paymentMethod: 'epay', planIndex: 3, hoursAgo: 48 },
  { status: 'refunded', paymentMethod: 'stripe', planIndex: 2, hoursAgo: 72 },
  { status: 'paid', paymentMethod: 'epay', planIndex: 1, hoursAgo: 96 },
  { status: 'paid', paymentMethod: 'epay', planIndex: 0, hoursAgo: 120 },
  { status: 'expired', paymentMethod: 'epay', planIndex: 2, hoursAgo: 168 },
  { status: 'paid', paymentMethod: 'epay', planIndex: 3, hoursAgo: 240 }
]

export const orders: Order[] = orderSeeds.map((seed, index) => {
  const plan = plans[seed.planIndex]
  const createdAt = iso(0, -seed.hoursAgo)
  return {
    id: `ord_${String(index + 1).padStart(6, '0')}`,
    orderNo: `SP${(20261100 + index).toString()}`,
    userId: `usr_${String((index % 6) + 1).padStart(8, '0')}`,
    userEmail: ['admin@example.com', 'lily@example.com', 'kite@example.com', 'mori@example.com', 'zeus@example.com', 'nana@example.com'][index % 6],
    planId: plan.id,
    planName: plan.name,
    amount: plan.price,
    discount: index % 4 === 0 ? '5.00' : '0.00',
    status: seed.status,
    paymentMethod: seed.paymentMethod,
    tradeNo: seed.status === 'paid' ? `T${8_600_000 + index * 37}` : null,
    expiresAt: iso(0, -seed.hoursAgo + 2),
    paidAt: seed.status === 'paid' ? iso(0, -seed.hoursAgo + 0.05) : null,
    createdAt
  }
})

const subsSeeds = [
  { planIndex: 1, usedRatio: 0.41, daysLeft: 21, status: 'active' as const, format: 'clash' as const },
  { planIndex: 3, usedRatio: 0.07, daysLeft: 318, status: 'active' as const, format: 'singbox' as const },
  { planIndex: 0, usedRatio: 0.98, daysLeft: 2, status: 'active' as const, format: 'v2ray' as const },
  { planIndex: 2, usedRatio: 0.55, daysLeft: -3, status: 'expired' as const, format: 'clash' as const },
  { planIndex: 1, usedRatio: 0.12, daysLeft: 44, status: 'paused' as const, format: 'clash' as const },
  { planIndex: 0, usedRatio: 0.33, daysLeft: 9, status: 'active' as const, format: 'v2ray' as const }
]

export const subscriptions: Subscription[] = subsSeeds.map((seed, index) => {
  const plan = plans[seed.planIndex]
  const limit = plan.trafficGb * 1024 ** 3
  const used = Math.round(limit * seed.usedRatio)
  return {
    id: `sub_${String(index + 1).padStart(4, '0')}`,
    token: `8f${index}4c1e-5b7a-4d2f-9c31-${(index + 1).toString().padStart(8, '0')}`,
    userId: `usr_${String((index % 6) + 1).padStart(8, '0')}`,
    userEmail: ['admin@example.com', 'lily@example.com', 'kite@example.com', 'mori@example.com', 'zeus@example.com', 'nana@example.com'][index % 6],
    planId: plan.id,
    planName: plan.name,
    status: seed.status,
    format: seed.format,
    deviceLimit: plan.deviceLimit,
    speedLimitMbps: plan.speedLimitMbps,
    trafficLimit: limit,
    trafficUsed: used,
    upload: Math.round(used * 0.28),
    download: Math.round(used * 0.72),
    expireAt: iso(seed.daysLeft),
    createdAt: iso(seed.daysLeft - plan.durationDays)
  }
})

export const overviewStats = {
  users: { total: 12874, newToday: 43, trend: '+12.4%' },
  revenue: { today: '3286.50', month: '94218.00', trend: '+8.2%' },
  orders: { today: 186, pending: 12, trend: '+3.1%' },
  subscriptions: { active: 4218, expiring: 96, trend: '+1.4%' },
  nodes: { total: nodes.length, online: nodes.filter((n) => n.status === 'online').length },
  traffic: { today: 4_812_334_223_616, month: 96_218_774_339_584 }
}

export const announcements = [
  {
    id: 'ann_1',
    level: 'info' as const,
    title: '新增东京 IIIJ 线路',
    content: 'jp-03 已上线，支持 VLESS + REALITY，晚高峰延迟更低。',
    publishedAt: iso(-1)
  },
  {
    id: 'ann_2',
    level: 'warning' as const,
    title: 'jp-02 维护通知',
    content: '节点硬件升级，预计 2 小时内恢复，期间请切换其他节点。',
    publishedAt: iso(0, -4)
  },
  {
    id: 'ann_3',
    level: 'info' as const,
    title: '订阅渲染速度优化',
    content: '订阅接口加入缓存，平均响应从 120ms 降到 40ms。',
    publishedAt: iso(-6)
  }
]

/** 近 30 天流量曲线（字节） */
export const trafficSeries = Array.from({ length: 30 }, (_, index) => {
  const day = 29 - index
  const base = 180 * 1024 ** 3
  const wave = Math.sin(index / 3.2) * 45 * 1024 ** 3
  const spike = index % 9 === 0 ? 90 * 1024 ** 3 : 0
  const total = Math.round(base + wave + spike)
  return {
    date: iso(-day).slice(0, 10),
    upload: Math.round(total * 0.3),
    download: Math.round(total * 0.7),
    total
  }
})
