# Admin Console 模型网关 API 接入

模型网关继续使用 Admin Console 根 Ant Design 主题与最上级下划线页签。
页面通过现有内存会话与 AEP 协议传输访问管理接口，不直接访问 Prometheus、
Loki、Redis 或插件管理端口。

目标 AEP 服务必须提供公开契约 `openapi/aep-v1-gateway.openapi.yaml` 中的
`/aep/v1/admin/model-gateway/*` 接口。本 PR 不更新 SDK 或发布清单的固定输入；
清单目前固定的旧 AEP 提交不包含这些接口。连接旧服务时显示加载失败，
不使用测试数据降级。发布前需另行更新并验收 AEP 服务版本。

## 调用检测

先调用模型的 `test-access` 接口，再使用仅限该模型的短期授权发起原生
OpenAI-compatible JSON/SSE 或 Anthropic 请求。管理员也必须已获得该模型分配。
测试发送工具定义时，只查看原生响应，不执行工具、不自动续写或重试推理。
输出最多 256 KiB，超时 60 秒，支持取消。模型授权不进入浏览器持久存储。

Vite 开发、Vite preview 和内置静态服务器都提供受限的同源
`/aep/gateway-test` 流式代理。服务端配置：

- `ZHIYUAN_GATEWAY_ORIGIN`：网关 http(s) origin，默认 `http://localhost:8090`；
  不接受用户信息、路径、查询参数或片段。
- `VITE_AEP_BASE_URL`（Vite）或 `ZHIYUAN_AEP_BASE_URL`（静态服务器）：
  AEP 管理端地址。

代理仅接受 POST 到 `/v1/chat/completions` 或 `/{modelId}/v1/messages`，
不允许任意目标、配额路径或重定向；不会转发浏览器 Cookie 与身份 Header。
生产反向代理需将保留路径 `/aep/gateway-test/*` 路由到 Admin 服务器，
其他 `/aep/*` 路由到 AEP。仅部署静态文件时，需要提供等价的受限流式代理。
上游模型密钥仍由 Higress 管理，浏览器不接收该密钥。

## 用量与错误观测

原生结果来自 AEP 的 capabilities、metrics、health、requests 与请求详情接口。
团队、角色、用户、模型条件以及时间、分组、采样间隔由 API 查询处理。
前端只解码、格式化和绘制原生采样点，不累计原始记录、计算失败率或估算成本。
缺失值、NaN/Inf 显示“未提供”，曲线保留断点。

次数与 Token 卡片显示最新原生回看窗口的采样值，不是整个所选时段总量。
页面显示数据源、指标定义、单位与回看窗口；Prometheus usage 完成次数与
Loki access 请求次数、插件检测失败与 HTTP 错误的口径不同。
上游模型维度与目录模型维度由返回的定义注明。多团队/角色分组可重叠，
不能相加得到总量。部署级 QPS、原生非 5xx 比例与鉴权请求不受组织筛选影响。
请求日志只显示后端允许的元数据；游标分页中的错误过滤仅作用于已加载记录。
指标读取需要 `models.read`；请求日志与详情另外需要 `events.read`。
没有日志读取权限时仍可查看指标，但不会发起日志查询。
P95/P99 与成本统计未接入；成本展示“未提供”，不补造金额。

可选 `VITE_HIGRESS_GRAFANA_URL` 指向已有 http(s) Grafana 面板。
未配置原生数据源时显示不可用状态，而不是伪造零值。

## 限流与配额

限流规则支持全局、模型、用户、团队、角色，并可限定主体 × 模型。
管理入口要求 `models.read` 与 `data_plane.write`，分别用于回读与写入。
新增、更新和删除携带乐观版本；冲突保留表单，需刷新后重新确认。
保存与发布分别执行，应用状态来自 status 接口。
“配置已应用”与后端 `runtimeVerified` 分开展示，不宣称已经验证实际拦截。

余额配额仅支持指定用户，可读取、替换余额或增减余额；修改需确认。
不将限流规则的组织维度误称为余额配额维度。
