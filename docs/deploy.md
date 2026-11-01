# 部署指南

两种方式，任选其一：

- **A. Docker Compose（推荐）**：一条命令起数据库 + 迁移 + 应用，服务器只需要 Docker。
- **B. 裸机 Node + systemd**：不用 Docker，但需要自己装 Node 24 与 PostgreSQL 17。

两种方式都走同一个初始化流程：迁移 → 打开 `/setup` 创建第一个管理员。

---

## 0. 前置

| 项 | 要求 |
|---|---|
| 服务器 | 1 vCPU / 1 GB 内存起（应用常驻约 150–250 MB），Debian/Ubuntu 均可 |
| 域名 | 一个 A 记录指向服务器（HTTPS 与订阅链接需要） |
| 端口 | 80/443 对外；3000 与 5432 **只监听 127.0.0.1** |

先装 Docker 与 Caddy（反代 + 自动 HTTPS）：

```bash
curl -fsSL https://get.docker.com | sh
# Debian/Ubuntu 装 Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

---

## A. Docker Compose

```bash
git clone <你的仓库地址> sparrow-proxy-panel
cd sparrow-proxy-panel/deploy

cp .env.example .env
# 必改三项：
#   POSTGRES_PASSWORD=强密码
#   MASTER_KEY=$(openssl rand -hex 32)      ← 生成后保存好，丢了节点密钥解不开
#   NEXT_PUBLIC_SITE_URL=https://panel.example.com
# 公网部署再设一个 SETUP_TOKEN=$(openssl rand -hex 16)
vi .env

docker compose up -d --build        # 首次构建 3–5 分钟
docker compose ps                   # 三个服务：postgres(healthy) / migrate(exited 0) / panel(healthy)
docker compose logs -f panel
```

`migrate` 是**一次性任务**，成功后自动退出（`exit 0`），`panel` 等它成功才启动；所以升级时只要 `docker compose up -d --build`，迁移会先跑。

反代：

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/panel.example.com/你的域名/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

打开 `https://你的域名/setup` 创建管理员 → 自动登录进 `/admin`。

### 升级

```bash
cd sparrow-proxy-panel && git pull
cd deploy && docker compose up -d --build     # 迁移 → 重启，期间约 10–30 秒不可用
```

### 回滚

```bash
git checkout <上一个 commit>
cd deploy && docker compose up -d --build
```

> 数据库迁移只增不改；回滚代码不会自动回滚表结构，破坏性变更要按"先加列、再删列"两版走。

---

## B. 裸机 Node + systemd

```bash
# 1. 运行时
curl https://mise.run | sh && echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
sudo apt install -y postgresql-17
sudo -u postgres psql -c "create user sparrow with password '强密码';"
sudo -u postgres psql -c "create database sparrow owner sparrow;"

# 2. 代码
sudo useradd -r -m -d /opt/sparrow sparrow
sudo -u sparrow git clone <仓库地址> /opt/sparrow/app
cd /opt/sparrow/app
sudo -u sparrow mise install          # node 24 / pnpm
sudo -u sparrow pnpm install --frozen-lockfile

# 3. 环境变量（放 /etc/sparrow/panel.env，权限 600）
sudo mkdir -p /etc/sparrow
sudo tee /etc/sparrow/panel.env >/dev/null <<'EOF'
DATABASE_URL=postgresql://sparrow:强密码@127.0.0.1:5432/sparrow
MASTER_KEY=用 openssl rand -hex 32 生成
NEXT_PUBLIC_SITE_URL=https://panel.example.com
EOF
sudo chmod 600 /etc/sparrow/panel.env

# 4. 迁移 + 构建
sudo -u sparrow env $(cat /etc/sparrow/panel.env | xargs) pnpm --filter panel db:migrate:prod
sudo -u sparrow pnpm build

# 5. systemd
sudo tee /etc/systemd/system/sparrow-panel.service >/dev/null <<'EOF'
[Unit]
Description=Sparrow Panel
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=sparrow
WorkingDirectory=/opt/sparrow/app/src/panel
EnvironmentFile=/etc/sparrow/panel.env
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
ExecStart=/opt/sparrow/app/node_modules/.bin/next start -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now sparrow-panel
sudo journalctl -u sparrow-panel -f
```

> 裸机用 `next start`（非 standalone）更省事；standalone 产物见 `src/panel/.next/standalone`，适合自己做镜像。

反代同上（`/etc/caddy/Caddyfile` → `reverse_proxy 127.0.0.1:3000`）。

---

## 3. 部署后检查清单

- [ ] `https://域名/api/v1/public/status` 返回 200
- [ ] `/setup` 建出管理员，登录后 `/admin` 能进
- [ ] `/setup` 再次访问只显示"站点已初始化"
- [ ] 系统设置里站点名、`NEXT_PUBLIC_SITE_URL` 与真实域名一致（订阅链接用它拼接）
- [ ] 数据库 5432 **不对公网开放**（`ss -lntp | grep 5432` 应只看到 127.0.0.1）
- [ ] 备份任务已配（见下）

## 4. 备份与恢复

```bash
# 每天 03:00 全量备份，保留 14 天
sudo tee /etc/cron.d/sparrow-backup >/dev/null <<'EOF'
0 3 * * * root docker exec sparrow-postgres pg_dump -U sparrow -Fc sparrow > /var/backups/sparrow-$(date +\%F).dump && find /var/backups -name 'sparrow-*.dump' -mtime +14 -delete
EOF

# 恢复
docker exec -i sparrow-postgres pg_restore -U sparrow -d sparrow --clean --if-exists < /var/backups/sparrow-2026-11-01.dump
```

`MASTER_KEY` 与数据库备份同等重要：它加密节点密钥/插件密钥/2FA，丢了这些数据就不可用。**单独存一份到密码管理器。**

## 5. 接入节点

```bash
# 面板 → 节点管理 → 新建节点 → 复制一次性注册令牌
scp src/agent/bin/sparrow-agent root@node:/usr/local/bin/    # 或在节点上 make build
sudo sparrow-agent register --url https://panel.example.com --token <token>
sudo sparrow-agent doctor
sudo systemctl enable --now sparrow-agent
```

## 6. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 页面 500，日志 `relation "users" does not exist` | 迁移没跑：`docker compose run --rm migrate` |
| `/setup` 提示 403 | 公网访问且未设 `SETUP_TOKEN`：在 `.env` 设置后 `docker compose up -d`，页面填同一个值 |
| 登录后跳回登录页 | `NEXT_PUBLIC_SITE_URL` 与实际域名不一致，或反代没透传 `X-Forwarded-For` |
| 节点一直离线 | 节点侧 `sparrow-agent doctor`；面板侧看节点是否已注册（有 secret） |
| 订阅链接打不开 | `NEXT_PUBLIC_SITE_URL` 拼出来的地址不对，或 `/sub/*` 被反代拦了 |
| 内存占用持续上涨 | 单实例跑定时任务 + 流量缓存，1 GB 机器建议加 swap |
| 多副本部署 | 需要把定时任务的 advisory lock 与限流换成跨进程方案，当前设计是单实例 |
