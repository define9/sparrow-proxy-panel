# 部署手册

一台空白 Ubuntu 22.04/24.04，只需要装 **Docker**。数据库、应用、反向代理（Caddy）全部跑在 compose 里，`80/443` 由 Caddy 容器占用。

---

## 1. 一条命令

```bash
sudo apt update && sudo apt install -y git
git clone git@github.com:define9/sparrow-proxy-panel.git
sudo ./sparrow-proxy-panel/deploy/install.sh --domain panel.example.com
```

> 私有仓库：先在服务器配好 GitHub SSH key（`ssh-keygen -t ed25519` → 公钥加到 GitHub → `ssh -T git@github.com` 验证）。
> 没有域名就先跑 `--domain :80`（纯 HTTP），之后再改。

脚本会依次做：

1. 检查并安装 Docker（官方源）与 compose 插件 —— 已装则跳过
2. 克隆/更新代码到 `/opt/sparrow/app`
3. 生成 `deploy/.env`：随机 `POSTGRES_PASSWORD`、`MASTER_KEY`、`SETUP_TOKEN`
4. `docker compose up -d --build`，等面板 healthy
5. 打印站点地址、`/setup` 链接和初始化令牌

已完成状态：

```
NAME              STATUS
sparrow-caddy     Up (healthy)
sparrow-panel     Up (healthy)
sparrow-postgres  Up (healthy)
```

`migrate` 是一次性容器，跑完就退出（`exited (0)`），属正常。

## 2. 首次初始化

打开 `https://你的域名/setup`：

1. 填站点名、管理员邮箱、用户名、密码
2. 填脚本最后打印的 `SETUP_TOKEN`（在 `deploy/.env` 里）
3. 提交 → 自动登录进 `/admin`

再访问 `/setup` 只会显示"站点已初始化"。

## 3. 验证

```bash
cd /opt/sparrow/app/deploy && docker compose ps
curl -s https://你的域名/api/v1/public/status
docker compose logs -f panel        # 观察是否有报错
```

- [ ] 首页、`/login`、`/admin` 正常
- [ ] 系统设置里的站点地址与真实域名一致（订阅链接用它拼）
- [ ] 只有 80/443 对公网开放：`sudo ss -lntp | grep -E ':(80|443|3000|5432)'`

## 4. 日常运维

```bash
cd /opt/sparrow/app/deploy

docker compose logs -f panel            # 日志
docker compose restart panel            # 重启
docker compose up -d --build            # 升级（先跑迁移再切流量）

cd /opt/sparrow/app && git pull && cd deploy && docker compose up -d --build   # 拉新代码升级
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

> `deploy/.env` 里的 `MASTER_KEY` 加密了节点密钥与插件密钥，**必须单独备份**（密码管理器 / 另一台机器），它不在数据库里。

## 5. 可选配置

### 5.1 内存小于 2 GB：加 swap（可选）

构建阶段可能 OOM，脚本会提示。加 swap 再跑：

```bash
sudo ./sparrow-proxy-panel/deploy/install.sh --domain panel.example.com --swap
```

手工加：

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 5.2 不用内置 Caddy

已经有 Nginx/Traefik 或走内网时：

```bash
# 在 deploy/.env 里把 caddy 暴露端口去掉，或改 compose 只保留 panel 的 127.0.0.1:3000
# 然后外部反代到 127.0.0.1:3000
```

`deploy/Caddyfile` 只是默认模板，删掉 `caddy` 服务不影响面板本身。

### 5.3 换端口 / 改站点地址

改 `deploy/.env` 的 `NEXT_PUBLIC_SITE_URL` 和 `SITE_DOMAIN`，然后 `docker compose up -d`。

## 6. 节点服务器要装什么

节点是**另一台机器**，只需要内核 + Agent 二进制，不需要 Docker/Node/数据库：

```bash
# 内核（以 sing-box 为例）
curl -fsSL https://sing-box.app/install.sh | sudo sh

# Agent：本机交叉编译后 scp，或节点上装 Go 自己 build
cd /tmp && git clone git@github.com:define9/sparrow-proxy-panel.git
cd sparrow-proxy-panel/src/agent && make build
sudo install -m 755 bin/sparrow-agent /usr/local/bin/

# 注册（令牌在面板「节点管理 → 新建节点」里拿）
sudo mkdir -p /etc/sparrow-agent /var/lib/sparrow-agent
sudo cp deploy/config.example.yaml /etc/sparrow-agent/config.yaml
sudo sed -i 's#https://panel.example.com#https://你的域名#' /etc/sparrow-agent/config.yaml
sudo sparrow-agent register -c /etc/sparrow-agent/config.yaml --url https://你的域名 --token <令牌>

sudo cp deploy/sparrow-agent.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sparrow-agent

# 自检
sudo sparrow-agent doctor -c /etc/sparrow-agent/config.yaml
```

## 7. 排障

| 现象 | 处理 |
|---|---|
| `panel` 一直 unhealthy | `docker compose logs panel`；多半是 `DATABASE_URL` 密码与库不一致 |
| `migrate` exited 1 | `docker compose logs migrate`；改过 `POSTGRES_PASSWORD` 但 volume 里还是旧密码 → 改回去，或 `down -v` 重来（**会删数据**） |
| 证书申请失败 | 域名未解析、80 被占、云安全组没开；`docker compose logs caddy` |
| `/setup` 403 | 未带 `SETUP_TOKEN` 或填错；值在 `deploy/.env` |
| 登录后跳回登录页 | `NEXT_PUBLIC_SITE_URL` 与真实域名不一致，或 `SITE_DOMAIN` 写错 |
| 构建时进程被杀 | 内存不足，加 swap（§5.1） |
| 重启服务器后没起来 | `sudo systemctl enable docker`；compose 不随开机自启，配 `restart: unless-stopped` 已在服务里，容器会随 docker 启动 |
| 节点一直离线 | 节点上 `sparrow-agent doctor`；面板看节点是否已注册 |
