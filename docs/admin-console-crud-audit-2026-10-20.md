# Admin Console CRUD 评估与修复（2026-10-20）

评估人：Codex。初始源码基线：AaaS main `4125412ed1852e6707f1335948a2a2cd3b23db3c`、
AEP main `e44fc2448faaf10e1c2f41aaff5f75b4ead99f79`、governance main
`65800a75d0d2efdcf00fb6f2ac387587bbeafab5`；Console 锁定 SDK 为 `0.3.0`。
这些是审查基线，不代表实际运行的服务版本。后续 main `cad5266` 已包含 #235。

主要 CRUD 正常路径已有组件和浏览器测试，不能据此认定异常路径或权限模型完整。
本次确认并提交 5 项行为修复；落实“权限只赋予角色”仍有两类跨服务迁移事项。

## 行为缺陷与修复状态

| 编号 | 触发条件、原因与原行为 | 修复后行为 | PR / 状态 |
| --- | --- | --- | --- |
| F1 · P1 | 编辑用户或调整组织把多团队 `teamIds` 截成首项，再全量替换 RBAC，无提示撤销其余团队关系 | 两个表单均支持多选并保留完整集合；显式移除才删除对应关系 | [#236](https://github.com/rongxinzy/zhiyuanAaaS/pull/236)，已提交，待合并 |
| F2 · P2 | Skill、模型、凭据授权只读取第一页，忽略 `nextCursor`；后端默认 50 条，SDK 方法未提供分页参数 | 使用既有认证传输读取所有页；后续页失败不伪装成完整成功，检测重复游标 | [#235](https://github.com/rongxinzy/zhiyuanAaaS/pull/235)，已合并 |
| F3 · P2 | 用户资料更新成功、独立的 RBAC 更新失败，只提示通用失败且不刷新已提交资料 | 明确部分成功，刷新权威资料，保留表单与组织选择供重试；不是原子事务或自动回滚 | [#236](https://github.com/rongxinzy/zhiyuanAaaS/pull/236)，已提交，待合并 |
| F4 · P2 | 主资源和辅助模型/目录读取绑定在同一聚合请求，任一辅助失败遮住正常主表 | 模型查询独立；按主资源区分辅助失败，保留主表并明确不可用，禁用依赖缺失数据的写入，不显示虚假零成员 | [#237](https://github.com/rongxinzy/zhiyuanAaaS/pull/237)，已提交，依赖 #236 |
| F5 · P2 | 团队负责人输入看似保存成功，实际只写未隔离的 `localStorage['admin-team-owners']`，没有服务端契约 | 停止读取和写入假持久化，禁用字段并解释后端暂不支持；不宣称新增负责人管理功能 | [#236](https://github.com/rongxinzy/zhiyuanAaaS/pull/236)，已提交，待合并 |

初始复现位置在超限的 `Resources.tsx`、`client.ts`、`Models.tsx` 中。修复按仓库文件大小要求拆分：
`resources-user-editor.tsx`、`resources-user-organization.tsx`、`resources-team-editor.tsx`、
`client-assignment-pages.ts`、`client-resources.ts` 等负责具体行为；原 Resources、Models、client、i18n 入口保留。
具体变更和提交版本以对应 PR 为准，PR 创建不等于已部署或已完成真实链路验收。

## 角色授权准则与迁移事项

新准则见 [AGENTS.md](../AGENTS.md#authorization-role-only-grants)。
用户（包括数字员工身份）绑定角色，团队配置角色；权限和资源访问只授予角色。
组织归属、资源绑定、限流或配额选择器引用用户、团队，不等于直接赋予权限。
上述 CRUD 修复没有擅自删除历史直授，也不宣称已在服务端强制新准则。

### G1：AEP 已支持 role 主体，Console 与后端仍允许直授

模型、Skill、凭据授权已有 `role` 主体，同时仍允许 `user`、`team`。
应先盘点历史直授数据，制定角色映射、撤销与回滚方案，再调整服务端写入校验、Console 选择器和测试。
历史直授在迁移完成前应保持可见、可撤销；不能只隐藏入口就宣布系统已强制角色授权。
团队默认角色能力已存在，应复用并核验团队停用、成员退出、角色撤销后的效果。
用户、团队详情中的有效访问聚合只用于展示，不能替代服务端权限执行。

### G2：知识库与数字员工存在跨仓契约阻塞

审查基线中，Console `ManagedKnowledgeGrant` 只接受 `user | team`；
数字员工可见范围只有 `all/restricted`、`users`、`teams`，没有角色主体。
创建、编辑员工的契约也没有显式角色绑定字段，必须确认运行身份如何映射到 AEP 用户及角色。

这不是前端类型遗漏：governance `portal/knowledge_grants.go` 拒绝其他主体，
`knowledge_base_grants` 表的约束也只允许 user/team；
`operator/api/v1alpha1/digitalemployee_types.go` 的 `VisibilitySpec` 只有 Mode/Teams/Users；
`portal/auth.go` 还接受 owner、all、指定团队、指定用户及旧团队规则。

迁移需同步 API、数据库约束、CRD/Operator、员工运行身份以及检索/聊天鉴权路径，
明确历史 owner/all/user/team 规则迁移、角色解析与撤销传播。
不能把员工配置的 models/skills 列表作为另一条授权来源，也不能只增加一个角色下拉框。
这是新准则落地的依赖，不表示原契约没有实现，或 Higress 缺少模型授权能力。

## 实际验证与边界

初始审查的 11 个组件、客户端和契约测试文件共 302 项通过；
有状态 HTTP mock 浏览器验收 28 个场景、666 次请求、无控制台错误。
另用期望行为断言分别复现 F1/F3/F4 及 F2 三类授权分页失败，作为缺陷证据。

最终组合修复的本地验证：

- 全量单测 55 个文件、726 项通过，无未处理异常。
- 新增分页 18 项、写入 6 项、读取隔离 13 项回归均通过。
- `typecheck`、`lint`、`verify:admin`、`knip`、文件大小/行数限制及 `git diff --check` 通过。
- #237 的 mock 浏览器验收 28 个场景、645 次请求、无控制台错误；明暗主题及 1440/390 视口截图检查通过。
- #235 合并后的 #236 集成版本另运行相关 3 个文件、79 项通过；冲突只涉及行数基线。

这些验证覆盖控制台与模拟 API 的行为，未连接真实 AEP 数据库、知识引擎、Operator、外部渠道、
Higress/Redis/Prometheus；没有生产部署或真实多账号权限安全认证。
本指导文档 PR 只改 Markdown，未为文档变更另跑运行时测试。

## 后续顺序

1. #235 已合并；先合并 #236，再合并依赖它的 #237，分别检查当前提交 CI 与正式 approval。
2. 对实际部署执行多团队保存、部分失败、超一页授权撤销及辅助故障验收。
3. AEP/SDK/Console 分阶段落实 G1，保留历史授权可见、可撤销及安全迁移能力。
4. governance/CRD/Operator/Console 协同完成 G2，再用人类用户和数字员工验证角色授予、
   继承、退出团队、撤销角色及禁止直授的正反向链路。
