# 导航、菜单与路由

## 1. 路由表

### 公开

| 路径 | 页面 |
|---|---|
| `/` | 首页：商品、公告、节点状态概览 |
| `/login` | 登录 |
| `/register` | 注册 |
| `/forgot-password` | 找回密码 |
| `/sub/{token}` | 订阅输出（纯文本，route handler，不是页面） |

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
| `/dashboard/settings` | 个人设置（Tabs：资料 / 安全 / 通知 / 外观 / Token） | 登录 |

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
| `/admin/logs` | 日志（Tabs：审计 / 登录 / 任务 / 节点事件） | `admin:log:read` |
| `/admin/coupons` | 优惠券 | `admin:coupon:read` |
| `/admin/settings` | 系统设置（Tabs：站点 / 邮件 / 支付 / 公告 / 权限） | `admin:settings:read` |

命名规则：**目录用复数**（`plans` / `orders` / `nodes`），与 `app/` 目录一致；详情用动态段。URL 层级保持浅，不做 `/admin/nodes/groups/1/ports` 这种深嵌。

## 2. 菜单是数据

菜单由「路由表 + 权限点 + i18n key」推导，集中在一个文件，避免三处各写一遍。

```ts
// lib/navigation.ts
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  labelKey: string          // i18n key，如 'nav.plans'
  icon: LucideIcon
  href: string
  permission?: string       // 无值则所有人可见
  badge?: string | number
  items?: NavItem[]         // 有子项即为可展开分组
}

export const adminNav: NavItem[] = [
  { labelKey: 'nav.dashboard', icon: Gauge, href: '/admin' },
  { labelKey: 'nav.plans', icon: Package, href: '/admin/plans', permission: 'admin:plan:read' },
  { labelKey: 'nav.orders', icon: Receipt, href: '/admin/orders', permission: 'admin:order:read' },
  { labelKey: 'nav.subscriptions', icon: Rss, href: '/admin/subscriptions', permission: 'admin:subscription:read' },
  {
    labelKey: 'nav.nodes', icon: Server, href: '/admin/nodes', permission: 'admin:node:read',
    items: [
      { labelKey: 'nav.nodeList', icon: List, href: '/admin/nodes' },
      { labelKey: 'nav.nodeGroups', icon: FolderTree, href: '/admin/nodes/groups' },
      { labelKey: 'nav.certificates', icon: ShieldCheck, href: '/admin/nodes/certificates' }
    ]
  },
  { labelKey: 'nav.users', icon: Users, href: '/admin/users', permission: 'admin:user:read' },
  {
    labelKey: 'nav.plugins', icon: Plug, href: '/admin/plugins', permission: 'admin:plugin:read',
    items: [
      { labelKey: 'nav.pluginList', icon: List, href: '/admin/plugins' },
      { labelKey: 'nav.pluginSources', icon: CloudDownload, href: '/admin/plugin-sources' }
    ]
  },
  { labelKey: 'nav.logs', icon: ScrollText, href: '/admin/logs', permission: 'admin:log:read' },
  { labelKey: 'nav.settings', icon: Settings, href: '/admin/settings', permission: 'admin:settings:read' }
]
```

图标用组件引用而非字符串（`lucide-react` 的 tree-shaking 依赖静态 import）。

## 3. 权限过滤

权限点来自 `packages/contracts`，layout 从会话取到后下传，菜单在渲染前过滤：

```ts
// lib/auth/permissions.ts
export function hasPermission(granted: string[], perm?: string) {
  return !perm || granted.includes('*') || granted.includes(perm)
}

export function filterNav(items: NavItem[], granted: string[]): NavItem[] {
  return items
    .map(item => ({ ...item, items: item.items ? filterNav(item.items, granted) : undefined }))
    .filter(item => {
      if (!hasPermission(granted, item.permission)) return false
      // 父节点无子项残留（children 全被过滤掉且自身是分组）→ 保留为叶子
      return true
    })
}
```

规则：自身无权限则整支移除；父节点无权限但子节点有权限时，父节点保留为纯分组（不带 `href`）。

```tsx
// components/layout/app-sidebar.tsx
const visible = filterNav(nav, permissions)

<SidebarGroup>
  {visible.map(item => (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={t(item.labelKey)}>
        <Link href={item.href}><item.icon className="size-4" /><span>{t(item.labelKey)}</span></Link>
      </SidebarMenuButton>
      {item.items && <SidebarMenuSub>{/* … */}</SidebarMenuSub>}
    </SidebarMenuItem>
  ))}
</SidebarGroup>
```

**后端是唯一权威**：菜单藏起来不代表接口安全，每个 route handler 仍走 `requirePermission`（见 [api-design §2](../architecture/api-design.md#2-鉴权模型)）。

## 4. 路由守卫

分三层，各管一件事：

```ts
// middleware.ts —— 只做快速重定向，不查库
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('spx_session')
  const isPrivate = /^\/(dashboard|admin)(\/|$)/.test(req.nextUrl.pathname)

  if (isPrivate && !hasSession) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
}

export const config = { matcher: ['/dashboard/:path*', '/admin/:path*'] }
```

```ts
// lib/auth/guard.ts —— 权威判断，在 layout 里调用
export async function requirePermission(perm: string) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!hasPermission(session.permissions, perm)) forbidden()   // 或 redirect('/dashboard')
  return session
}
```

- middleware 只读 cookie，**不查数据库**：Next middleware 跑在 edge runtime，`pg` 用不了
- layout 的 `requireSession()` 才是真相；页面里的对象级权限（本人订单/订阅）由服务层校验
- 已登录访问 `/login` 由 `(auth)/layout.tsx` 反查并跳 `/dashboard`

## 5. 命令面板

侧边栏顶部放搜索按钮（视觉上是 `SidebarMenuButton`，实际触发 `CommandDialog`），`⌘K` 打开：

```tsx
const groups = [
  { id: 'pages', heading: t('search.pages'), items: visibleNav.map(i => ({ label: t(i.labelKey), icon: i.icon, onSelect: () => router.push(i.href) })) },
  { id: 'actions', heading: t('search.actions'), items: [
    { label: t('action.createNode'), icon: Plus, onSelect: () => router.push('/admin/nodes?create=1') },
    { label: t('action.createPlan'), icon: Plus, onSelect: () => router.push('/admin/plans?create=1') }
  ] }
]
```

- `CommandDialog`（shadcn）= Radix Dialog + cmdk，键盘上下选择与回车开箱可用
- 分组用 `CommandGroup`，图标用 `CommandItem` 里的 children
- 过滤同样走 `filterNav`；不要为命令面板单独维护一份菜单

## 6. 快捷键

用 `react-hotkeys-hook`，集中在一个 hook 里注册：

```ts
// hooks/use-shortcuts.ts
useHotkeys('mod+k', () => setCommandOpen(v => !v))
useHotkeys('g>d', () => router.push('/admin'))
useHotkeys('g>n', () => router.push('/admin/nodes'))
useHotkeys('g>u', () => router.push('/admin/users'))
```

- 默认 `enableOnFormTags: false`，避免在输入框里打字触发跳转
- `g>d` 是 `react-hotkeys-hook` 的顺序键语法，不用自己维护计时器
- 菜单项上的快捷键提示用 `<kbd>` 展示（`SidebarMenuButton` 的 trailing 位置）

## 7. 用户菜单（侧边栏底部）

`NavUser` 组件放在 `SidebarFooter`，内容是 `DropdownMenu`：

| 项 | 行为 |
|---|---|
| 头像 + 用户名 + 角色 | 跳个人设置 |
| 主题 | 子菜单 light / dark / system（`next-themes`） |
| 语言 | 子菜单 简体中文 / English（写 cookie + `router.refresh()`） |
| 个人设置 | `/dashboard/settings` |
| 管理后台 | `/admin`（仅管理员可见） |
| 退出登录 | `POST /api/v1/auth/logout` → 跳 `/login` |

## 8. 移动端

- 侧边栏在 `<768px` 自动变抽屉，由 `SidebarTrigger` 唤起（`SidebarProvider` 内置，不要自己写 Sheet）
- 折叠状态持久化到 cookie，由 `SidebarProvider` 负责
- 表格在窄屏隐藏次要列（`ColumnDef.meta.hiddenOnMobile`），或切换成卡片列表
- 页面头部操作按钮收敛进 `DropdownMenu`，不要挤成一行

## 9. 单一来源

| 内容 | 位置 | 谁生成 |
|---|---|---|
| 路由 | `app/**/page.tsx` | 文件系统 |
| 菜单 | `lib/navigation.ts` | 手工维护（带权限点与 i18n key） |
| 权限点 | `packages/contracts/src/permissions.ts` | 手工维护 |
| 后端校验 | `app/api/v1/admin/**/route.ts` | `requirePermission(...)` |

四处通过**相同的权限点字符串**关联，CI 提供脚本校验：

- 菜单里用到的权限点必须在 `permissions.ts` 中存在
- `requirePermission` 用到的权限点必须存在
- `permissions.ts` 中定义的权限点应至少被一处使用（避免死代码）
