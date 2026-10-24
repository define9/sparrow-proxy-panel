# 导航、菜单与路由

## 1. 路由表

### 公开

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | 首页 | 商品、公告、节点状态概览 |
| `/login` | 登录 | |
| `/register` | 注册 | |
| `/forgot-password` | 找回密码 | |
| `/sub/{token}` | 订阅输出 | 纯文本接口（非 Vue 页面） |

### 用户端 `/dashboard`

| 路径 | 页面 | 权限 |
|---|---|---|
| `/dashboard` | 概览 | 登录 |
| `/dashboard/plans` | 商品列表 | 登录 |
| `/dashboard/plans/{id}` | 商品详情 | 登录 |
| `/dashboard/orders` | 订单列表 | 登录 |
| `/dashboard/orders/{orderNo}` | 订单详情 | 登录 + 本人 |
| `/dashboard/subscriptions` | 订阅管理 | 登录 |
| `/dashboard/subscriptions/{id}` | 订阅详情 | 登录 + 本人 |
| `/dashboard/traffic` | 流量统计 | 登录 |
| `/dashboard/settings` | 个人设置（Tab：资料 / 安全 / 通知 / 外观 / Token） | 登录 |

### 管理端 `/admin`

| 路径 | 页面 | 权限点 |
|---|---|---|
| `/admin` | 仪表盘 | `admin:dashboard:read` |
| `/admin/plans` | 商品管理 | `admin:plan:read` |
| `/admin/orders` | 订单管理 | `admin:order:read` |
| `/admin/subscriptions` | 订阅管理 | `admin:subscription:read` |
| `/admin/nodes` | 节点管理 | `admin:node:read` |
| `/admin/nodes/groups` | 节点组 | `admin:node:read` |
| `/admin/nodes/certificates` | 证书 | `admin:node:read` |
| `/admin/users` | 用户管理 | `admin:user:read` |
| `/admin/plugins` | 插件管理 | `admin:plugin:read` |
| `/admin/plugin-sources` | 三方源 | `admin:plugin:read` |
| `/admin/logs` | 日志（Tab：审计 / 登录 / 任务 / 节点事件） | `admin:log:read` |
| `/admin/coupons` | 优惠券 | `admin:coupon:read` |
| `/admin/settings` | 系统设置（Tab：站点 / 邮件 / 支付 / 公告 / 权限） | `admin:settings:read` |

命名规则：**目录用复数**（`plans` / `orders` / `nodes`），与 `app/pages` 的文件路由一致；详情用动态段。

## 2. 菜单数据模型

菜单是**数据**，不是硬编码的模板。它由「路由表 + 权限点 + i18n key」推导而来，保证三处永远一致。

```ts
// app/utils/navigation.ts
export interface NavItem {
  labelKey: string        // i18n key，如 'nav.plans'
  icon: string            // i-lucide-*
  to: string
  permission?: string     // 需要的权限点（无则所有人可见）
  badge?: string | number
  children?: NavItem[]
  type?: 'trigger'        // 有 children 时为触发器
  defaultOpen?: boolean
}
```

管理端菜单：

```ts
export const adminNav: NavItem[] = [
  { labelKey: 'nav.dashboard', icon: 'i-lucide-gauge', to: '/admin' },
  { labelKey: 'nav.plans',    icon: 'i-lucide-package', to: '/admin/plans', permission: 'admin:plan:read' },
  { labelKey: 'nav.orders',   icon: 'i-lucide-receipt', to: '/admin/orders', permission: 'admin:order:read' },
  { labelKey: 'nav.subscriptions', icon: 'i-lucide-rss', to: '/admin/subscriptions', permission: 'admin:subscription:read' },
  {
    labelKey: 'nav.nodes', icon: 'i-lucide-server', to: '/admin/nodes', permission: 'admin:node:read',
    type: 'trigger', defaultOpen: true,
    children: [
      { labelKey: 'nav.nodeList',   icon: 'i-lucide-list', to: '/admin/nodes' },
      { labelKey: 'nav.nodeGroups', icon: 'i-lucide-folder-tree', to: '/admin/nodes/groups' },
      { labelKey: 'nav.certificates', icon: 'i-lucide-shield-check', to: '/admin/nodes/certificates' }
    ]
  },
  { labelKey: 'nav.users',  icon: 'i-lucide-users', to: '/admin/users', permission: 'admin:user:read' },
  {
    labelKey: 'nav.plugins', icon: 'i-lucide-plug', to: '/admin/plugins', permission: 'admin:plugin:read',
    children: [
      { labelKey: 'nav.pluginList',   icon: 'i-lucide-list', to: '/admin/plugins' },
      { labelKey: 'nav.pluginSources', icon: 'i-lucide-cloud-download', to: '/admin/plugin-sources' }
    ]
  },
  { labelKey: 'nav.logs',    icon: 'i-lucide-scroll-text', to: '/admin/logs', permission: 'admin:log:read' },
  { labelKey: 'nav.settings', icon: 'i-lucide-settings', to: '/admin/settings', permission: 'admin:settings:read' }
]
```

## 3. 权限过滤

权限点来自 `packages/contracts`，服务端在会话里下发当前用户的权限集合：

```ts
// app/composables/useAuth.ts
export function useAuth() {
  const user = useState<UserInfo | null>('auth:user', () => null)
  const permissions = useState<string[]>('auth:permissions', () => [])

  const can = (perm?: string) => !perm || permissions.value.includes(perm) || permissions.value.includes('*')

  return { user, permissions, can }
}
```

```vue
<!-- layouts/admin.vue -->
<script setup lang="ts">
const { can } = useAuth()
const navItems = computed(() => filterNav(adminNav, can))
</script>

<template>
  <UNavigationMenu :items="navItems" orientation="vertical" :collapsed="collapsed" tooltip popover />
</template>
```

`filterNav` 规则：自身无权限则整支子树移除；父节点无权限但子节点有权限时，父节点保留为纯分组。

后端是唯一权威：即使前端菜单显示了，接口仍会 `requirePermission` 校验（见 [api-design](../architecture/api-design.md#2-鉴权模型)）。

## 4. 命令面板（UDashboardSearch）

侧边栏顶部放 `UDashboardSearchButton`，对应 `UDashboardSearch`（Nuxt UI 原生命令面板）。分组内容：

```ts
const searchGroups = computed(() => [
  {
    id: 'pages',
    label: t('search.pages'),
    items: visibleNav.map(item => ({
      label: t(item.labelKey),
      icon: item.icon,
      onSelect: () => navigateTo(item.to)
    }))
  },
  {
    id: 'actions',
    label: t('search.actions'),
    items: [
      { label: t('action.createNode'), icon: 'i-lucide-plus', onSelect: () => navigateTo('/admin/nodes?create=1') },
      { label: t('action.createPlan'), icon: 'i-lucide-plus', onSelect: () => navigateTo('/admin/plans?create=1') }
    ]
  },
  {
    id: 'users',
    label: t('search.users'),
    items: userShortcuts.map(u => ({
      label: u.email,
      icon: 'i-lucide-user',
      onSelect: () => navigateTo(`/admin/users?q=${u.email}`)
    }))
  }
])
```

权限过滤同样适用：`visibleNav` 走 `filterNav`。

## 5. 面包屑与标签页

- 面包屑用 `UBreadcrumb`，由路由 meta 提供：

```ts
definePageMeta({
  breadcrumb: [{ label: 'admin.nodes.title', icon: 'i-lucide-server', to: '/admin/nodes' }]
})
```

- 同级子页面（订单详情、订阅详情）用 `UTabs` 或直接单页，不做多层嵌套路由（后台系统保持 URL 浅）

## 6. 快捷键

用 `@vueuse/nuxt` 的 `defineShortcuts`（Nuxt UI 组件也用它）：

```ts
// app/composables/useDashboard.ts（沿用模板写法）
export const useDashboard = createSharedComposable(() => {
  const router = useRouter()

  defineShortcuts({
    'g-d': () => router.push('/admin'),
    'g-n': () => router.push('/admin/nodes'),
    'g-u': () => router.push('/admin/users'),
    'g-p': () => router.push('/admin/plans'),
    'g-o': () => router.push('/admin/orders'),
    'meta_k': () => searchRef?.open(),      // 与命令面板联动
    'n': () => notificationsOpen.value = !notificationsOpen.value
  })
})
```

菜单项用 `kbds` 展示提示，并用 `extractShortcuts` 自动注册：

```ts
const items = [{ label: t('action.create'), kbds: ['meta', 'n'], onSelect: () => open() }]
defineShortcuts(extractShortcuts(items))
```

## 7. 顶部/底部用户菜单

`UDashboardSidebar` 的 `#footer` 放 `UserMenu`（模板已有结构），内容：

| 项 | 行为 |
|---|---|
| 头像 + 用户名 + 角色 | 跳转个人设置 |
| 主题 | `UColorModeSelect`（light / dark / system） |
| 语言 | `ULocaleSelect` |
| 个人设置 | `/dashboard/settings` |
| 管理后台 | `/admin`（仅管理员可见） |
| 退出登录 | `POST /api/v1/auth/logout` → 跳登录页 |

## 8. 移动端

- `UDashboardSidebar` 移动端默认 `mode="slideover"`，由 `UDashboardNavbar` 的内置按钮唤起
- 侧边栏折叠状态在桌面端持久化（`UDashboardGroup storage="cookie"`）
- 表格在窄屏用 `UTable` 自带的响应式（隐藏次要列）或切换为卡片列表（`<UScrollArea>` + 卡片）
- 表格工具栏 `UDashboardToolbar` 在窄屏纵向排列（组件默认行为，不额外写断点类）

## 9. 导航守卫

```ts
// app/middleware/auth.global.ts
export default defineNuxtRouteMiddleware((to) => {
  const { user, can } = useAuth()

  if (!user.value) {
    // 公开页放行；其余跳登录并带 redirect
    if (to.path.startsWith('/dashboard') || to.path.startsWith('/admin')) {
      return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
    }
    return
  }

  if (to.path.startsWith('/admin') && !can('admin:dashboard:read')) {
    return navigateTo('/dashboard')
  }
})
```

服务端渲染时用户信息由 `app/middleware` 或 `app/plugins/session.server.ts` 注入 `useState('auth:user')`，避免客户端二次请求。

## 10. 菜单与权限的单一来源

| 内容 | 位置 | 谁生成 |
|---|---|---|
| 路由 | `app/pages/**` | 文件路由 |
| 菜单 | `app/utils/navigation.ts` | 手工维护（带权限点与 i18n key） |
| 权限点 | `packages/contracts/src/permissions.ts` | 手工维护 |
| 后端校验 | `server/api/admin/**` | `requirePermission(...)` |

三处通过**相同的权限点字符串**关联；CI 提供脚本校验：
- 菜单里用到的权限点必须在 `permissions.ts` 中存在
- `requirePermission` 用到的权限点必须存在
- `permissions.ts` 中定义的权限点应至少被一处使用（避免死代码）
