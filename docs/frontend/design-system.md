# 设计系统

原则：**只用 shadcn 的 CSS 变量语义类**（`bg-background` / `text-muted-foreground` / `border-border`）。
业务代码里出现 `text-gray-500` / `bg-blue-600` 视为违规（ESLint + code review 拦截）。

## 1. 三层结构

```
第 1 层  原始色值（oklch）——只在 globals.css 的 :root / .dark 出现
   ↓
第 2 层  CSS 变量（--background / --primary / …）——只在 globals.css 引用
   ↓
第 3 层  语义类（bg-background / text-muted-foreground / ring-ring）——业务代码只写这层
```

## 2. globals.css

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;

  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --primary: oklch(0.55 0.16 155);          /* 品牌绿 */
  --primary-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.3);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.55 0.16 155);

  /* 项目扩展：shadcn 默认没有这三档 */
  --success: oklch(0.62 0.17 150);
  --warning: oklch(0.77 0.16 84);
  --info: oklch(0.62 0.14 240);

  --chart-1: var(--primary);
  --chart-2: var(--info);
  --chart-3: var(--success);
  --chart-4: var(--warning);
  --chart-5: var(--destructive);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* …对应暗色一套，色相不变、亮度反转… */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
  --color-chart-1: var(--chart-1);
  --radius-lg: var(--radius);
  --font-sans: var(--font-public-sans);
}
```

改主色只改 `--primary` 与 `--primary-foreground`（以及 `--ring`），按钮、徽章、聚焦环、图表主色自动跟随。

## 3. 语义类速查

| 类 | 用途 |
|---|---|
| `bg-background` / `text-foreground` | 页面底、正文 |
| `bg-card` / `text-card-foreground` | 卡片、弹窗 |
| `bg-muted` / `text-muted-foreground` | 次要底 / 说明文字 |
| `bg-accent` / `text-accent-foreground` | hover、选中项 |
| `bg-primary` / `text-primary-foreground` | 主操作 |
| `bg-destructive` | 危险操作 |
| `border-border` / `border-input` | 常规描边 / 输入框 |
| `ring-ring` | 聚焦环 |
| `text-success` / `text-warning` / `text-info` | 项目扩展状态色 |
| `bg-chart-1` … `bg-chart-5` | 图表 |

透明度写法：`bg-muted/50`、`text-muted-foreground/80`。
**不存在 `bg-soft` / `text-dimmed`** 这类别的 UI 库的命名，写错会被 `eslint-plugin-better-tailwindcss` 当场拦下。

## 4. 明暗模式

`next-themes`，class 策略，跟随系统：

```tsx
// app/layout.tsx
<html lang={locale} suppressHydrationWarning>
  <body>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```

- `suppressHydrationWarning` 必须加在 `<html>` 上，否则主题切换报水合不一致
- 切换器用 `DropdownMenu`（Light / Dark / System），图标要在 `useEffect` 挂载后再渲染，避免服务端与客户端不一致
- 状态色只用 CSS 变量，**不要在图表里硬编码 `#00C16A`**，否则暗色模式失配

## 5. 状态 → 颜色映射

状态色全项目统一，后台与用户端一致。封装成一个组件，避免各处手写 `if`：

```tsx
// components/common/state-badge.tsx
const styles = {
  success: 'bg-success/12 text-success ring-success/20',
  warning: 'bg-warning/12 text-warning ring-warning/20',
  destructive: 'bg-destructive/12 text-destructive ring-destructive/20',
  muted: 'bg-muted text-muted-foreground ring-border'
} as const

const MAP: Record<string, { tone: keyof typeof styles; label: string }> = {
  paid: { tone: 'success', label: 'order.status.paid' },
  pending: { tone: 'warning', label: 'order.status.pending' },
  cancelled: { tone: 'muted', label: 'order.status.cancelled' },
  online: { tone: 'success', label: 'node.status.online' },
  offline: { tone: 'destructive', label: 'node.status.offline' }
}
```

| 状态 | tone |
|---|---|
| 订单：待支付 / 已支付 / 已取消 / 已过期 / 已退款 | warning / success / muted / muted(描边) / destructive |
| 订阅：生效 / 暂停 / 到期 / 取消 | success / warning / muted / muted |
| 节点：在线 / 离线 / 维护中 | success / destructive / warning |
| 插件：运行中 / 已禁用 / 错误 | success / muted / destructive |
| 用户：正常 / 封禁 / 未验证 | success / destructive / warning |
| 日志级别：info / warn / error | info / warning / destructive |

## 6. 间距与圆角

| 元素 | 规范 |
|---|---|
| 圆角 | 用 `--radius`（`rounded-lg` 即跟随），不逐个覆盖 |
| 页面容器 | `<main className="p-4 lg:p-6">`，不额外套 max-width |
| 卡片间距 | `gap-4` / `gap-6` |
| 表单字段 | `space-y-4` |
| 表格密度 | 默认；密集模式给单元格 `py-1.5` |

数字（流量、金额、订单号）用 `font-mono tabular-nums`，避免数值刷新时宽度跳动。

## 7. 图标

- 统一 `lucide-react`，按名 import：`import { Plus } from 'lucide-react'`
- 尺寸用 `className="size-4"`（不要 `h-4 w-4` 混用）
- 图标在业务代码里抽成常量，避免到处写字面量：

```ts
// lib/icons.ts
export { Package as PlanIcon, Receipt as OrderIcon, Rss as SubscriptionIcon, Server as NodeIcon } from 'lucide-react'
```

- 纯图标按钮必须有 `aria-label` 或 `sr-only` 文本

## 8. 品牌标识与站点图标

麻雀图形是唯一品牌标识，所有 logo 位都从它派生，不要另找图或另画。

| 文件 | 用途 |
|---|---|
| `app/icon.svg` | 标签页 favicon，Next 自动注入 `<link rel="icon" type="image/svg+xml">` |
| `app/favicon.ico` | 16 / 32 / 48 三档，兜底 `/favicon.ico` 与老浏览器 |
| `app/apple-icon.png` | iOS 主屏 180×180，直角全出血，圆角交给系统切 |
| `public/brand/sparrow.svg` | 原始矢量（白底 + 墨色鸟），对外物料用 |
| `public/brand/sparrow-mark.svg` `.png` | 绿底方形标，邮件 / OG / 第三方后台用 |

站内 logo 统一 `<SparrowMark className="size-7" />`（`components/brand/sparrow-mark.tsx`），
和 favicon 用的是同一份 path 数据：品牌绿 `#008b45`（= `--primary`）+ 墨色 `#1C0101`。

颜色写死、**不跟随 `--primary` 反色**——logo 要在明暗两套主题下保持同一张脸。
需要新尺寸时给 `className` 就行，不要复制一份新的 SVG。

改动图形只改根目录 `麻雀.svg` 源文件，再重新导出上面几件产物，不要手改 `sparrow-mark.tsx` 里的 path。

## 9. 字体

```tsx
// app/layout.tsx
import { Public_Sans } from 'next/font/google'
const sans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
```

`globals.css` 里 `--font-sans: var(--font-public-sans)`，不再写 `@import` 外链字体。

## 10. 可访问性

- 焦点、键盘、ARIA 由 Radix 保证，**不要用 `div` 模拟按钮**
- `Dialog` / `Sheet` 必须有 `DialogTitle`（可 `sr-only`），否则读屏器不播报
- 表单错误由 `FormMessage` 提供 `aria-describedby`，不要自己写 `<p class="text-red-500">`
- 语义 token 已保证明暗两套对比度；新增状态色需自测 WCAG AA
- 表格行操作用 `DropdownMenu`（自带键盘操作），不要 `<div onClick>`

## 11. ESLint

```js
// eslint.config.mjs（追加）
{
  rules: {
    // 禁止原生调色板类名，强制语义变量
    'no-restricted-syntax': ['error', {
      selector: "Literal[value=/(text|bg|border)-(gray|zinc|slate|blue|green|red)-\\d{2,3}/]",
      message: '请使用语义类（bg-background / text-muted-foreground / bg-success）'
    }]
  }
}
```

排序规则由 `eslint-plugin-better-tailwindcss` 负责，落地时按其实际能力调整选择器。
