export function useAuth() {
  const { user, loggedIn, clear } = useUserSession()

  /** 权限判定：超级管理员通配 */
  const can = (permission?: string): boolean => {
    if (!permission) {
      return true
    }
    if (!user.value) {
      return false
    }
    if (user.value.permissions.includes('*')) {
      return true
    }
    return user.value.permissions.includes(permission)
  }

  const isAdmin = computed(() => can('admin:dashboard:read'))

  return {
    user,
    loggedIn,
    can,
    isAdmin,
    async logout() {
      await $fetch('/api/v1/auth/logout', { method: 'POST' })
      await clear()
      await navigateTo('/login')
    }
  }
}
