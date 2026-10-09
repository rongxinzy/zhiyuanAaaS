# WeKnora 原生接入：阶段 A 计划

关联：[Issue #158](https://github.com/rongxinzy/zhiyuanAaaS/issues/158)。本文件是技术实施与验证记录；产品范围以 [FR-KB-03 / ER-AC-11 / K1](https://github.com/rongxinzy/zhiyuan-docs/blob/main/product/README.md) 为唯一正文。

## 目标与边界

证明知识管理能力可以脱离 WeKnora UI，通过服务端 HTTP 调用完成最小闭环，为后续治理 API 和原生页面提供可复现证据。本阶段不交付生产管理 API、不改页面、不宣称企业用户权限已实现，不复制上游前端。

仅在独立本地测试环境创建带唯一前缀的临时库和测试资料，不访问客户文档、不修改既有模型/库/权限、不升级共享集群。不记录凭据、内部地址或原始响应。

## 执行顺序

1. 从远端主分支创建 `feat/knowledge-phase-a`，保留本地主分支及其他仓库现有改动。
2. 核对运行镜像 digest、知识 API、模型和解析依赖；记录实际版本，不把源码标签当成镜像版本。
3. 实现 Node 服务端 PoC 验证器：受控凭据、超时、固定路径、禁止重定向、响应校验、安全输出；必须显式批准临时资源写入才运行真实验证。
4. 先用 HTTP 测试服务覆盖成功、失败、超时、错误契约、权限拒绝和清理，再执行真实服务验证。
5. 验证建库→TXT/PDF 上传→分页读取→解析完成→分块预览→范围内检索命中→删除后消失，并验证未认证与无权凭据被拒绝。只删除本次创建的资源；中途失败也执行清理。
6. 对比原生接入与裁剪前端的依赖和认证成本。本阶段选型基于源码/HTTP 证据，不将未实施的微前端当作已测试方案。
7. 记录证据等级、阻碍和下一阶段接口需求，跑相关检查，提交并普通推送分支，创建 PR，更新 Issue #158；不自动关闭整个 issue、不自动合并 PR。

## 阶段 A 完成门

- 可重复运行的隔离 HTTP 回归测试通过。
- 真实验证输出逐项结果及资源清理结果；缺模型、凭据或解析依赖时失败并说明，不跳过后仍输出成功。
- 服务端调用不需要上游 UI；凭据不进入浏览器、报告和仓库。
- 明确区分上游认证/范围拒绝测试与知远用户/团队授权，后者属于下一阶段。
- TXT/PDF、预览与检索有真实证据才能标通过；未验证项保留，部分完成的 PR 必须明确限制。

## 验证记录

### 使用方式

Node.js 24 下执行 `npm run verify:knowledge:api`。验证器只接受服务端环境变量，不使用浏览器、管理账号密码或本地凭据文件：

| 环境变量 | 含义 |
| --- | --- |
| `ZHIYUAN_KNOWLEDGE_BASE_URL` | 上游 API 根地址，不含 `/api/v1`；允许 HTTPS 或本机 loopback HTTP；可以有反向代理路径前缀 |
| `ZHIYUAN_KNOWLEDGE_API_KEY` | 从受控凭据管理注入的测试空间凭据，不填写在本文件、命令历史或提交中 |
| `ZHIYUAN_KNOWLEDGE_EMBEDDING_MODEL_ID` | 已授权使用的 Embedding 模型 ID；探针不创建或修改模型 |
| `ZHIYUAN_KNOWLEDGE_ALLOW_TEMPORARY_WRITES` | 必须显式设为 `1`，批准创建并删除本次唯一前缀测试库及合成资料 |
| `ZHIYUAN_KNOWLEDGE_DENIED_API_KEY` | 可选：已经认证、可列出自己的库但无权访问本次新库的另一个测试凭据；缺少时报告 `not-tested` |

默认请求超时 30 秒，每个异步状态等待上限 180 秒。脚本不会跟随重定向，也不把原始响应/异常写入报告。输出包含检查名称、错误代码/HTTP 状态及清理结果；清理失败时包含本次资源 ID 和唯一名称供人工核对，不遍历或删除其他库。

`passed` 仅表示本次上游 HTTP 核心流程和临时库清理通过。`scopeAuthorizationVerified` 独立记录已认证凭据的范围拒绝；两者都不证明知远用户/团队授权已经实现。分块读取是解析内容预览证据，不替代未来原文件/图片下载的独立授权验收。

隔离回归：`npm test -- scripts/verify-knowledge-api.test.mjs`。该测试随现有 `npm test` 进入 CI，无需在 CI 中写入真实环境凭据或更改工作流。

### 2026-10-09：独立本地 K3s 验证

基线：AaaS `b47904b`（从远端 `origin/main` 新建分支）；本地 WeKnora API 使用现有 loopback 代理，未修改共享环境。凭据仅从现有 Kubernetes Secret 读取到本轮进程内存，不写文件。

只读核对时，当前测试空间的模型与库目录均为空。现有本地 embedding 路由返回 HTTP 200、512 维向量；本轮临时注册一条 Embedding 引用以测试，不改服务路由、不调用付费云模型、不更改既有资源。结束后经名称/描述确认归属，临时库和模型引用均已删除；通用验证器自身只使用显式传入的模型 ID。

运行镜像证据（只记录镜像名与 digest；tag 不等于固定源码版本）：

| 组件 | 本轮运行标识 |
| --- | --- |
| app `weknora-app:v0.8.0` | `sha256:fc5de799448a7d7566dd63ef228006daea5f951e58f24fd109c295b8942e3edd` |
| DocReader `docreader:latest` | `sha256:65207a15daea97d9dfb8c10ad2ca6f2a2a79e2f22b2a30641d220982418e2131` |
| frontend `weknora-frontend:latest` | `sha256:3580352b0f373e3ff7b765f53b66cd5b5a5e4db4ed03f097c531d0acd5544cf9` |
| MCP `weknora-mcp-server:latest` | `sha256:4d00525178dbdfcb5c02a43353a39583d4f6eced57ad20b2858a08c0675d4f6e` |

源码契约参考 [WeKnora v0.8.0 API 路由](https://github.com/Tencent/WeKnora/blob/1edcd54b43606d9079bb36650efe3f68707a79ea/internal/router/routes_knowledge.go)。本轮未获得镜像构建 commit，不能宣称运行镜像与该 commit 完全一致；核心端点以本轮真实请求结果为证据。MCP 仅记录镜像，本闭环不经过 MCP。

| 真实服务检查 | 结果 |
| --- | --- |
| 未认证、随机无效凭据读取 | 均 HTTP 401 |
| 模型预检、临时建库 | 通过 |
| TXT/PDF multipart 上传 | 两者通过 |
| 等待真实解析终态 | 两者 `completed` |
| 分页列表、读取分块中的唯一标记 | 两者通过 |
| 指定本轮库的检索命中与来源文档 ID | 两者通过 |
| 删除文档后详情 404、检索不再返回该文档 | 两者通过 |
| 临时库清理与临时模型引用清理 | 通过 |
| 两个已认证凭据的库范围隔离 | **未实测**；现有 Secret 只有服务凭据，无独立受限凭据；隔离 HTTP 回归覆盖拒绝/误放行，但不能替代真实服务证据 |
| 知远登录 → 业务 API → 企业用户授权 | **未实现**；属于阶段 B，不将直接上游探针冒充产品接入 |

真实探针 run ID：`66aa6e9c-3766-4e9a-9f03-ee4c957b7763`，`passed=true`、`cleanup=passed`、`scopeAuthorizationVerified=false`。测试文档仅包含合成唯一标记，不保存业务内容或原始上游响应。

### 选型与阶段 B 入口

建议继续使用知远原生界面与治理层适配器：本轮 HTTP 已证明建库、资料处理和检索不依赖上游管理 UI；现有 React 界面不需要为此引入 Vue 运行时。裁剪 WeKnora 前端尚未制作可运行 PoC，不宣称性能或维护成本已实测优于/劣于原生方案。

进入产品实现前，必须完成：

1. 配置上游受管模型与存储预检，避免空模型目录下只显示“服务健康”。本轮模型引用是临时测试资源，不是生产初始化方案。
2. 定义知远知识业务 API、版本化 DTO 和错误语义；修复现有代理查询参数丢失与上传复用探活超时的问题。
3. 定义租户/企业/用户与上游资源映射、管理/内容/检索/下载权限；提供独立受限测试主体，完成真实跨资源拒绝测试。
4. 建立操作审计、关联删除保护和撤销后的检索约束，再交付原生页面；用户无需 WeKnora 二次登录，凭据仅驻留服务端。

阶段 A **核心引擎闭环已验证**，权限隔离与前端嵌入对比仍有明确未验证项，不将其标为完整企业验收。

### 仓库验证

| 命令 | 本轮结果 |
| --- | --- |
| `npm test -- scripts/verify-knowledge-api.test.mjs` | 28/28，通过；覆盖 HTTP 成功/失败、超时、权限拒绝、清理失败及防误删 |
| `npm test` | 45 个测试文件、435/435，通过 |
| `npm run typecheck` | 通过 |
| `npm run build`、`npm run verify:bundle`、`npm run verify:manifest` | 通过 |
| `ZHIYUAN_ADMIN_WEKNORA_PORT=0 npm run verify:admin` | 通过；本机既有代理占用默认端口，临时测试使用随机端口，不改部署 |
| `npx biome check scripts/verify-knowledge-api.mjs scripts/verify-knowledge-api.test.mjs package.json` | 通过 |
| `git diff --check` | 通过 |
| `npm run check` | **未通过**：在 `lint` 被基线已有 5 项格式问题阻挡，涉及 `Models.tsx`、`Workbench.tsx`、`models-copy.ts`、`portal.ts`；与 `origin/main` 核对这些文件无 diff，本 PR 不混入无关格式修复 |

下一阶段前需补齐真实范围拒绝测试；PR 合并前仍须满足当前 CI 与维护者正式 approval，不以核心闭环成功替代门禁。
