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
sparrow-caddy     80/443     容内 caddy：自动签证书、反代 panel
sparrow-panel     (内部3000)  Next standalone，不映射宿主端口
sparrow-postgres  (内部5432)  PostgreSQL 17，不映射宿主端口
sparrow-migrate   一次性      跑完 exited(0)，panel 等它成功才启动
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
0 3 * * * root docker exec sparrow-postgres pg_dump -U sparrow -Fc sparrow > /var/backups/sparrow/$(date +\%F).dump && find /var/backups/sparrow -name '*.dump' -mtime +14 -delete
EOF
```

恢复：

```bash
docker exec -i sparrow-postgres pg_restore -U sparrow -d sparrow --clean --if-exists < /var/backups/sparrow/2026-11-01.dump
```

> `deploy/.env` 里的 `MASTER_KEY` 加密了节点密钥/插件密钥，**必须单独备份**（密码管理器），它不在数据库里；丢了节点要重新注册。

## 6. 换掉内置 Caddy

已有 Nginx/Traefik，或者要挂到已有反代后面：

```bash
# 1) deploy/compose.yaml 里删掉 caddy 服务
# 2) 给 panel 加端口映射：  - "127.0.0.1:3000:3000"
# 3) 外部反代到 127.0.0.1:3000
```

`deploy/Caddyfile` 只是默认模板，删掉不影响面板。

## 7. 节点服务器

节点是另一台机器，只要内核 + Agent 二进制（不需要 Docker/Node/DB）：

```bash
# 内核（以 sing-box 为例）
curl -fsSL https://sing-box.app/install.sh | sudo sh

# Agent
cd /tmp && git clone git@github.com:define9/sparrow-proxy-panel.git
cd sparrow-proxy-panel/src/agent && make build
sudo install -m 755 bin/sparrow-agent /usr/local/bin/

# 注册（令牌在面板「节点管理 → 新建节点」）
sudo mkdir -p /etc/sparrow-agent /var/lib/sparrow-agent
sudo cp deploy/config.example.yaml /etc/sparrow-agent/config.yaml
sudo sed -i 's#https://panel.example.com#https://你的域名#' /etc/sparrow-agent/config.yaml
sudo sparrow-agent register -c /etc/sparrow-agent/config.yaml --url https://你的域名 --token <令牌>

sudo cp deploy/sparrow-agent.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sparrow-agent
sudo sparrow-agent doctor -c /etc/sparrow-agent/config.yaml
```

## 8. 排障

| 现象 | 处理 |
|---|---|
| `panel` unhealthy | `docker compose logs panel`；多半是 `DATABASE_URL` 密码与库不一致 |
| `migrate` exited 1 | `docker compose logs migrate`；改过 `POSTGRES_PASSWORD` 但 volume 还是旧密码 → 改回去或 `down -v` 重来（**删数据**） |
| 证书申请失败 | 域名未解析 / 80 被占 / 云安全组没开；`docker compose logs caddy` |
| `/setup` 403 | 没填或填错 `SETUP_TOKEN`（值在 `deploy/.env`） |
| 登录后又跳回登录页 | `NEXT_PUBLIC_SITE_URL` 与实际域名不一致 |
| 构建时进程被杀 | 内存不足：`bash bootstrap.sh --swap` 后重跑 `./up.sh` |
| 构建报 `ERR_PNPM_IGNORED_BUILDS` | 依赖的安装脚本被 pnpm 拦了；`pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 已放行构建必需的包，拉最新代码再构建 |
| 重启机器后没起来 | `sudo systemctl enable docker`（compose 服务已设 `restart: unless-stopped`） |
| 节点一直离线 | 节点上 `sparrow-agent doctor`；面板看节点是否已注册 |
