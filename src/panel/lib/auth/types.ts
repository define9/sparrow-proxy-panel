export interface SessionUser {
  id: string
  email: string
  username: string
  role: string
  status: string
  balance: string
  /** 预留：自填/上传头像地址；为空时前端按用户名/邮箱本地生成 */
  avatarUrl?: string | null
}

export interface Session {
  sessionId: string
  user: SessionUser
  permissions: string[]
}
