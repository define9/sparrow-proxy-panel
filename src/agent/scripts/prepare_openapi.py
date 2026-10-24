#!/usr/bin/env python3
"""预处理面板 OpenAPI 文档，为 Agent 端生成客户端做准备。

背景：
    契约（packages/contracts/openapi.json）里所有整型字段的取值上限都是
    2^53-1（字节数），而 oapi-codegen 默认把 `type: integer` 生成为 Go 的
    `int`。Agent 需要运行在 32 位平台（linux/armv7、linux/mips）上，此时
    `int` 只有 32 位，单个用户的流量超过 2GiB 就会溢出。

做法：
    读取**只读**的契约文件，在整型字段上注入 `x-go-type: int64`
    （oapi-codegen 的官方扩展），输出到临时文件供 oapi-codegen 使用。

用法：
    python3 scripts/prepare_openapi.py ../../packages/contracts/openapi.json .gen/openapi.json

注意：本脚本不会修改 packages/contracts/** 下的任何文件。
"""

from __future__ import annotations

import json
import os
import sys


def inject_int64(node: object) -> None:
    """递归地把整型 schema 标记为 int64。"""
    if isinstance(node, dict):
        if node.get("type") == "integer" and "properties" not in node and "items" not in node:
            node.setdefault("x-go-type", "int64")
        for key, value in node.items():
            if key == "anyOf" and isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and item.get("type") == "integer":
                        item.setdefault("x-go-type", "int64")
                    else:
                        inject_int64(item)
            else:
                inject_int64(value)
    elif isinstance(node, list):
        for item in node:
            inject_int64(item)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2

    src, dst = argv[1], argv[2]
    with open(src, "r", encoding="utf-8") as fh:
        spec = json.load(fh)

    schemas = spec.get("components", {}).get("schemas", {})
    for schema in schemas.values():
        inject_int64(schema)

    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(spec, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
