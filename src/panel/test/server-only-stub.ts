// `server-only` 在 Next 里由打包器注入（客户端导入会直接报错）。
// 单元测试跑在 node 环境，用这个空模块替代。
export {}
