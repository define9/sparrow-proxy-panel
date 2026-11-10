#!/usr/bin/env bash
# ============================================================
# install.sh 的清单解析单元测试
#
#   sh deploy/install_test.sh
#
# 覆盖：
#   - 新格式 assets[platform] = { url, sha256 }
#   - 旧格式 assets[platform] = "url" + sha256[platform]
#   - 相对地址（以 / 开头）与绝对地址
#   - 平台缺失时的错误提示（列出可用平台）
#   - 清单来源优先级：--manifest > /api/v1/public/agent/release > /agent/latest.json
#   - sha256 缺失 / 格式非法时的行为
# ============================================================
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INSTALL="$SCRIPT_DIR/install.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM HUP

PASS=0
FAIL=0

ok() {
  PASS=$((PASS + 1))
  printf '  \033[32m✓\033[0m %s\n' "$1"
}

bad() {
  FAIL=$((FAIL + 1))
  printf '  \033[31m✗\033[0m %s\n' "$1"
  [ -n "${2:-}" ] && printf '      %s\n' "$2"
}

SHA_A=280fe828b60b90ee0b5dd5d8e940a06cc258d7acaf292cf04a71ba5f2c2e738b
SHA_B=98cdfce8e4a8db2518b76b0fe732f101ef590ec9eb4f44edaba18db95dd4e6bd

# ---------------------------------------------------------------- 夹具

new_format() {
  cat >"$TMP/new.json" <<JSON
{
  "version": "0.1.0",
  "channel": "stable",
  "source": "github",
  "repo": "define9/sparrow-proxy-panel",
  "tag": "agent/v0.1.0",
  "assets": {
    "linux-amd64": { "url": "https://github.com/o/r/releases/download/agent%2Fv0.1.0/sparrow-agent-linux-amd64", "sha256": "$SHA_A" },
    "linux-arm64": { "url": "https://github.com/o/r/releases/download/agent%2Fv0.1.0/sparrow-agent-linux-arm64", "sha256": "$SHA_B" }
  },
  "installScript": "/agent/install.sh",
  "signature": ""
}
JSON
}

old_format() {
  cat >"$TMP/old.json" <<JSON
{
  "version": "0.1.0",
  "assets": {
    "linux-amd64": "https://example.com/agent-amd64",
    "linux-arm64": "https://example.com/agent-arm64"
  },
  "sha256": {
    "linux-amd64": "$SHA_A",
    "linux-arm64": "$SHA_B"
  }
}
JSON
}

relative_format() {
  cat >"$TMP/rel.json" <<JSON
{
  "version": "0.1.0",
  "source": "custom-url",
  "assets": {
    "linux-amd64": { "url": "/agent/sparrow-agent-linux-amd64", "sha256": "$SHA_A" }
  }
}
JSON
}

no_sha_format() {
  cat >"$TMP/nosha.json" <<JSON
{
  "version": "0.1.0",
  "assets": { "linux-amd64": { "url": "https://example.com/a" } }
}
JSON
}

broken_format() {
  printf '{ this is not json ' >"$TMP/broken.json"
}

# 用指定平台跑一次 dry-run（install.sh 支持 SPARROW_PLATFORM 显式指定平台键）
run_with_platform() {
  SPARROW_PLATFORM="$1" \
    sh "$INSTALL" --url "${2:-http://panel.test}" --manifest "$3" --dry-run 2>&1
}

echo "==> install.sh 清单解析测试"

# ---------------------------------------------------------------- 1. 新格式
new_format
out=$(SPARROW_PLATFORM=linux-amd64 sh "$INSTALL" --url http://panel.test --manifest "$TMP/new.json" --dry-run 2>&1)
if printf '%s' "$out" | grep -q "sparrow-agent-linux-amd64" && printf '%s' "$out" | grep -q "$SHA_A"; then
  ok "新格式：解析出 url 与 sha256"
else
  bad "新格式：解析出 url 与 sha256" "$out"
fi

# ---------------------------------------------------------------- 2. 旧格式
old_format
out=$(SPARROW_PLATFORM=linux-amd64 sh "$INSTALL" --url http://panel.test --manifest "$TMP/old.json" --dry-run 2>&1)
if printf '%s' "$out" | grep -q "https://example.com/agent-amd64" && printf '%s' "$out" | grep -q "$SHA_A"; then
  ok "旧格式：assets[platform]=url + sha256[] 仍可解析"
else
  bad "旧格式：assets[platform]=url + sha256[] 仍可解析" "$out"
fi

# ---------------------------------------------------------------- 3. 相对地址
relative_format
out=$(SPARROW_PLATFORM=linux-amd64 sh "$INSTALL" --url https://panel.example.com --manifest "$TMP/rel.json" --dry-run 2>&1)
if printf '%s' "$out" | grep -q "https://panel.example.com/agent/sparrow-agent-linux-amd64"; then
  ok "相对地址：与面板地址拼接"
else
  bad "相对地址：与面板地址拼接" "$out"
fi

# ---------------------------------------------------------------- 4. 平台缺失
new_format
out=$(SPARROW_PLATFORM=linux-riscv64 sh "$INSTALL" --url http://panel.test --manifest "$TMP/new.json" --dry-run 2>&1)
if printf '%s' "$out" | grep -q "没有当前平台" && printf '%s' "$out" | grep -q "linux-amd64"; then
  ok "平台缺失：报错并列出可用平台"
else
  bad "平台缺失：报错并列出可用平台" "$out"
fi

# ---------------------------------------------------------------- 5. 缺 sha256
no_sha_format
out=$(SPARROW_PLATFORM=linux-amd64 sh "$INSTALL" --url http://panel.test --manifest "$TMP/nosha.json" --dry-run 2>&1)
if printf '%s' "$out" | grep -qiE "sha256|校验"; then
  ok "缺 sha256：提示无法校验"
else
  bad "缺 sha256：提示无法校验" "$out"
fi

# ---------------------------------------------------------------- 6. 清单损坏
broken_format
out=$(SPARROW_PLATFORM=linux-amd64 sh "$INSTALL" --url http://panel.test --manifest "$TMP/broken.json" --dry-run 2>&1)
if printf '%s' "$out" | grep -qiE "清单|解析|失败|错误"; then
  ok "清单损坏：报错而非静默继续"
else
  bad "清单损坏：报错而非静默继续" "$out"
fi

# ---------------------------------------------------------------- 7. 清单来源顺序
# 显式 --manifest 优先于面板接口
new_format
out=$(SPARROW_PLATFORM=linux-amd64 sh "$INSTALL" --url http://panel.test --manifest "$TMP/new.json" --dry-run 2>&1)
if printf '%s' "$out" | grep -q "github.com/o/r"; then
  ok "来源优先级：--manifest 覆盖面板接口"
else
  bad "来源优先级：--manifest 覆盖面板接口" "$out"
fi

# ---------------------------------------------------------------- 8. 默认来源包含新接口
# 用一个假的面板地址，确认它会依次尝试新接口与旧路径
out=$(SPARROW_PLATFORM=linux-amd64 sh "$INSTALL" --url http://127.0.0.1:1 --dry-run 2>&1)
if printf '%s' "$out" | grep -qE "api/v1/public/agent/release|agent/latest.json"; then
  ok "默认来源：新接口优先、旧路径兜底"
else
  bad "默认来源：新接口优先、旧路径兜底" "$out"
fi

# ---------------------------------------------------------------- 9. install.sh 语法
if sh -n "$INSTALL" 2>/dev/null; then
  ok "install.sh 语法正确"
else
  bad "install.sh 语法正确"
fi

# ---------------------------------------------------------------- 10. release.sh 语法
RELEASE_SH="$SCRIPT_DIR/../scripts/release.sh"
if sh -n "$RELEASE_SH" 2>/dev/null; then
  ok "release.sh 语法正确"
else
  bad "release.sh 语法正确"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32m全部通过\033[0m（%d 项）\n' "$PASS"
  exit 0
fi
printf '\033[31m失败 %d 项\033[0m（通过 %d 项）\n' "$FAIL" "$PASS"
exit 1
