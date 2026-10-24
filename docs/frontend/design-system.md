# 设计系统与颜色体系

原则：**只用 Nuxt UI 的语义化颜色（semantic colors），不写原生色值**。任何 `text-gray-500` / `bg-blue-600` 都视为违规（ESLint + code review 拦截）。

## 1. 颜色体系分层

```
第 1 层：Tailwind 调色板（仅在 app.config.ts / CSS @theme 中定义品牌色）
   ↓
第 2 层：Nuxt UI 语义 token（--ui-color-*，随明暗主题自动切换）
   ↓
第 3 层：组件 color 属性（primary / success / warning / error / neutral / info）
   ↓
第 4 层：语义化类名（text-default / text-muted / bg-elevated / border-muted）
```

业务代码只允许出现在第 3、4 层。

## 2. 主题配置（app.config.ts）

```ts
// src/panel/app/app.config.ts
export default defineAppConfig({
  ui: {
    // 主色与中性色（Nuxt UI 预置色板名）
    colors: {
      primary: 'green',
      neutral: 'zinc'
    },

    // 全局默认图标
    icons: {
      loading: 'i-lucide-loader-circle',
      close: 'i-lucide-x',
      check: 'i-lucide-check',
      chevronDown: 'i-lucide-chevron-down',
      chevronRight: 'i-lucide-chevron-right',
      arrowLeft: 'i-lucide-arrow-left',
      arrowRight: 'i-lucide-arrow-right'
    },

    // 表格等组件的默认密度
    table: { striped: false, loading: 'skeleton' }
  }
})
```

改主色只需改这一处，全站（含按钮、徽章、聚焦环、图表主色）自动跟随。

## 3. 品牌色定制（Tailwind v4 @theme）

若需要自定义品牌色（模板的绿色做法），在 CSS 中定义调色板，**不覆盖** Nuxt UI 的语义层：

```css
/* src/panel/app/assets/css/main.css */
@import "tailwindcss" theme(static);
@import "@nuxt/ui";

@theme static {
  --font-sans: 'Public Sans', sans-serif;

  /* 品牌绿（与 app.config.ts 的 primary: 'green' 对应） */
  --color-green-50:  #EFFDF5;
  --color-green-100: #D9FBE8;
  /* … 一直到 950 */
}
```

`theme(static)` 的作用：让 Tailwind 生成完整色阶（50–950）而不是只生成用到的几档，避免动态类名（如 `bg-green-${level}`）丢失。

## 4. 语义 token 速查

| Token | 用途 | 典型场景 |
|---|---|---|
| `text-default` | 主要文字 | 正文、表格主列 |
| `text-muted` | 次要文字 | 说明文字、辅助信息 |
| `text-dimmed` | 弱化文字 | 占位符、禁用态 |
| `text-highlighted` | 强调文字 | 数值、关键指标 |
| `text-toned` | 柔和强调 | 标签内文字 |
| `text-inverted` | 反色文字 | 深色底上的文字 |
| `bg-default` | 页面底色 | 页面背景 |
| `bg-elevated` | 抬升面 | 卡片、弹窗、下拉 |
| `bg-accented` | 强调底 | 选中项、强调区块 |
| `bg-muted` | 中性底 | 分割区块、表头 |
| `bg-inverted` | 反色底 | 深色浮层 |
| `border-default` | 默认边框 | 常规描边 |
| `border-muted` | 弱边框 | 分割线 |
| `border-accented` | 强调边框 | 选中态、聚焦态 |
| `border-inverted` | 反色边框 | 深色浮层描边 |

> 完整清单见 `@nuxt/ui` 主题 CSS 变量 `--ui-text-*` / `--ui-bg-*` / `--ui-border-*`（v4.12）。
> **不存在 `bg-soft`**——写错会被 `eslint-plugin-better-tailwindcss` 当场拦下。

透明度写法：`bg-elevated/25`、`text-muted/80`（模板侧边栏用的就是这个）。

## 5. 明暗模式

`@nuxtjs/color-mode` 由 `@nuxt/ui` **自动注册**，不要手动加进 `modules`。

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  colorMode: {
    preference: 'system',   // system | light | dark
    classSuffix: '',
    fallback: 'light'
  }
})
```

- `useColorMode()` 读取当前模式
- 原生切换组件：`UColorModeButton`（单按钮）、`UColorModeSelect`（三态）、`UColorModeSwitch`、`UColorModeAvatar`、`UColorModeImage`
- 自定义切换器必须用 `<ClientOnly>` 包裹，避免 SSR 水合不一致
- `<html>` 上的 `theme-color` 随模式变化（在 `app.vue` 用 `useHead` 响应式设置）

```vue
<script setup lang="ts">
const colorMode = useColorMode()
const themeColor = computed(() => colorMode.value === 'dark' ? '#0b0b0c' : 'white')
useHead(() => ({ meta: [{ name: 'theme-color', content: themeColor.value }] }))
</script>
```

## 6. 状态 → 颜色映射（项目约定）

状态色必须全项目统一，后台与用户端一致。

| 状态 | color | variant |
|---|---|---|
| 订单：待支付 | `warning` | `subtle` |
| 订单：已支付 / 订阅：生效 | `success` | `subtle` |
| 订单：已取消 | `neutral` | `subtle` |
| 订单：已过期 | `neutral` | `outline` |
| 订单：已退款 | `error` | `subtle` |
| 节点：在线 | `success` | `subtle` |
| 节点：离线 | `error` | `subtle` |
| 节点：维护中 | `warning` | `subtle` |
| 插件：已安装 / 运行中 | `success` | `subtle` |
| 插件：已禁用 | `neutral` | `outline` |
| 插件：错误 | `error` | `subtle` |
| 用户：正常 | `success` | `subtle` |
| 用户：封禁 | `error` | `subtle` |
| 用户：未验证 | `warning` | `subtle` |
| 日志级别：info / warn / error | `info` / `warning` / `error` | `subtle` |

统一封装组件，避免各处手写颜色判断：

```vue
<!-- app/components/common/StateBadge.vue -->
<script setup lang="ts">
const props = defineProps<{ status: string }>()

const MAP: Record<string, { color: 'success' | 'warning' | 'error' | 'neutral' | 'info', label: string }> = {
  paid:       { color: 'success', label: 'order.status.paid' },
  pending:    { color: 'warning', label: 'order.status.pending' },
  online:     { color: 'success', label: 'node.status.online' },
  offline:    { color: 'error',   label: 'node.status.offline' }
}

const conf = computed(() => MAP[props.status] ?? { color: 'neutral' as const, label: props.status })
</script>

<template>
  <UBadge :color="conf.color" variant="subtle" :label="t(conf.label)" />
</template>
```

## 7. 图表配色

`@tanstack/charts` 不自带主题，需要与 Nuxt UI 色板对齐：

```ts
// app/utils/chart.ts
export const chartColors = ['primary', 'info', 'success', 'warning', 'error']
// 通过 CSS 变量取色，自动跟随明暗主题
export const cssVar = (name: string) => `var(--ui-color-${name})`
```

不要在图表里硬编码 `#00C16A` 之类的值，否则暗色模式会失配。

## 8. 字体

`@nuxt/fonts`（Nuxt UI 自动注册）负责字体加载与自托管：

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  fonts: {
    families: [
      { name: 'Public Sans', provider: 'google' }
    ]
  }
})
```

```css
@theme static {
  --font-sans: 'Public Sans', sans-serif;
}
```

数字展示（流量、金额、订单号）建议用 `font-mono` / `tabular-nums`，避免跳动：

```vue
<span class="font-mono tabular-nums">{{ formatBytes(traffic) }}</span>
```

## 9. 图标

- 统一 `i-lucide-*` 格式，默认 lucide 集合
- 安装本地包保证 SSR 与离线可用：`@iconify-json/lucide`、`@iconify-json/simple-icons`
- 组件内用 `icon` prop（`UButton icon="i-lucide-plus"`），不用手写 `<UIcon>`
- 图标命名在业务组件里抽成常量，避免散落字符串：

```ts
// app/utils/icons.ts
export const icons = {
  plan: 'i-lucide-package',
  order: 'i-lucide-receipt',
  subscription: 'i-lucide-rss',
  node: 'i-lucide-server',
  user: 'i-lucide-users',
  plugin: 'i-lucide-plug',
  log: 'i-lucide-scroll-text'
} as const
```

## 10. 间距与圆角

Tailwind v4 默认尺度即可，不自定义。约定：

| 元素 | 规范 |
|---|---|
| 页面主容器 | `UDashboardPanel` 自带 padding，不额外加容器类 |
| 卡片间距 | `gap-4` / `gap-6` |
| 表单字段间距 | `space-y-4` |
| 表格单元格 | `UTable` 默认密度；密集模式用 `size="sm"` |
| 圆角 | 跟随组件默认（`rounded-lg`），不逐个覆盖 |

## 11. ESLint 约束

模板已配 `eslint-plugin-better-tailwindcss`（类名排序），追加自定义规则：

```js
// src/panel/eslint.config.mjs
{
  rules: {
    // 禁止原生调色板类名（bg-blue-500 等），强制语义 token
    'no-restricted-syntax': ['error', {
      selector: "CallExpression[callee.name='$tw']",
      message: '请使用 Nuxt UI 语义颜色（text-default / bg-elevated / color="primary"）'
    }]
  }
}
```

> 实际实现可用 `eslint-plugin-tailwindcss` 的 `no-restricted-classes` 或自定义正则规则实现；落地时按实际插件能力调整。

## 12. 可访问性（Reka UI 免费获得）

- 焦点环、键盘导航、ARIA 由组件保证，**不要用 `div` 模拟按钮**
- 图标按钮必须有 `aria-label`
- 表单错误用 `UFormField` 的 `error` 槽，配合 `aria-describedby`
- 对比度：语义 token 已保证，明暗两套都通过 WCAG AA
- 表格操作列用 `UDropdownMenu`（自带键盘操作），不要自定义 `<div @click>`
