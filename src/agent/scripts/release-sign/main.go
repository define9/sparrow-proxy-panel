// Command release-sign 生成/校验 sparrow-agent 版本清单（latest.json）的 ed25519 签名。
//
// 它直接复用 internal/update 的 canonical JSON 与验签实现，保证发布端与 Agent 端
// 逐字节一致，不会出现"签名规则各写一遍"的漂移。
//
// 用法：
//
//	go run ./scripts/release-sign keygen
//	go run ./scripts/release-sign sign   --key release.key --manifest dist/latest.json
//	go run ./scripts/release-sign verify --pub "ed25519:…" --manifest dist/latest.json
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	"sparrow/agent/internal/update"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "keygen":
		err = cmdKeygen(os.Args[2:])
	case "sign":
		err = cmdSign(os.Args[2:])
	case "verify":
		err = cmdVerify(os.Args[2:])
	case "help", "-h", "--help":
		usage()
		return
	default:
		usage()
		fmt.Fprintf(os.Stderr, "未知子命令 %q\n", os.Args[1])
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "错误: %v\n", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `release-sign —— sparrow-agent 版本清单签名工具

用法:
  release-sign keygen [--out-prefix release]      生成 ed25519 密钥对
  release-sign sign   --key <私钥文件> [--manifest <清单>] [--out <输出>]
  release-sign verify --pub <公钥> --manifest <清单>

说明:
  - 签名对象是清单 sha256 字典的 canonical JSON（键按字母序、","/":" 分隔、无空格）。
  - 私钥文件内容可以是 base64(32 字节 seed)、base64(64 字节) 或 PEM(PKCS8)。
  - 公钥可写 base64、ed25519:base64 或 PEM，可直接粘到 config.yaml 的 update.public_key。
`)
}

func cmdKeygen(args []string) error {
	fs := flag.NewFlagSet("keygen", flag.ExitOnError)
	prefix := fs.String("out-prefix", "release", "输出文件前缀")
	_ = fs.Parse(args)

	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return fmt.Errorf("生成密钥失败: %w", err)
	}

	privPath := *prefix + ".key"
	pubPath := *prefix + ".pub"
	privBody := "ed25519:" + base64.StdEncoding.EncodeToString(priv.Seed()) + "\n"
	pubBody := "ed25519:" + base64.StdEncoding.EncodeToString(pub) + "\n"

	if err := os.WriteFile(privPath, []byte(privBody), 0o600); err != nil {
		return err
	}
	if err := os.WriteFile(pubPath, []byte(pubBody), 0o644); err != nil {
		return err
	}

	fmt.Printf("私钥: %s（0600，务必离线保存）\n公钥: %s\n\n把公钥填入 config.yaml：\n\nupdate:\n  public_key: %q\n",
		privPath, pubPath, strings.TrimSpace(pubBody))
	return nil
}

func cmdSign(args []string) error {
	fs := flag.NewFlagSet("sign", flag.ExitOnError)
	keyPath := fs.String("key", "", "私钥文件（base64 或 PEM）")
	manifestPath := fs.String("manifest", "latest.json", "清单路径")
	outPath := fs.String("out", "", "输出路径（默认原地覆盖）")
	_ = fs.Parse(args)

	if *keyPath == "" {
		return fmt.Errorf("--key 必填")
	}

	rawKey, err := os.ReadFile(*keyPath)
	if err != nil {
		return fmt.Errorf("读取私钥失败: %w", err)
	}
	priv, err := update.ParsePrivateKey(string(rawKey))
	if err != nil {
		return err
	}

	release, err := readRelease(*manifestPath)
	if err != nil {
		return err
	}
	if len(release.SHA256) == 0 {
		return fmt.Errorf("清单 %s 没有 sha256 字典，先跑 scripts/release.sh 生成", *manifestPath)
	}

	sig, err := update.SignSHA256JSON(priv, release.SHA256)
	if err != nil {
		return err
	}
	release.Sig = sig

	out := *outPath
	if out == "" {
		out = *manifestPath
	}
	if err := writeRelease(out, release); err != nil {
		return err
	}

	fmt.Printf("已签名 %s（%d 个平台）\nsignature: %s\n", out, len(release.SHA256), sig)
	return nil
}

func cmdVerify(args []string) error {
	fs := flag.NewFlagSet("verify", flag.ExitOnError)
	pubKey := fs.String("pub", "", "公钥（base64 / ed25519:base64 / PEM）")
	manifestPath := fs.String("manifest", "latest.json", "清单路径")
	_ = fs.Parse(args)

	if *pubKey == "" {
		return fmt.Errorf("--pub 必填")
	}

	release, err := readRelease(*manifestPath)
	if err != nil {
		return err
	}
	if err := update.VerifySHA256JSON(*pubKey, release.SHA256, release.Sig); err != nil {
		return err
	}
	fmt.Printf("验签通过: %s（version=%s channel=%s）\n", *manifestPath, release.Version, release.Channel)
	return nil
}

func readRelease(path string) (*update.Release, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取清单失败: %w", err)
	}
	var release update.Release
	if err := json.Unmarshal(raw, &release); err != nil {
		return nil, fmt.Errorf("解析清单失败: %w", err)
	}
	return &release, nil
}

func writeRelease(path string, release *update.Release) error {
	encoded, err := json.MarshalIndent(release, "", "  ")
	if err != nil {
		return err
	}
	encoded = append(encoded, '\n')
	return os.WriteFile(path, encoded, 0o644)
}
