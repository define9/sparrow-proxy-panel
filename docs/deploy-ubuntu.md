# 部署手册

两个脚本，各管一件事：

| 脚本 | 在哪跑 | 干什么 |
|---|---|---|
| `deploy/bootstrap.sh` | 服务器（远端推送执行） | **只装环境**：Docker + compose 插件 + git；swap / ufw 可选 |
| `deploy/up.sh` | 服务器（仓库目录内） | **只起服务**：生成 `.env` → `docker compose up -d --build` |

Node、PostgreSQL、Caddy 全部在容器里，宿主机不用装。

---

## 1. 装环境（远端执行，不用先克隆）

私有仓库，把本机脚本推过去执行：

```bash
# 在本机仓库目录
ssh root@<服务器> 'bash -s -- --swap' < deploy/bootstrap.sh
```

`--swap` 是**可选**的：只在内存 < 2 GB、担心构建 OOM 时才加。
其它可选参数：`--firewall`（启用 ufw 并只放行 22/80/443）、`--no-docker`（已装 Docker 时跳过）。

公开仓库可以直接 curl：

```bash
curl -fsSL https://raw.githubusercontent.com/define9/sparrow-proxy-panel/main/deploy/bootstrap.sh \
  | sudo bash -s -- --swap
```

装完会打印下一步命令。

## 2. 起服务（本地 compose）

```bash
git clone git@github.com:define9/sparrow-proxy-panel.git /opt/sparrow/app
cd /opt/sparrow/app/deploy
sudo ./up.sh --domain panel.example.com
```

`up.sh` 做的事：

1. 没有 `.env` 就生成：随机 `POSTGRES_PASSWORD`、`MASTER_KEY`、`SETUP_TOKEN`
2. 域名 → 自动写 `SITE_DOMAIN` 与 `NEXT_PUBLIC_SITE_URL`
3. `docker compose up -d --build`
4. 等 `panel` healthy，打印站点地址与初始化令牌

无域名/内网：`./up.sh`（默认 `:80` 纯 HTTP）。其它参数：`--email`、`--no-build`、`--down`。

### 起来了什么

```
caddy            80/443     容器内 caddy：自动签证书、反代 panel
panel            (内部3000)  Next standalone，不映射宿主端口
postgres         (内部5432)  PostgreSQL 17，不映射宿主端口
migrate          一次性      跑完 exited(0)，panel 等它成功才启动
```

## 3. 首次初始化

打开 `https://<域名>/setup`：

1. 站点名、管理员邮箱、用户名、密码
2. 初始化令牌 = `deploy/.env` 里的 `SETUP_TOKEN`
3. 提交 → 自动登录进 `/admin`

再访问 `/setup` 只显示"站点已初始化"。

## 4. 验证

```bash
cd /opt/sparrow/app/deploy
docker compose ps                                  # 三个 Up + 一个 exited(0)
curl -s https://<域名>/api/v1/public/status         # 200
sudo ss -lntp | grep -E ':(80|443|3000|5432)'      # 应只看到 80/443
```

## 5. 日常运维

```bash
cd /opt/sparrow/app/deploy

docker compose logs -f panel      # 日志
docker compose restart panel      # 重启
./up.sh --down                    # 停止（数据在 volume）
./up.sh --no-build                # 改了 .env 后生效

# 升级
cd /opt/sparrow/app && git pull && ./deploy/up.sh
```

备份（每天 3 点，保留 14 天）：

```bash
sudo mkdir -p /var/backups/sparrow
sudo tee /etc/cron.d/sparrow-backup >/dev/null <<'EOF'
0 3 * * * root cd /opt/sparrow/app/deploy && docker compose exec -T postgres pg_dump -U sparrow -Fc sparrow > /var/backups/sparrow/$(date +\%F).dump && find /var/backups/sparrow -name '*.dump' -mtime +14 -delete
EOF
```

恢复：

```bash
docker compose exec -T postgres pg_restore -U sparrow -d sparrow --clean --if-exists < /var/backups/sparrow/2026-11-01.dump
```

> `deploy/.env` 里的 `MASTER_KEY` 加密了节点密钥/插件密钥，**必须单独备份**（密码管理器），它不在数据库里；丢了节点要重新注册。

## 5.5 境外访问优化

面板是 CSR + API 的形态，**每次点菜单 = 下载 chunk + 一次 API 往返**。高 RTT 下体感差别很大，已经做的优化：

| 手段 | 位置 | 效果 |
|---|---|---|
| 菜单悬停预取 | `lib/api/prefetch.ts` + 侧边栏 `onMouseEnter` | 悬停时就预取路由 chunk 与该页首个列表请求，点击基本瞬开 |
| 路由级骨架 | `app/(admin)/admin/loading.tsx` 等 | chunk 未到时立刻有骨架，不是白屏 |
| 查询缓存 | `providers.tsx`：`staleTime 60s` / `gcTime 10min` | 切回已看过的菜单先用缓存渲染，后台再刷新 |
| 列表保留旧数据 | `placeholderData: previous` | 换筛选条件不再整块闪骨架 |
| 静态资源长缓存 | `Caddyfile`：`/_next/static/*` immutable | 二次访问不再重复下载 |
| 压缩 | `Caddyfile`：`encode zstd gzip` | 文本资源体积降 60-80% |

还可以加的（按性价比）：

1. **CDN**（Cloudflare 等）只缓存 `/_next/static/*` 与 `/public/*`，`/api/*` 与 `/sub/*` 设 bypass。静态资源就近回源，境外首屏能快 200-500ms。
2. **面板与数据库放在离用户近的区域**：RTT 是物理距离决定的，新加坡/香港节点比欧美快得多。
3. **HTTP/3**：Caddy 在 TLS 下默认启用 h3，确认 compose 映射了 `443/udp`（已映射），弱网下丢包恢复更快。

测一下瓶颈在哪：浏览器 DevTools → Network，看点击菜单后那两条请求的 **Waiting (TTFB)**：
- 静态 chunk 慢 → CDN/region
- `/api/v1/...` 慢 → 数据库或面板 CPU，看 `docker compose logs panel`

## 6. 换掉内置 Caddy

已有 Nginx/Traefik，或者要挂到已有反代后面：

```bash
# 1) deploy/compose.yaml 里删掉 caddy 服务
# 2) 给 panel 加端口映射：  - "127.0.0.1:3000:3000"
# 3) 外部反代到 127.0.0.1:3000
```

`deploy/Caddyfile` 只是默认模板，删掉不影响面板。

## 7. 节点接入（一条命令）

面板自带 Agent 二进制分发：构建一次，之后每个节点一条命令装好并注册。

### 7.1 在面板服务器上构建（每次升级 Agent 后重跑）

```bash
cd /opt/sparrow/app && sudo git pull
cd deploy
sudo ./build-agent.sh            # 用 golang 镜像交叉编译，宿主机不用装 Go
sudo docker compose up -d panel  # 让挂载生效
```

产物落在 `deploy/agent-dist/`（已 gitignore），通过面板的 `/agent/` 路径对外提供：

| 路径 | 内容 |
|---|---|
| `/agent/install.sh` | 安装脚本 |
| `/agent/latest.json` | 版本 + 下载地址 + sha256 |
| `/agent/sparrow-agent-linux-amd64` | 二进制（arm64 / armv7 同目录） |

验证：

```bash
curl -fsSL https://你的域名/agent/latest.json | head -5
```

### 7.2 在节点上安装

面板「节点管理 → 新建节点」拿到一次性注册令牌，然后：

```bash
curl -fsSL https://你的域名/agent/install.sh | sudo sh -s -- \
  --url https://你的域名 \
  --token <一次性令牌> \
  --manifest https://你的域名/agent/latest.json
```

脚本会：校验 sha256 → 装二进制到 `/usr/local/bin/sparrow-agent` → 写 `/etc/sparrow-agent/config.yaml`（0600）→ 创建数据目录 → 调用 `register` 拿 `node_id/node_secret` → 装 systemd 单元并启动。

### 7.3 节点上确认

```bash
sudo sparrow-agent doctor -c /etc/sparrow-agent/config.yaml   # 配置/内核/面板连通
sudo systemctl status sparrow-agent
sudo journalctl -u sparrow-agent -f
```

面板「节点管理」里该节点应变「在线」，`/admin/nodes` 能看到 CPU/内存/在线人数。

> 节点需要先装代理内核（sing-box 或 xray），Agent 只负责拉起与热重载：
> `curl -fsSL https://sing-box.app/install.sh | sudo sh`

### 7.4 升级 Agent

```bash
# 面板服务器
cd /opt/sparrow/app && sudo git pull && cd deploy && sudo ./build-agent.sh && sudo docker compose up -d panel

# 每个节点（幂等，会先停服务再替换）
curl -fsSL https://你的域名/agent/install.sh | sudo sh -s -- --url https://你的域名 --manifest https://你的域名/agent/latest.json
```

## 8. 排障

| 现象 | 处理 |
|---|---|
| `panel` unhealthy | `docker compose logs panel`；多半是 `DATABASE_URL` 密码与库不一致 |
| `migrate` exited 1 | `docker compose logs migrate`；改过 `POSTGRES_PASSWORD` 但 volume 还是旧密码 → 改回去或 `down -v` 重来（**删数据**） |
| `caddy` 一直 Restarting | 先看真实报错：`sudo docker compose run --rm --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`；常见是 80/443 被旧 nginx/caddy 占用（`sudo ss -lntp \| grep -E ':(80\|443)'`）或 `.env` 里 `SITE_DOMAIN` 为空 |
| 证书申请失败 | 域名未解析 / 80 被占 / 云安全组没开；`docker compose logs caddy` |
| `/setup` 403 | 没填或填错 `SETUP_TOKEN`（值在 `deploy/.env`） |
| 登录后又跳回登录页 | `NEXT_PUBLIC_SITE_URL` 与实际域名不一致 |
| 构建时进程被杀 | 内存不足：`bash bootstrap.sh --swap` 后重跑 `./up.sh` |
| 构建报 `ERR_PNPM_IGNORED_BUILDS` | 依赖的安装脚本被 pnpm 拦了；Dockerfile 已改为 `--ignore-scripts` + 定向 `pnpm rebuild`，升级代码后重跑 `./up.sh` |
| 改了配置但构建行为没变 | 服务器代码没更新：`./up.sh --pull`（或 `cd .. && sudo git pull`）后再构建 |
| 重启机器后没起来 | `sudo systemctl enable docker`（compose 服务已设 `restart: unless-stopped`） |
| 节点一直离线 | 节点上 `sparrow-agent doctor`；面板看节点是否已注册 |
