import type { User } from '@sparrow/contracts'

export interface Session {
  user: User
  permissions: string[]
}

/**
 * 原型阶段的会话：固定为超管，直接给全量权限。
 * TODO: 接入真实会话（sessions 表 + cookie）后删除。
 */
export async function getSession(): Promise<Session> {
  return {
    user: {
      id: 'usr_00000001',
      email: 'admin@example.com',
      username: 'admin',
      role: 'superadmin',
      status: 'active',
      balance: '128.00',
      trafficLimit: 0,
      trafficUsed: 0,
      twofaEnabled: false,
      telegramId: null,
      lastLoginAt: new Date().toISOString(),
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    permissions: ['*']
  }
}
