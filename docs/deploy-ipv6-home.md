# 家庭机器 + 公网 IPv6 部署

面向：**只有公网 IPv6 地址、没有公网 IPv4 的家庭宽带/ VPS 机器**。

与常规部署的差异集中在三点：

| 项 | 常规（有域名 + IPv4） | 本场景 |
|---|---|---|
| 站点地址 | `https://panel.example.com` | `http://[240e::1]:8080` 或 `https://panel.example.com`（有域名时） |
| Docker | 默认只发 IPv4 端口 | 必须开 `ipv6: true`，否则容器端口只监听 IPv4 |
| 会话 cookie | 自动带 Secure | 纯 HTTP 时必须**不带** Secure（已自动处理） |

---

## 0. 三步速览

```bash
# 1. 装环境（开 Docker IPv6）
curl -fsSL https://raw.githubusercontent.com/define9/sparrow-proxy-panel/main/deploy/bootstrap.sh \
  | sudo bash -s -- --ipv6 --swap

# 2. 起服务（IPv6 直连，无反代）
git clone https://github.com/define9/sparrow-proxy-panel.git /opt/sparrow/app
cd /opt/sparrow/app/deploy
sudo ./up.sh --no-caddy \
  --site-url 'http://[240e::1]:8080' \
  --bind '' --port 8080

# 3. 初始化
# 浏览器打开 http://[240e::1]:8080/setup
# 初始化令牌：grep SETUP_TOKEN /opt/sparrow/app/deploy/.env
```

`up.sh` 的相关参数：

| 参数 | 说明 |
|---|---|
| `--site-url <url>` | 站点对外地址（订阅链接、支付回调用）。IPv6 要带方括号 |
| `--bind <addr>` | panel 监听地址。**留空**（`--bind ''`）= 所有接口；默认 `127.0.0.1` |
| `--port <n>` | panel 端口，默认 3000 |
| `--no-caddy` | 不启内置反代 |
| `--domain <d>` | 内置 Caddy 的站点（`:80` = 纯 HTTP） |

---

## 1. 为什么需要 `--ipv6`

Docker 默认的 bridge 网络**只给容器分 IPv4**，`ports:` 映射的端口也只在 IPv4 上监听：

```
$ ss -lntp | grep 8080
LISTEN 0 4096  0.0.0.0:8080  0.0.0.0:*     ← 只有 IPv4
```

IPv6-only 的机器上，外部用 `[240e::1]:8080` 连 → **连接超时**。

`bootstrap.sh --ipv6` 会写 `/etc/docker/daemon.json` 并重启 Docker：

```json
{
  "ipv6": true,
  "experimental": true,
  "fixed-cidr-v6": "fd00:dead:beef::/48"
}
```

验证：

```bash
docker info | grep -i ipv6          # 应有 IPv6 相关输出
docker network inspect sparrow_sparrow | grep -i ipv6
```

> 已有 `/etc/docker/daemon.json` 时脚本会**备份后合并** `ipv6` 键，不会覆盖你其它设置。

**不用 Docker 的话**（直接 systemd 跑 Node）：跳过本节，宿主机原生支持 IPv6。

---

## 2. 站点地址怎么填

### 2.1 IPv6 字面量必须带方括号

```
http://[240e::1]:8080      ✅
http://240e::1:8080        ❌ 非法 URL
```

`up.sh` 在无域名时会自动探测并加括号：

```bash
$ ip -6 addr show scope global | grep -oP 'inet6 \K[0-9a-f:]+'
240e:3b:1c12:5f00::1
$ grep SITE_URL /opt/sparrow/app/deploy/.env
SITE_URL=http://[240e:3b:1c12:5f00::1]:8080
```

### 2.2 拿到自己的公网 IPv6

```bash
# 取默认路由的源地址（就是公网地址）
ip -6 route get 2400:3200::1 2>/dev/null | grep -oP 'src \K\S+'

# 或看网卡上的全局地址
ip -6 addr show scope global | grep -oP 'inet6 \K[0-9a-f:]+' | head -1
```

### 2.3 `SITE_URL` 填什么

| 场景 | SITE_URL | SITE_DOMAIN |
|---|---|---|
| 有域名 + 想上 HTTPS | `https://panel.example.com` | `panel.example.com` |
| 只有 IPv6，裸 HTTP | `http://[240e::1]:8080` | `:80`（或用 `--no-caddy`） |
| 有域名但先不上 HTTPS | `http://panel.example.com` | `panel.example.com` |

**`SITE_URL` 必须是用户浏览器能访问到的地址**——订阅链接、支付回调用它。

---

## 3. 三种部署形态

### 3.1 纯 HTTP + 直连端口（最简单，适合先跑通）

没有域名、或暂时不上证书。panel 默认只监听 `127.0.0.1`（给反代用），
要直连就得让 `PANEL_BIND` 留空（= 所有接口，IPv4 + IPv6 都监听）：

```bash
cd /opt/sparrow/app/deploy
sudo ./up.sh --no-caddy \
  --site-url 'http://[240e::1]:8080' \
  --bind '' --port 8080
```

生成的 `.env`：

```
SITE_URL=http://[240e::1]:8080
PANEL_BIND=          ← 空 = 所有接口
PANEL_PORT=8080
```

之后想改这些值，直接改 `.env` 再 `sudo docker compose up -d` 即可。

验证：

```bash
curl -6 -s "http://[240e::1]:8080/api/v1/public/status"
sudo ss -lntp | grep 8080     # 应看到 [::]:8080
```

### 3.2 有域名 + HTTPS（推荐）

域名 AAAA 记录指向你的 IPv6：

```dns
panel.example.com.  IN  AAAA  240e:3b:1c12:5f00::1
```

```bash
cd /opt/sparrow/app/deploy
sudo ./up.sh --domain panel.example.com --email you@example.com
```

Caddy 会用 Let's Encrypt 签证书。**注意**：

- Let's Encrypt 验证走 IPv6（AAAA 记录生效）✅
- 但如果你的机器**没有公网 IPv4**，某些情况下 HTTP-01 验证会失败。失败时改用 DNS-01（需要 DNS 服务商的 API 凭据），或者用 `http://` 裸跑。

验证：

```bash
curl -6 -sI https://panel.example.com | head -3
```

### 3.3 已有反代（Nginx / Caddy 在宿主机上）

```bash
cd /opt/sparrow/app/deploy
sudo ./up.sh --no-caddy --domain panel.example.com
```

panel 只监听 `127.0.0.1:3000`，反代指向它：

```nginx
server {
    listen [::]:443 ssl http2;
    server_name panel.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 4. 防火墙

家用宽带通常有 IPv6 防火墙（路由器/光猫），**它和 iptables 是两层**，两边都要放行。

```bash
# 系统防火墙
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp      # HTTP/3（QUIC）
sudo ufw allow 22/tcp
sudo ufw enable

# 确认 Docker 没绕过防火墙（Docker 会直接改 iptables）
sudo iptables -L DOCKER-USER -n --line-numbers
```

**路由/光猫侧**：确认 IPv6 入站没有被默认拒绝。有些光猫默认开启 IPv6 防火墙，需要在管理页放行 80/443。

自查（从外网，不是在本机）：

```bash
# 用手机 4G/5G 流量（不是 WiFi）
curl -6 -sI http://[240e::1]:8080/
```

---

## 5. 常见问题

### 5.1 本机能访问，外网访问不了

按顺序排查：

```bash
# 1. 容器端口是否监听 IPv6
sudo ss -lntp | grep -E ':(80|443|3000|8080)'

# 2. Docker 是否开了 ipv6
docker info | grep -i ipv6

# 3. 宿主机的 IPv6 防火墙
sudo ip6tables -L INPUT -n | head -20

# 4. 路由/光猫侧是否拦截（最难查，需要从外部测试）
```

### 5.2 登录后立刻跳回登录页

**会话 cookie 的 Secure 属性**问题。纯 HTTP 部署时 cookie 不能带 `Secure`（浏览器会拒收）。

面板现在按 `SITE_URL` 自动判断（`https://` → 带 Secure，`http://` → 不带），并支持显式覆盖：

```bash
# deploy/.env
COOKIE_SECURE=0     # 纯 HTTP 部署：明确关闭
```

改完重启：

```bash
cd /opt/sparrow/app/deploy && sudo docker compose restart panel
```

### 5.3 订阅链接是 `http://localhost:3000/sub/xxx`

`NEXT_PUBLIC_*` 会被 Next 在**构建期**内联进前端 bundle，容器里改环境变量对它无效。

面板已修：客户端改用浏览器当前 origin（`window.location.origin`），服务端用**运行时** `SITE_URL`（不带 `NEXT_PUBLIC_` 前缀，不会被内联）。

如果你用的是旧镜像，升级即可：

```bash
cd /opt/sparrow/app && git pull && ./deploy/up.sh
```

确认：

```bash
grep SITE_URL /opt/sparrow/app/deploy/.env   # 必须是对外地址，不是 localhost
```

### 5.4 构建失败：拉不到 Google Fonts

旧版本用 `next/font/google`，**构建期**要访问 `fonts.googleapis.com`，纯净网络直接失败。

现在字体已自托管（`src/panel/fonts/`），构建零外网依赖。升级即可。

如果仍失败，检查 Docker 构建时能否出网：

```bash
docker run --rm alpine sh -c "wget -qO- https://registry.npmjs.org >/dev/null && echo 出网正常 || echo 出网失败"
```

### 5.5 面板访问不了 GitHub（Agent 分发失败）

面板 `/api/v1/public/agent/release` 是**实时代理 GitHub Release**（带 10 分钟缓存）。GitHub 不可达时接口返回 503。

```bash
# 检查容器能否访问 GitHub API
docker compose exec panel wget -qO- https://api.github.com/repos/define9/sparrow-proxy-panel/releases | head -5
```

不通的话：给面板配 `GITHUB_TOKEN` 提高限额，或让节点用 `--manifest` 指向自建 CDN。

### 5.6 `docker compose` 报 `no such service: migrate`

`migrate` 是一次性服务（跑完 `Exited(0)`）。用 `compose run` 而不是 `compose up`：

```bash
sudo docker compose run --rm migrator
```

---

## 6. 备份与升级

```bash
# 备份数据库（每天 3 点）
sudo tee /etc/cron.d/sparrow-backup >/dev/null <<'EOF'
0 3 * * * root cd /opt/sparrow/app/deploy && docker compose exec -T postgres pg_dump -U sparrow -Fc sparrow > /var/backups/sparrow/$(date +\%F).dump && find /var/backups/sparrow -name '*.dump' -mtime +14 -delete
EOF

# 升级
cd /opt/sparrow/app && git pull && ./deploy/up.sh
```

> `deploy/.env` 里的 `MASTER_KEY` 加密了节点密钥/插件密钥，**必须单独备份**，它不在数据库里。

---

## 7. 环境变量速查

| 变量 | 作用 | 默认 |
|---|---|---|
| `SITE_URL` | 站点对外地址（订阅链接、支付回调）。**改完重启即生效** | 无，必填 |
| `NEXT_PUBLIC_SITE_URL` | 兼容旧配置的别名 | 同 `SITE_URL` |
| `COOKIE_SECURE` | 会话 cookie 是否强制带 Secure | 按 `SITE_URL` 自动 |
| `SITE_DOMAIN` | 内置 Caddy 的监听站点（`:80` = 纯 HTTP） | 无，必填 |
| `MASTER_KEY` | 加密密钥，**不可更换** | 无，必填 |
| `SETUP_TOKEN` | `/setup` 初始化令牌 | 自动生成 |
| `AGENT_RELEASE_REPO` | Agent 发布仓库 | `define9/sparrow-proxy-panel` |
| `AGENT_RELEASE_TTL` | GitHub 缓存秒数 | `600` |
| `GITHUB_TOKEN` | 提高 GitHub 限额 | 空 |
