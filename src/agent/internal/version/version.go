package version

// Version 由发布流水线（GoReleaser）通过 ldflags 注入
var Version = "dev"

// Commit 注入的 git commit
var Commit = "unknown"

// BuildDate 注入的构建时间
var BuildDate = "unknown"
