package metrics

import (
	"strings"
	"testing"
)

// TestCounterAndGauge 校验计数器与仪表的输出。
func TestCounterAndGauge(t *testing.T) {
	reg := New()
	reg.SetHelp("demo_total", "示例计数器")
	reg.Inc("demo_total", map[string]string{"result": "success"})
	reg.Inc("demo_total", map[string]string{"result": "success"})
	reg.Inc("demo_total", map[string]string{"result": "failure"})
	reg.Set("demo_alive", nil, 1)

	var sb strings.Builder
	reg.Render(&sb)
	out := sb.String()
	for _, want := range []string{
		"# HELP demo_total 示例计数器",
		"# TYPE demo_total counter",
		`demo_total{result="failure"} 1`,
		`demo_total{result="success"} 2`,
		"# TYPE demo_alive gauge",
		"demo_alive 1",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("输出缺少 %q:\n%s", want, out)
		}
	}
}

// TestValue 校验指标值读取。
func TestValue(t *testing.T) {
	reg := New()
	reg.Inc("hits", nil)
	reg.Inc("hits", map[string]string{"path": "/a"})
	if got := reg.Value("hits", nil); got != 1 {
		t.Fatalf("hits = %v", got)
	}
	if got := reg.Value("hits", map[string]string{"path": "/a"}); got != 1 {
		t.Fatalf("hits{path=/a} = %v", got)
	}
	if got := reg.Value("missing", nil); got != 0 {
		t.Fatalf("不存在的指标应为 0，实际 %v", got)
	}
}
