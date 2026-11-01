import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'

type Tone = 'success' | 'warning' | 'destructive' | 'info' | 'secondary' | 'outline'

const MAP: Record<string, { tone: Tone; label: string }> = {
  // 订单
  pending: { tone: 'warning', label: '待支付' },
  paid: { tone: 'success', label: '已支付' },
  cancelled: { tone: 'secondary', label: '已取消' },
  expired: { tone: 'outline', label: '已过期' },
  refunded: { tone: 'destructive', label: '已退款' },
  // 订阅
  active: { tone: 'success', label: '生效中' },
  paused: { tone: 'warning', label: '已暂停' },
  // 节点
  online: { tone: 'success', label: '在线' },
  offline: { tone: 'destructive', label: '离线' },
  maintenance: { tone: 'warning', label: '维护中' },
  // 插件 / 服务
  installed: { tone: 'success', label: '已安装' },
  disabled: { tone: 'secondary', label: '已禁用' },
  error: { tone: 'destructive', label: '异常' },
  installing: { tone: 'info', label: '安装中' },
  healthy: { tone: 'success', label: '健康' },
  unhealthy: { tone: 'destructive', label: '异常' },
  unknown: { tone: 'outline', label: '未知' },
  // 用户
  verified: { tone: 'success', label: '已验证' },
  unverified: { tone: 'warning', label: '未验证' },
  banned: { tone: 'destructive', label: '已封禁' },
  // 日志
  info: { tone: 'info', label: 'INFO' },
  warn: { tone: 'warning', label: 'WARN' },
  // 商品
  draft: { tone: 'outline', label: '草稿' },
  inactive: { tone: 'secondary', label: '已下架' }
}

export function StateBadge({ status, className }: { status: string; className?: string }) {
  const conf = MAP[status]
  if (!conf) {
    return (
      <Badge variant="outline" className={className}>
        {status}
      </Badge>
    )
  }
  return (
    <Badge variant={conf.tone} className={cn('font-medium', className)}>
      {conf.label}
    </Badge>
  )
}
