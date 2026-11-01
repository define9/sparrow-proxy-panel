# 从空白 Ubuntu 部署 Sparrow Panel

面向**刚装好的 Ubuntu 22.04 / 24.04**（最小化安装，root 或 sudo 用户）。
全程约 15 分钟，最终得到一个 HTTPS 可访问的面板。

---

## 0. 机器规格

| 项 | 最低 | 建议 |
|---|---|---|
| CPU / 内存 | 1 核 / 1 GB（**必须加 swap**） | 2 核 / 2 GB |
| 磁盘 | 20 GB | 40 GB（数据库 + 备份） |
| 系统 | Ubuntu 22.04 / 24.04 LTS | 同 |
| 网络 | 公网 IP + 一个已解析到它的域名 | 同 |

> 只跑面板不需要 Node 和 PostgreSQL 装到宿主机——它们都在容器里。宿主机只需要 **Docker** 和**反向代理**。

---

## 1. 系统初始化

```bash
# 更新系统
sudo apt update && sudo apt -y upgrade

# 时区（日志与定时任务要靠它）
sudo timedatectl set-timezone Asia/Shanghai

# 常用工具
sudo apt -y install curl ca-certificates gnupg git ufw fail2ban htop unzip

# 自动安全更新（可选但建议）
sudo apt -y install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
```

### 1.1 加 swap（1 GB 内存的机器必做）

Next.js 构建阶段能吃到 1.5 GB 内存，没 swap 会直接被 OOM kill：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h          # 确认 Swap 有 2.0Gi
```

### 1.2 新建部署用户（别一直用 root）

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG sudo deploy
# 把本机公钥给他
sudo mkdir -p /home/deploy/.ssh && sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/
sudo chown -R deploy:deploy /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

之后所有操作都用 `deploy` 用户（下文命令里的 `sudo` 保留）。

---

## 2. 防火墙

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
```

**不要**放行 3000 / 5432：compose 里它们只绑定 `127.0.0.1`。
注意 Docker 会绕过 ufw 直接映射端口——所以我们只映射到回环地址，等于双重保险。

---

## 3. 安装 Docker + Compose 插件

用 Docker 官方源（比 `get.docker.com` 脚本更好审计）：

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 让 deploy 用户免 sudo 用 docker
sudo usermod -aG docker deploy
newgrp docker

docker version && docker compose version
```

国内机器访问 Docker Hub 慢时，配镜像加速：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{ "registry-mirrors": ["https://docker.m.daocloud.io"] }
EOF
sudo systemctl restart docker
```

---

## 4. 安装 Caddy（反代 + 自动 HTTPS）

```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```

Caddy 起来后自动申请证书，只需要一个配置：

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
panel.example.com {
	encode zstd gzip

	@static path /_next/static/*
	header @static Cache-Control "public, max-age=31536000, immutable"

	reverse_proxy 127.0.0.1:3000 {
		header_up X-Forwarded-For {remote_host}
		header_up X-Real-IP {remote_host}
	}
}
EOF

sudo sed -i 's/panel.example.com/你的域名/' /etc/caddy/Caddyfile
sudo systemctl restart caddy && sudo journalctl -u caddy -n 20
```

> 证书申请需要 80/443 可达且域名已解析；内网/无域名时改成 `:80 { reverse_proxy 127.0.0.1:3000 }`。

---

## 5. 部署面板

```bash
# 1) 拉代码（私有库需先在服务器配 SSH key，或把仓库设为 public）
cd /opt && sudo mkdir -p sparrow && sudo chown deploy:deploy sparrow
git clone git@github.com:define9/sparrow-proxy-panel.git /opt/sparrow/app
cd /opt/sparrow/app/deploy

# 2) 环境变量
cp .env.example .env
openssl rand -hex 32        # 复制结果到 MASTER_KEY
vi .env
#   POSTGRES_PASSWORD=<强密码>
#   MASTER_KEY=<上面生成的值>      ← 必须长期保存，换了节点密钥就解不开
#   NEXT_PUBLIC_SITE_URL=https://你的域名
#   SETUP_TOKEN=<openssl rand -hex 16>   ← 公网首次初始化用

chmod 600 .env

# 3) 构建并启动（首次 3–8 分钟，1 GB 机器会更久）
docker compose up -d --build

# 4) 看状态：postgres 必须 healthy，migrate 必须 exited(0)
docker compose ps
docker compose logs -f panel
```

### 首次初始化

1. 浏览器打开 `https://你的域名/setup`
2. 填站点名、管理员邮箱、用户名、密码，以及 `.env` 里的 `SETUP_TOKEN`
3. 提交后自动登录进 `/admin`
4. 再访问一次 `/setup` 应只显示"站点已初始化"

---

## 6. 验证清单

```bash
curl -s https://你的域名/api/v1/public/status         # 200，含节点在线数
ss -lntp | grep -E ':(3000|5432)'                      # 只应看到 127.0.0.1
docker compose ps                                      # panel(healthy)
docker stats --no-stream                               # 面板内存 ~150-250MB
```

浏览器侧：

- [ ] `/` 首页、`/login`、`/admin` 都能打开
- [ ] 登录后侧边栏菜单、明暗模式、中英文切换正常
- [ ] 系统设置里站点名与域名一致（订阅链接用它拼接）
- [ ] `/dashboard/subscriptions` 的订阅链接可以直接访问

---

## 7. 日常运维

```bash
cd /opt/sparrow/app/deploy

docker compose logs -f --tail 100 panel     # 日志
docker compose restart panel                # 重启
docker compose down                         # 停止（数据在 volume 里）
docker compose up -d --build                # 升级（会自动先跑迁移）
```

### 备份（每天一次，保留 14 天）

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

> `MASTER_KEY` 单独存一份到密码管理器——它不在数据库里，丢了备份也救不回节点密钥。

---

## 8. 节点服务器要装什么

节点是**另一台机器**（跑 sing-box / xray 的那个），只需要：

```bash
# 1. 内核（以 sing-box 为例，按官方文档装对应架构）
curl -fsSL https://sing-box.app/install.sh | sudo sh

# 2. Agent 二进制：在开发机交叉编译后 scp，或节点上装 Go 自己 make
cd /tmp && git clone git@github.com:define9/sparrow-proxy-panel.git
cd sparrow-proxy-panel/src/agent && make build
sudo install -m 755 bin/sparrow-agent /usr/local/bin/

# 3. 配置目录
sudo mkdir -p /etc/sparrow-agent /var/lib/sparrow-agent
sudo cp deploy/config.example.yaml /etc/sparrow-agent/config.yaml
sudo sed -i 's#https://panel.example.com#https://你的域名#' /etc/sparrow-agent/config.yaml

# 4. 注册（令牌在面板「节点管理 → 新建节点」里拿）
sudo sparrow-agent register -c /etc/sparrow-agent/config.yaml \
  --url https://你的域名 --token <一次性令牌>

# 5. 自检 + 常驻
sudo sparrow-agent doctor -c /etc/sparrow-agent/config.yaml
sudo cp deploy/sparrow-agent.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sparrow-agent
```

节点上**不需要** Node、Docker 或 PostgreSQL。

---

## 9. 常见问题

| 现象 | 处理 |
|---|---|
| `docker compose up` 构建时进程被杀 | 内存不足，没加 swap；`journalctl -k \| grep -i oom` 确认后按 §1.1 加 swap |
| `migrate` 服务 exited 1 | `docker compose logs migrate`；多半是 `.env` 里 `POSTGRES_PASSWORD` 与数据库不一致（volume 已初始化过） |
| 改了 `POSTGRES_PASSWORD` 后连不上 | 旧密码已写进 volume；要么改回去，要么 `docker compose down -v` 重来（会删数据） |
| `/setup` 403 | 公网访问且没设 `SETUP_TOKEN`；在 `.env` 设置后 `docker compose up -d` |
| 证书申请失败 | 域名未解析 / 80 端口被占（`ss -lntp \| grep :80`）/ 云厂商安全组没开 |
| 页面能开但登录跳回登录页 | `NEXT_PUBLIC_SITE_URL` 与实际域名不一致，或反代没传 `X-Forwarded-For` |
| 节点一直离线 | 节点上 `sparrow-agent doctor`，看 `panel` 检查项与注册是否成功 |
| 服务器重启后容器没起来 | `docker compose up -d` 一次即可；服务已设 `restart: unless-stopped`，但 compose 不会随开机自启，可执行 `sudo systemctl enable docker` |
