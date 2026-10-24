// sparrow-agent 是部署在代理节点上的 CLI 程序。
//
// 详细设计见 docs/architecture/agent-cli.md。
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/sparrows/sparrow-agent/internal/version"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	switch os.Args[1] {
	case "version", "-v", "--version":
		fmt.Printf("sparrow-agent %s (commit %s, built %s)\n", version.Version, version.Commit, version.BuildDate)
	case "run":
		fs := flag.NewFlagSet("run", flag.ExitOnError)
		config := fs.String("c", "/etc/sparrow-agent/config.yaml", "配置文件路径")
		_ = fs.Parse(os.Args[2:])
		fmt.Printf("sparrow-agent run: 读取配置 %s（功能开发中，见 docs/architecture/agent-cli.md）\n", *config)
	case "doctor":
		fmt.Println("sparrow-agent doctor: 自检功能开发中")
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `用法:
  sparrow-agent run [-c config.yaml]   前台运行
  sparrow-agent register               注册节点
  sparrow-agent status                 查看状态
  sparrow-agent doctor                 自检
  sparrow-agent update [--check]       自更新
  sparrow-agent version                版本信息`)
}
