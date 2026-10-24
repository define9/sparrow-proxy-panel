declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    username: string
    role: string
    permissions: string[]
  }
}

export {}
