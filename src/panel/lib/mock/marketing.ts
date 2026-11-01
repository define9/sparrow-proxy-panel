/** 首页专用的演示数据（catalog 里没有的部分：延迟、FAQ、价值点）。 */

export const avgLatencyMs = 32

export const heroHighlights = [
  '开源可审计，数据留在自己的服务器',
  '支付宝 / Stripe 双支付通道',
  '订阅链接按客户端格式自动渲染'
]

export const faqs = [
  {
    question: 'Sparrow Panel 是什么？',
    answer:
      '一套自托管的代理服务运营面板：商品与套餐售卖、订单支付、订阅分发、流量配额、节点管理都在同一个后台完成，配套 Agent 负责节点上的协议进程与流量上报。'
  },
  {
    question: '需要自己准备服务器吗？',
    answer:
      '需要。Panel 与节点都由你自己部署，我们只提供软件。一台 2 核 4G 的机器就足够跑 Panel，节点按实际线路需求增加。'
  },
  {
    question: '支持哪些客户端？',
    answer:
      '订阅可输出 V2Ray、Clash 与 sing-box 三种格式，覆盖 Windows、macOS、iOS、Android 与路由器固件。'
  },
  {
    question: '流量用完了怎么办？',
    answer:
      '订阅会按套餐周期自动重置流量，也可以在控制台随时升级套餐，剩余流量按比例折算，不会清零重来。'
  },
  {
    question: '支付渠道可以换吗？',
    answer:
      '可以。支付是插件化实现，内置易支付与 Stripe，也可以按插件规范接入自己的通道，回调与对账逻辑复用面板能力。'
  },
  {
    question: '数据可以迁移或备份吗？',
    answer:
      '面板数据存放在你自有的 PostgreSQL 中，订单、订阅与用户都可以直接导出；节点配置由 Agent 从面板拉取，重建节点只需重新注册。'
  }
]
