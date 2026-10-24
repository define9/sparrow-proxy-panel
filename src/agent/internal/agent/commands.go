package agent

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/sparrows/sparrow-agent/internal/client"
	"github.com/sparrows/sparrow-agent/internal/logger"
)

// commandLoop 命令长轮询循环：最长 25s 拉取一次命令，执行后回执。
func (a *Agent) commandLoop(ctx context.Context) {
	timeout := a.cfg.Agent.CommandPollTimeout.Duration()
	bo := newBackoff(timeout, a.cfg.Agent.MaxBackoff.Duration())

	for {
		err := a.pollCommands(ctx)
		wait := time.Duration(0)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				a.log.Warn("拉取命令失败", "error", err.Error())
			}
			wait = bo.next()
		} else {
			bo.reset()
		}
		if wait > 0 {
			if !sleep(ctx, wait) {
				return
			}
			continue
		}
		if !sleep(ctx, 100*time.Millisecond) {
			return
		}
	}
}

// pollCommands 拉取并执行一批命令。
func (a *Agent) pollCommands(ctx context.Context) error {
	reqCtx, cancel := context.WithTimeout(ctx, a.cfg.Agent.CommandPollTimeout.Duration()+5*time.Second)
	defer cancel()

	resp, err := a.api.FetchCommands(reqCtx)
	if err != nil {
		return err
	}
	if resp == nil || len(resp.Commands) == 0 {
		return nil
	}
	for _, cmd := range resp.Commands {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		a.executeCommand(ctx, cmd)
	}
	return nil
}

// executeCommand 执行一条命令并回执。
func (a *Agent) executeCommand(ctx context.Context, cmd client.AgentCommand) {
	a.log.Info("收到命令", "id", cmd.Id.String(), "command", string(cmd.Command))
	a.metrics.Inc("sparrow_agent_command_total", map[string]string{"command": string(cmd.Command)})

	result, err := a.runCommand(ctx, cmd)
	ack := client.AgentCommandAck{Status: client.Success}
	if err != nil {
		a.log.Error("命令执行失败", "id", cmd.Id.String(), "command", string(cmd.Command), "error", err.Error())
		ack.Status = client.Failed
		msg := err.Error()
		ack.Error = &msg
	} else {
		payload := map[string]any{}
		for k, v := range result {
			payload[k] = v
		}
		ack.Result = &payload
	}

	ackCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := a.api.AckCommand(ackCtx, cmd.Id.String(), ack); err != nil {
		a.log.Error("命令回执失败", "id", cmd.Id.String(), "error", err.Error())
	}
}

// runCommand 按类型执行命令。
func (a *Agent) runCommand(ctx context.Context, cmd client.AgentCommand) (map[string]any, error) {
	switch cmd.Command {
	case client.ReloadConfig:
		// 重新拉取并应用配置
		if err := a.syncConfig(ctx); err != nil {
			return nil, err
		}
		return map[string]any{"version": a.configVersionValue()}, nil
	case client.RestartCore:
		if err := a.core.Restart(ctx); err != nil {
			return nil, err
		}
		return map[string]any{"restarted": true}, nil
	case client.SyncNow:
		if err := a.syncConfig(ctx); err != nil {
			return nil, err
		}
		if err := a.flushOutbox(ctx); err != nil {
			return nil, err
		}
		return map[string]any{"version": a.configVersionValue()}, nil
	case client.SetLogLevel:
		level, _ := cmd.Payload["level"].(string)
		if level == "" {
			return nil, errors.New("命令缺少 level 参数")
		}
		newLevel, err := logger.ParseLevel(level)
		if err != nil {
			return nil, err
		}
		if err := a.setLogLevel(newLevel); err != nil {
			return nil, err
		}
		return map[string]any{"level": level}, nil
	case client.UpgradeCore:
		return nil, errors.New("暂不支持升级内核（Agent 侧自更新尚未实现）")
	case client.UpdateAgent:
		return nil, errors.New("暂不支持 Agent 自更新")
	default:
		return nil, fmt.Errorf("未知命令类型 %q", cmd.Command)
	}
}
