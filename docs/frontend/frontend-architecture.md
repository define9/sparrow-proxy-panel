# 前端架构

## 1. 基线对齐官方 Dashboard 模板

`src/panel/` 的前端以 `nuxt-ui-templates/dashboard` 为基线，保留其目录约定、样式基线、组件用法与工程配置，差异只在业务域。

```
src/panel/app/
├── app.vue                     # UApp + NuxtLoadingIndicator + NuxtLayout
├── app.config.ts               # ui.colors / ui.icons / ui.prose 全局默认
├── assets/css/main.css         # @import "tailwindcss" theme(static); @import "@nuxt/ui";
├── components/
│   ├── common/                 # 跨业务通用（DataTable/StateBadge/QuotaBar/...）
│   ├── auth/                   # 登录注册相关
│   ├── plan/  order/  subscription/  node/  user/  plugin/  log/
├── composables/
│   ├── useApi.ts               # 统一 $fetch 封装（错误提示、鉴权头）
│   ├── useAuth.ts              # 登录态、权限判断（useUserPermissions）
│   ├── usePagination.ts        # keyset 分页状态
│   ├── useFormatters.ts        # 金额/流量/时间格式化（Intl）
│   └── useNotifications.ts     # 站内信 + toast 封装
├── layouts/
│   ├── default.vue             # 营销/公开页（UHeader + UMain + UFooter）
│   ├── auth.vue                # 登录注册（居中单栏）
│   ├── dashboard.vue           # 用户端（UDashboardGroup + Sidebar）
│   └── admin.vue               # 管理端（同上，菜单按权限不同）
├── middleware/
│   ├── auth.global.ts          # 全局：未登录跳登录页；已登录访问登录页跳仪表盘
│   ├── admin.ts                # 管理端：角色校验
│   └── guest.ts
├── pages/
│   ├── index.vue               # 首页
│   ├── (auth)/login.vue  register.vue  forgot-password.vue
│   ├── dashboard/index.vue  plans/  orders/  subscriptions/  traffic/  settings/
│   └── admin/index.vue  plans/  orders/  subscriptions/  nodes/  users/  plugins/  logs/  settings/
├── types/                      # 全局 TS 类型（模板已有，扩展）
└── utils/                      # 纯函数（模板已有，扩展）
```

## 2. 布局与路由

| 路由段 | layout | 鉴权 | 说明 |
|---|---|---|---|
| `/` | `default` | 公开 | 首页、商品介绍、公告 |
| `/login` `/register` `/forgot-password` | `auth` | 游客 | 已登录自动跳 `/dashboard` |
| `/dashboard/**` | `dashboard` | 用户 | 用户中心 |
| `/admin/**` | `admin` | 管理员 | 管理后台 |
| `/sub/{token}` | — | token | 订阅输出（纯文本，非页面） |

约定：
- 页面组件必须 `definePageMeta({ layout: 'dashboard' })`，不靠嵌套路由隐式继承
- 用户端与管理端**布局分离**，菜单与守卫独立，避免越权页面泄露结构
- 公开页 `routeRules: { '/': { prerender: true } }` 静态化

## 3. 布局实现要点（全部用 Nuxt UI 原生组件）

### 3.1 用户端 / 管理端侧边栏

```vue
<!-- app/layouts/dashboard.vue -->
<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar id="user-sidebar" v-model:open="open" collapsible resizable>
      <template #header="{ collapsed }">
        <AppLogo :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="navItems"          <!-- 见 navigation.md，已按权限过滤 -->
          orientation="vertical"
          tooltip
          popover
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="searchGroups" />   <!-- Cmd+K 命令面板 -->

    <slot />
  </UDashboardGroup>
</template>
```

要点：
- `UNavigationMenu` 必须传 `:collapsed="collapsed"`，折叠时自动只显示图标
- 嵌套菜单用 `children` + `type: 'trigger'`（模板的 Settings 分组写法）
- `UDashboardGroup` 负责侧边栏尺寸与折叠状态持久化（cookie）
- 移动端 `mode` 默认 slideover，`UDashboardNavbar` 自带汉堡按钮

### 3.2 页面骨架

每个业务页统一为 `UDashboardPanel` + `#header`（`UDashboardNavbar` + `UDashboardToolbar`）+ `#body`：

```vue
<template>
  <UDashboardPanel id="admin-nodes">
    <template #header>
      <UDashboardNavbar :title="t('admin.nodes.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton :icon="iRefresh" :label="t('common.refresh')" color="neutral" variant="ghost" />
          <UButton :icon="iPlus" :label="t('common.create')" @click="openCreate" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput v-model="q" icon="i-lucide-search" :placeholder="t('common.search')" class="w-64" />
        </template>
        <template #right>
          <USelect v-model="status" :items="statusOptions" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTable :data="rows" :columns="columns" :loading="status === 'pending'">
        <template #empty>
          <UEmpty :icon="iServerOff" :title="t('common.empty')" />
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
```

### 3.3 布局选择原则

| 场景 | 选择 | 理由 |
|---|---|---|
| 列表 + 详情 | `UDashboardPanel` 双栏 + `UDashboardResizeHandle` | 原生可拖拽分隔 |
| 表单弹窗 | `UModal` | 轻量操作 |
| 详情侧栏 | `USlideover` | 需要看列表上下文时 |
| 移动端底部操作 | `UDrawer` | 触达友好 |
| 确认删除 | `UModal` + `useOverlay` | 原生 overlay 上下文 |
| 分步下单 | `UStepper` | 原生步骤条 |
| 营销首页 | `UPageHero` / `UPageSection` / `UPageGrid` / `UPricingPlans` | 官方页面级组件 |
| 公告 | `UBanner`（全局）/ `UMarquee`（滚动） | 原生 |
| 长列表 | `UScrollArea` | 原生虚拟滚动容器 |

## 4. 数据获取

统一封装 `useApi`，统一错误提示与鉴权：

```ts
// app/composables/useApi.ts
export function useApi() {
  return {
    api: $fetch.create({
      onResponseError({ response }) {
        // 统一 toast；401 → 跳登录
      }
    })
  }
}
```

约定：
- SSR 首屏数据用 `useAsyncData` / `useFetch`（带 key），客户端交互用 `$fetch`
- 管理端列表统一 `useLazyFetch` + `watch` 触发器（避免重复请求）
- 所有列表接口返回 `{ data, meta }`，组件只关心 `data` 与 `meta.total`
- 加载态用 `status === 'pending' || status === 'idle'`（`idle` 覆盖首次渲染前）

## 5. 表格模式（UTable）

统一封装 `<DataTable>` 组件（`app/components/common/DataTable.vue`），封装列定义、加载态、空态、分页：

```vue
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

const columns: TableColumn[] = [
  { accessorKey: 'name', header: t('admin.nodes.name') },
  { accessorKey: 'status', header: t('common.status') },
  { id: 'actions' }
]
</script>
```

- `UTable` 基于 TanStack Table v8（`@nuxt/ui` 自带依赖），无需单独安装
- 行内操作统一放 `UDropdownMenu`（`items` 嵌套数组自动分组）
- 状态列用 `UBadge`（见 [design-system](design-system.md)）
- 服务端分页：`UPagination` 的 `total` 是**条目数**不是页数
- 多选：`v-model:row-selection` + 表头三态 `UCheckbox`（`'indeterminate'`）

## 6. 表单模式（UForm）

```vue
<UForm :schema="schema" :state="state" @submit="onSubmit">
  <UFormField :label="t('field.email')" name="email" required>
    <UInput v-model="state.email" type="email" icon="i-lucide-mail" class="w-full" />
  </UFormField>

  <UFormField :label="t('field.password')" name="password" required>
    <UInput v-model="state.password" type="password" icon="i-lucide-lock" class="w-full" />
  </UFormField>

  <UButton type="submit" :loading="loading" block>{{ t('auth.login') }}</UButton>
</UForm>
```

- 校验用 **zod**（与 `packages/contracts` 同一套 schema），Nuxt UI 的 `UForm` 支持 Standard Schema，zod 原生兼容
- 后端返回的字段级错误通过 `setErrors` 回填
- 提交中禁用按钮，失败用 `useToast` 提示

## 7. 状态管理

| 场景 | 方案 |
|---|---|
| 跨组件的小状态（侧边栏折叠、通知面板） | `createSharedComposable`（模板的 `useDashboard` 写法） |
| 跨页面状态（当前用户、权限） | `useState` + `useUserPermissions` |
| 服务端数据 | `useAsyncData` / `useFetch`（自带缓存与去重） |
| 表单状态 | 局部 `reactive` / `ref` |
| 复杂客户端状态 | **不引入 Pinia**（见 tech-stack 决策） |

## 8. 组件与业务域映射

| 业务 | 原生组件 |
|---|---|
| 商品列表 | `UPricingPlans` `UPricingPlan` `UPricingTable` `UBadge`（标签） |
| 下单流程 | `UStepper` `UModal`（确认）`UAlert`（提示） |
| 订单列表 | `UTable` + `UBadge`（状态） + `UTimeline`（详情流转） |
| 订单详情 | `UDashboardPanel` 双栏 + `UBreadcrumb` + `UTimeline` |
| 订阅管理 | `UTable` + `UProgress`（流量占比）+ `UChip`（客户端格式）+ `UInputTags`（IP 白名单） |
| 订阅链接 | `UInput`（readonly）+ `UButton`（复制）+ `UModal`（二维码） |
| 流量图表 | `@tanstack/charts`（Nuxt UI 无原生图表组件） |
| 节点管理 | `UTable` + `UTabs`（按节点组）+ `UTree`（节点组层级）+ `USlideover`（编辑） |
| 节点状态 | `UBadge`（在线/离线/维护）+ `UProgress`（负载） |
| 证书管理 | `UFileUpload` + `UInputDate`（到期） + `UAlert`（临期告警） |
| 用户管理 | `UTable` + `UDropdownMenu` + `USlideover`（详情/会话） |
| 插件管理 | `UTable` + `UModal`（安装向导）+ `UTabs`（详情/配置/日志）+ `UForm`（schema 自动生成） |
| 日志 | `UTable` + `UDashboardToolbar`（筛选）+ `UBadge`（级别） + `UScrollArea`（详情） |
| 个人设置 | `UTabs` + `UForm` + `ULocaleSelect` + `UColorModeSelect` |
| 全局公告 | `UBanner` + `UMarquee` |
| 通知 | `useToast` + `NotificationsSlideover`（模板已有） |

## 9. 契约变更流程

跨端契约改动（面板 ↔ Agent ↔ 未来 SDK）必须走：

```
1. 改 packages/contracts/src/**/*.ts 的 zod schema（唯一真相）
2. pnpm gen            # 生成 openapi.json + Go client（src/agent/internal/client/api.gen.go）
3. pnpm gen:diff      # CI 校验：重新生成后 git diff 必须为空
4. 更新服务端实现与前端类型
5. 更新共享测试向量（HMAC 签名、字段名）
6. 提交（schema 与生成物必须在同一个 commit）
```

CI 门禁：
- `pnpm gen && git diff --exit-code` —— 生成物漂移即失败
- `pnpm typecheck`、`pnpm lint`、`pnpm test`
- 契约破坏性变更检测：对比新旧 openapi，已删除/改名字段 → CI 报错，需显式标注

## 10. 性能

| 手段 | 说明 |
|---|---|
| SSR + 局部 hydration | 用户端首屏服务端渲染；管理端表格数据用 `useLazyFetch` 客户端拉取（避免 SSR 时阻塞） |
| 图标本地化 | 安装 `@iconify-json/lucide` 离线包，杜绝图标 CDN 请求 |
| 字体 | `@nuxt/fonts`（Nuxt UI 自动注册）+ 预加载字体，减少 FOUT |
| 表格虚拟化 | 长列表用 `UTable` 的虚拟滚动（TanStack Virtual） |
| 分包 | 图表库只在流量页动态 import（`defineAsyncComponent`） |
| 缓存 | 商品列表、公告等公共接口带 `Cache-Control` |
| 预取 | 关键路由用 `definePageMeta({ preload: ... })` 或 `<NuxtLink prefetch>` |
