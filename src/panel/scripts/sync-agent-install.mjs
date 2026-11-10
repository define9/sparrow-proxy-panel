#!/usr/bin/env node
/**
 * 把 Agent 的安装脚本同步到面板 public/，让节点能 curl 到 /agent/install.sh。
 *
 *   node scripts/sync-agent-install.mjs
 *
 * install.sh 会随 Agent 版本演进，仓库里的这份是快照：
 * 构建面板前（prebuild）从 src/agent/deploy/install.sh 拷贝一次，
 * Docker 镜像里同样由 Dockerfile 再 COPY 一份，保证镜像不落后。
 *
 * 只同步纯文本脚本，**不同步二进制**——二进制在 GitHub Release，面板不托管。
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url)) // src/panel/scripts

export const SOURCE = resolve(HERE, '../../agent/deploy/install.sh')
export const TARGET = resolve(HERE, '../public/agent/install.sh')

function sync() {
  if (!existsSync(SOURCE)) {
    console.warn(`[sync-agent-install] 找不到 ${SOURCE}，跳过（不影响非完整仓库构建）`)
    return false
  }
  mkdirSync(dirname(TARGET), { recursive: true })
  copyFileSync(SOURCE, TARGET)
  chmodSync(TARGET, 0o755)
  return true
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (sync()) console.log(`[sync-agent-install] ${SOURCE} → ${TARGET}`)
}

export { sync }
