#!/usr/bin/env python3
"""集成脚本：合并 worker 分支后，自动接线 i18n locale 文件与导航项。

用法（在仓库根目录执行）：
    python3 tools/wire_after_merge.py

做两件事：
1. 扫描 src/panel/i18n/locales/<domain>.<locale>.json，把 <domain>.*.json 注册进
   nuxt.config.ts 的 i18n.locales[].files 数组（按字母序，稳定可重复执行）。
2. 扫描 src/panel/app/utils/nav/<domain>.ts，把导出的 NavEntry[] 合并进
   app/utils/navigation.ts 的 userNav / adminNav（按 <domain> 顺序插入）。
"""
import re
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PANEL = ROOT / "src/panel"
LOCALES = PANEL / "i18n/locales"
NAV_DIR = PANEL / "app/utils/nav"
NAV_FILE = PANEL / "app/utils/navigation.ts"
NUXT_CONFIG = PANEL / "nuxt.config.ts"


def wire_i18n() -> list[str]:
    files = sorted(p.name for p in LOCALES.glob("*.json"))
    base = {"zh-CN.json", "en.json"}
    extra_zh = [f for f in files if f.endswith(".zh-CN.json")]
    extra_en = [f for f in files if f.endswith(".en.json")]

    text = NUXT_CONFIG.read_text()

    def repl(code: str, extra: list[str]) -> None:
        nonlocal text
        # 匹配该 locale 的定义块，替换其中的 file: 'xxx.json'
        pattern = re.compile(
            r"(\{ code: '" + re.escape(code) + r"'.*?file: ')([^']+)(')",
            re.S,
        )
        m = pattern.search(text)
        if not m:
            print(f"! 未找到 locale {code} 的定义")
            return
        merged = base | set(extra)
        ordered = [f for f in sorted(merged) if f in {m.group(2)} | set(extra)]
        text = pattern.sub(lambda mm: mm.group(1) + ", ".join(f"'{f}'" for f in ordered) + mm.group(3), text, count=1)

    repl("zh-CN", extra_zh)
    repl("en", extra_en)
    NUXT_CONFIG.write_text(text)
    return extra_zh + extra_en


NAV_HEADER = """// ── 由 tools/wire_after_merge.py 自动合并（各业务域片段）──
"""


def wire_nav() -> list[str]:
    fragments = sorted(NAV_DIR.glob("*.ts")) if NAV_DIR.exists() else []
    if not fragments:
        return []

    text = NAV_FILE.read_text()
    imports = []
    entries = []
    for frag in fragments:
        domain = frag.stem
        imports.append(f"import {{ {domain}Nav }} from './nav/{domain}'")
        entries.append(f"\nexport const {domain}Nav: NavEntry[] = {domain}NavRaw")
        entries.append(f"const {domain}NavRaw: NavEntry[] = []")

    if "// ── 自动合并" in text:
        print("· 导航片段已存在，跳过（请手工确认）")
        return [f.stem for f in fragments]

    # 1) 追加 import
    text = text.replace(
        "import { PERMISSIONS } from '@sparrow/contracts/permissions'",
        "import { PERMISSIONS } from '@sparrow/contracts/permissions'\n" + "\n".join(imports),
    )
    # 2) 在文件末尾追加片段导出
    text += "\n" + NAV_HEADER + "\n" + "\n".join(entries) + "\n"
    NAV_FILE.write_text(text)
    return [f.stem for f in fragments]


if __name__ == "__main__":
    i18n = wire_i18n()
    nav = wire_nav()
    print("✔ i18n 已注册：", i18n or "（无新增）")
    print("✔ 导航片段：", nav or "（无新增）")
    print("⚠ 导航片段内容需人工填入，请检查 app/utils/navigation.ts")
    sys.exit(0)
