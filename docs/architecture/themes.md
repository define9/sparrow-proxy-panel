# 主题系统

> 主题 = **一个独立的、完整的前端项目**（结构、样式、颜色全变），不是换 CSS 变量。
> 安装后**落地页/前台立即生效**；`/admin`、`/dashboard`、`/api` **永远属于面板**。

## 1. 边界：什么能被主题替换

| 路径 | 归属 |
|---|---|
| `/`、`/pricing`…（公开路径） | **主题可接管**（由 manifest 的 `routes.include` 声明） |
| `/admin`、`/admin/**` | 面板（永远） |
| `/dashboard`、`/dashboard/**` | 面板（永远） |
| `/login`、`/register`、`/setup`、`/forgot-password` | 面板（登录态逻辑在面板） |
| `/api/**`、`/sub/**` | 面板（API 与订阅输出） |
| `/theme-assets/**` | 主题静态资源（由面板托管） |
| `/_next/**`、`/brand/**`、favicon 等 | 面板 |

## 2. 为什么主题是「已构建的静态产物」

主题来自第三方仓库（社区作者自己写）。如果面板在服务器上执行它的代码（`npm install`、`postinstall`、
构建脚本、运行时 import），就等于**对外开放 RCE**。所以：

- 面板**只托管静态文件**，不执行主题的任何服务端逻辑
- 主题仓库**必须提交构建产物**（`dist/`），面板不负责构建
- 主题的 JS 在**浏览器沙箱**里跑，风险等级与普通第三方网站相同
- 主题要调面板数据，只能走**同源 `/api/v1/public/*`**；未登录由主题自己跳 `/login`

## 3. 主题仓库结构

```
sparrow-theme-neon/
├── sparrow-theme.json     # manifest（必需）
├── dist/                  # 构建产物（必需）
│   ├── index.html
│   ├── assets/app.<hash>.js
│   └── ...
```

### manifest（`sparrow-theme.json`）

```jsonc
{
  "key": "neon-nights",          // 小写+连字符，全局唯一
  "name": "Neon Nights",
  "version": "1.0.0",
  "author": "someone",
  "description": "深色霓虹主题",
  "panel": ">=0.1.0 <1.0.0",    // 面板版本兼容区间
  "basePath": "/theme-assets",    // 固定值，只支持这一种接入方式
  "output": "dist",              // 构建产物目录（相对仓库根）
  "routes": {
    "include": ["/"],            // 主题接管的公开路径前缀
    "exclude": []
  },
  "preview": "preview.png"       // 可选截图（dist 内）
}
```

### 安全红线（代码里强制，不是文档约定）

| 规则 | 违反时 |
|---|---|
| `routes.include` 不得含 `/admin` `/dashboard` `/api` `/sub` `/setup` `/login` | 拒绝安装 |
| `basePath` 必须等于 `/theme-assets` | 拒绝安装 |
| `output` 必须是仓库内相对目录（禁 `..`、绝对路径） | 拒绝安装 |
| 仓库没有 `dist/` 或缺 `index.html` | 拒绝安装（提示作者提交构建产物） |
| 静态资源路径穿越（`../`） | 拒绝响应（path.resolve 后校验前缀） |
| 静态资源扩展名白名单 | 拒绝响应 |

## 4. 运行时：Next 16 的 `proxy.ts`

Next 16 起 `middleware.ts` **已废弃**，改名 `proxy.ts`（导出 `proxy` 函数），且 **proxy 默认跑 Node.js runtime**
（可查库、读文件）——这正是主题热替换需要的拦截点。

```
浏览器请求
   │
   ├─ /_next/**、/api/**、/admin/**、/dashboard/**、/login、/sub/**  → 面板（原样）
   │
   └─ 其它公开路径
        ├─ 有激活主题 且 命中 routes.include → 读 {theme}/dist/… 返回
        │     /            → dist/index.html
        │     /pricing     → dist/pricing.html（不存在则回退 index.html）
        │     /theme-assets/x → dist/x
        └─ 否则 → 面板自带落地页
```

**回退保证**：主题文件缺失或读取失败 → 回退面板落地页 + 记日志，**绝不 500**。

**无需重启**：激活态存 `settings` 表（key=`theme`），proxy 每次请求读取（进程内缓存 5 秒），
激活/卸载后主动失效缓存。

## 5. 存储

```
${THEME_DIR:-<cwd>/data/themes}/
  {key}/
    meta.json      # key/name/version/repoUrl/commitSha/installedAt/manifest
    dist/          # 构建产物
```

- 数据库（`plugins` 表，`type='theme'`）只存**元信息**：repo_url / commit_sha / manifest / status
- 文件只落磁盘；容器部署时需要给 `/app/data` 加 volume
- 升级 = 装到新目录，保留 `previous_version` 供回滚

## 6. GitHub 自动发现

按 **topic** 搜：

```
GET https://api.github.com/search/repositories?q=topic:sparrow-proxy-theme
```

作者给仓库打 `sparrow-proxy-theme` 标签 → 管理端「主题」页就能搜到 → 一键安装。

- 可选 `GITHUB_TOKEN`（提高 API 限额）
- GitHub 不可用时返回 502 与可读错误，**手动填 git URL 的路径始终可用**

## 7. 主题作者怎么写

推荐 Vite + React + Tailwind：

```bash
npm create vite@latest sparrow-theme-neon -- --template react-ts
cd sparrow-theme-neon && npm i
npm i -D tailwindcss @tailwindcss/vite
```

关键配置：
- `vite.config.ts` → `base: '/theme-assets'`
- `tailwind.config` / CSS 里用 **shadcn 的 CSS 变量约定**（`--background` `--primary` `--border` …），
  这样主题的组件风格与面板一致，但**颜色值由主题自己定**
- 构建产物提交进仓库：`dist/` 进 git（`.gitignore` 不要忽略它）

数据来源（主题自己 fetch，同源带 cookie）：

```ts
const plans = await fetch('/api/v1/public/plans').then((r) => r.json())
const site = await fetch('/api/v1/public/site').then((r) => r.json())
```

## 8. 与「插件」的关系

主题是**插件的一种**（`type='theme'`），复用 `plugins` 表与安装概念，但：

| | 主题 | 插件 |
|---|---|---|
| 形态 | 静态站点产物 | 后端逻辑 / 外置进程 |
| 执行位置 | 浏览器 | 面板进程内（builtin）或独立进程（external） |
| 作用范围 | 落地页/前台 | 全站能力（支付、通知…） |

因此**统一放在「插件」概念下**，但**运行时路径完全隔离**（主题只占公开路径）。

## 9. 相关文档

- 后端契约：`lib/themes/{manifest,store,install,discover}.ts` + `app/api/v1/admin/themes/**`
- 运行时：`proxy.ts` + `lib/themes/runtime.ts`
- 管理页：`app/(admin)/admin/themes/page.tsx`
- 规范来源：[plugin-system.md](plugin-system.md)（插件）、[security.md](security.md)（安全基线）
