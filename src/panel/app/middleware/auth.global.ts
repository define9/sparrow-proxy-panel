export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, can } = useAuth()

  const isProtected = to.path.startsWith('/dashboard') || to.path.startsWith('/admin')
  const isGuestPage = to.path === '/login' || to.path === '/register'

  if (!loggedIn.value && isProtected) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  if (loggedIn.value && isGuestPage) {
    return navigateTo('/dashboard')
  }

  if (loggedIn.value && to.path.startsWith('/admin') && !can('admin:dashboard:read')) {
    return navigateTo('/dashboard')
  }
})
