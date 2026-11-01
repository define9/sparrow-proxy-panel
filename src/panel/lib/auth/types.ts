export interface SessionUser {
  id: string
  email: string
  username: string
  role: string
  status: string
  balance: string
}

export interface Session {
  sessionId: string
  user: SessionUser
  permissions: string[]
}
