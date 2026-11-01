# 前端架构

## 1. 目录结构

```
src/panel/
├── app/
│   ├── layout.tsx                 # <html> + ThemeProvider + NextIntlClientProvider + Toaster
│   ├── globals.css                # Tailwind 4 + shadcn CSS 变量（见 design-system）
│   ├── (marketing)/page.tsx       # 首页
│   ├── (auth)/login|register|forgot-password/page.tsx
│   ├── (user)/
│   │   ├── layout.tsx             # Sidebar + Header（用户端）
│   │   └── dashboard/{page,plans,orders,subscriptions,traffic,settings}
│   ├── (admin)/
│   │   ├── layout.tsx             # 同上，菜单按权限
│   │   └── admin/{page,plans,orders,subscriptions,nodes,users,plugins,logs,settings}
│   ├── api/v1/**/route.ts         # REST 接口
│   └── sub/[token]/route.ts       # 订阅输出（纯文本）
├── components/
│   ├── ui/                        # shadcn 生成物（可改，但改动需同步 design-system）
│   ├── common/                    # DataTable / StateBadge / QuotaBar / CopyButton / EmptyState
│   ├── layout/                    # AppSidebar / NavUser / CommandPalette / Breadcrumbs
│   └── plan|order|subscription|node|user|plugin|log/
├── lib/
│   ├── db/                        # Drizzle client + schema
│   ├── services/                  # 服务层（页面与 route handler 共用，唯一业务入口）
│   ├── api/                       # 客户端 fetch 封装 + query keys
│   ├── auth/                      # auth.config、permissions、requirePermission
│   ├── quota.ts · crypto.ts · rate-limit.ts
│   ├── subscription/ · node/ · plugin-host/ · jobs/
│   └── navigation.ts              # 菜单数据模型（见 navigation.md）
├── hooks/                         # use-permissions / use-shortcuts / use-formatters
├── messages/{zh-CN,en}.json
├── middleware.ts                  # 只做"无 cookie 快速重定向"
└── drizzle/                       # 迁移文件
```

**`components/ui` 是项目自己的代码**（shadcn 的 copy-in 思路），可以改；但任何改动都要落在 [design-system](design-system.md) 的约定里，否则 CLI 重新生成时会冲突。业务定制优先写在 `components/common/` 的 wrapper 里。

## 2. 布局与路由

| 路由组 | layout | 鉴权 | 说明 |
|---|---|---|---|
| `(marketing)` | 根 layout | 公开 | 首页、商品介绍、公告 |
| `(auth)` | 居中单栏 | 游客 | 已登录访问自动跳 `/dashboard` |
| `(user)` | Sidebar + Header | 登录 | 用户中心 |
| `(admin)` | 同上，菜单不同 | 权限点 | 管理后台 |
| `app/sub/[token]/route.ts` | — | token | 订阅输出（非页面） |

约定：

- **鉴权权威判断在 layout**：`const session = await requireSession()`。数据库会话查库，edge runtime 跑不了，所以不在 middleware 里做
- `middleware.ts` 只做快速路径：没有 session cookie 且访问 `/(user|admin)` → 跳登录并带 `?next=`；真正的越权判断交给 layout 与 route handler
- 用户端与管理端 **layout 分离**，菜单与守卫独立，避免越权页面泄露结构

### 渲染策略：后台不 SSR

| 页面 | 渲染方式 | 数据来源 |
|---|---|---|
| `(user)` / `(admin)` 全部页面 | **CSR**（页面是 client component） | 客户端 TanStack Query → `/api/v1` |
| `(marketing)` 首页 / 商品 / 公告 | RSC 或 ISR（`revalidate = 60`），只为 SEO | 服务层直连 |
| `(auth)` | CSR | `/api/v1/auth/*` |
| `app/sub/[token]` | route handler | 纯文本 |

后台不走 SSR 的理由：

- 没有 SEO 需求，SSR 只是把"首屏等数据"从前端请求换成服务端查库，复杂度换不来价值
- 筛选、分页、弹窗、批量操作本来就是客户端状态，SSR 之后还是要 hydration
- 唯一的 RSC 用途是**根 layout 读 cookie 注入初始会话**，避免登录态闪一下——这不是页面渲染，只省一次请求

约定：

- 页面文件默认可写 `'use client'`；只有明确要 SEO 的公开页保持 server component
- 客户端一律走 TanStack Query，不写 `useEffect + fetch`
- 首屏用 `<Suspense>` + `Skeleton`，不要全屏 spinner
- 仍然是 `output: 'standalone'` 的 Node 服务，**不能** `output: 'export'`（API routes 需要服务端）

## 3. 布局实现（shadcn Sidebar）

```tsx
// app/(admin)/layout.tsx
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { CommandPalette } from '@/components/layout/command-palette'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePermission('admin:dashboard:read')

  return (
    <SidebarProvider>
      <AppSidebar nav={adminNav} permissions={session.permissions} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Breadcrumbs />
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </SidebarInset>
      <CommandPalette nav={adminNav} permissions={session.permissions} />
    </SidebarProvider>
  )
}
```

要点：

- `SidebarProvider` 负责折叠状态与移动端抽屉，折叠态用 `SidebarMenuButton tooltip`
- 嵌套菜单用 `SidebarMenuSub`（节点、插件两组）
- `SidebarInset` 自带移动端留白，不要再手写断点类
- 页面骨架统一：`PageHeader`（标题 + 操作按钮）+ 内容区，不逐个页面重复 flex 布局

### 场景 → shadcn 组件

| 场景 | 组件 |
|---|---|
| 列表 + 详情 | 双栏 `ResizablePanel`，或 `DataTable` + `Sheet` 详情抽屉 |
| 表单弹窗 | `Dialog` |
| 需要看列表上下文的详情 | `Sheet` |
| 移动端底部操作 | `Drawer` |
| 确认删除 | `AlertDialog` |
| 分步下单 | 自建 `Stepper`（Tabs 语义 + `Progress`） |
| 长列表筛选 | `DataTable` + `Popover` + `Command`（多选过滤） |

## 4. 数据获取（关键约定）

| 场景 | 方式 |
|---|---|
| 后台页面所有读 | 客户端 TanStack Query → `/api/v1/...` |
| 公开页（首页/商品） | Server Component 直接调 `lib/services/*`（可选，为 SEO） |
| 写操作 | `useMutation` → 成功后 `invalidateQueries` + `toast` |
| 纯 UI 的服务端变更 | Server Action（仅限不进入跨端契约的操作） |

约定：

- **页面与 route handler 都调 `lib/services/*`**，两边都不写 SQL；服务层是唯一的业务入口
- `/api/v1` 是唯一对外接口面（前端、Agent、PAT 共用）
- query key 集中在 `lib/api/keys.ts`：`['orders', { status, cursor }]`
- 错误统一在 `lib/api/client.ts` 处理：解析 `{ statusCode, code, message }`，401 跳登录，其余 toast
- 列表接口统一返回 `{ data, meta }`；组件只关心 `data` 与 `meta.nextCursor`

```ts
// 交互式列表的标准写法
const { data, isPending } = useQuery({
  queryKey: keys.orders({ status, cursor }),
  queryFn: () => api.get('/api/v1/admin/orders', { status, cursor })
})
```

## 5. 表格（TanStack Table + shadcn Data Table）

统一封装 `components/common/data-table.tsx`，负责加载态、空态、分页、列可见性：

```tsx
const columns: ColumnDef<Order>[] = [
  { accessorKey: 'orderNo', header: t('order.no') },
  { accessorKey: 'amount', header: t('order.amount'), cell: ({ row }) => <Money value={row.original.amount} /> },
  { accessorKey: 'status', header: t('common.status'), cell: ({ row }) => <StateBadge status={row.original.status} /> },
  { id: 'actions', cell: ({ row }) => <OrderActions order={row.original} /> }
]
```

- 服务端分页：游标来自 `meta.nextCursor`，不要在前端做全量分页
- 行操作统一放 `DropdownMenu`，不要横排一堆按钮
- 多选：`rowSelection` + 表头三态 `Checkbox`
- 超过 200 行开 `useVirtualizer`，否则直接渲染

## 6. 表单（react-hook-form + zod + shadcn Form）

```tsx
const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues })

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
    <FormField name="email" render={({ field }) => (
      <FormItem>
        <FormLabel>{t('field.email')}</FormLabel>
        <FormControl><Input type="email" {...field} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
    <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
      {t('auth.login')}
    </Button>
  </form>
</Form>
```

- schema 来自 `@sparrow/contracts`，前后端同一份，不在前端重写校验
- 服务端 422 的字段错误用 `form.setError(field, { message })` 回填
- `FormMessage` 自带 `aria-describedby`，不要手写错误 `<p>`

## 7. 状态管理

| 场景 | 方案 |
|---|---|
| 服务端数据 | TanStack Query（默认，后台全部页面） / RSC 直取（仅公开页） |
| 会话与权限 | layout 通过 props 下传，`hooks/use-permissions.ts` 提供 `can()` |
| 局部 UI 状态 | `useState` / `useReducer` |
| 主题 | `next-themes` |
| 语言 | `next-intl` |
| 侧边栏折叠 | `SidebarProvider` 自带（cookie 持久化） |

不引入 Redux / Zustand；出现真实跨页客户端状态时再局部引入，见 [tech-stack §8](../architecture/tech-stack.md)。

## 8. 组件与业务域映射

| 业务 | 组件 |
|---|---|
| 商品列表 | `Card` + `Badge` + 自建 `PricingCard` |
| 下单流程 | 自建 `Stepper` + `Dialog` 确认 + `Alert` 提示 |
| 订单列表 | `DataTable` + `StateBadge` + `Sheet`（详情） |
| 订单详情 | 双栏 + `Breadcrumb` + 时间线（自建 `ol`，不要引第三方） |
| 订阅管理 | `DataTable` + `Progress`（流量占比）+ `CopyButton` + `Dialog`（二维码） |
| 订阅链接 | `Input readOnly` + 复制按钮 + 二维码弹窗 |
| 流量图表 | shadcn `Chart`（Recharts） |
| 节点管理 | `DataTable` + `Tabs`（按组）+ `Tree`（组层级，自建递归）+ `Sheet` 编辑 |
| 节点状态 | `StateBadge` + `Progress`（负载） |
| 证书 | `Input type=file` + `Calendar`（到期）+ `Alert`（临期） |
| 用户管理 | `DataTable` + `DropdownMenu` + `Sheet`（详情/会话） |
| 插件管理 | `DataTable` + `Dialog`（安装向导）+ `Tabs` + 动态表单 |
| 日志 | `DataTable` + 筛选栏 + `Sheet`（详情） |
| 个人设置 | `Tabs` + 表单 + 语言/主题切换 |

## 9. 契约变更流程

跨端契约改动（面板 ↔ Agent ↔ 未来 SDK）必须走：

```
1. 改 packages/contracts/src/**/*.ts 的 zod schema（唯一真相）
2. pnpm gen            # 生成 openapi.json + Go client（src/agent/internal/client/api.gen.go）
3. pnpm gen:diff       # CI 校验：重新生成后 git diff 必须为空
4. 更新服务端实现与前端类型
5. 更新共享测试向量（HMAC 签名、字段名）
6. 提交（schema 与生成物必须在同一个 commit）
```

CI 门禁：

- `pnpm gen && git diff --exit-code`（生成物漂移即失败）
- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`
- 破坏性变更检测：对比新旧 openapi，删除/改名字段必须显式标注

## 10. 性能

| 手段 | 说明 |
|---|---|
| 首屏 | 根 layout 注入会话 + 页面 skeleton，**不发多余请求**；公开页 RSC/ISR 出 HTML |
| 按需加载 | 图表、富文本编辑器用 `next/dynamic` 单独 chunk；图标按名 import |
| 表格 | 服务端分页 + 只查需要的列；大数据量开虚拟滚动 |
| 缓存 | 公开接口 `revalidate: 60`；订阅渲染 30s 内存缓存 |
| 字体 | `next/font` 自托管 + `display: swap`，避免 FOUT |
| 图片 | `next/image`，Logo 与二维码走同一套 |
