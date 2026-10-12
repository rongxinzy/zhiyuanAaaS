# 请求详情关联验收

截图来自本地 Kind 集群的 Admin Console `http://127.0.0.1:5197/#model-gateway/observe`。
数据经过 gateway-authorizer、Higress、Vector、Loki 和 AEP 请求详情 API，调用对象为明确配置的 mock 模型，不是云模型或前端生成数据。

- `desktop-light.png` / `desktop-dark.png`：1440 × 1400 桌面视口。
- `narrow-light.png` / `narrow-dark.png`：392 × 1400 窄视口，详情抽屉无水平溢出。
- 同一请求 ID 分别显示网关与鉴权记录；网关的 Token 和毫秒耗时来自插件，鉴权未提供的字段保持“未提供”。
- 背景统计中的“未提供”可能是查询窗口内没有新调用，不能当作零或用旧数据回填。截图主要验证逐请求关联详情；聚合耗时已另经原生 Prometheus 和本地集群 API 验收。

发布关联能力需先部署 [AEP 请求 ID 修复 PR #259](https://github.com/rongxinzy/Agent-Enterprise-Protocol/pull/259) 的鉴权服务和访问日志 EnvoyFilter。历史 ID 不回写。
