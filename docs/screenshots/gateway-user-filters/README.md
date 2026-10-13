# 限流配额用户筛选

限流规则的用户主体选择与 Token 配额用户选择复用 Ant Design 选择组件，保留用户名 / 显示名称搜索，支持团队和角色多选。每个筛选内部匹配任一项，团队与角色条件取交集。清空筛选恢复全部可读取用户；已选用户被排除时清空选择，重新编辑规则恢复已保存的用户。

截图为独立浏览器上下文与 `scripts/admin-browser-fixture.mjs` 提供的测试数据，不代表真实模型或集群业务验收。

- [桌面浅色](desktop-light.png)
- [桌面深色](desktop-dark.png)
- [窄屏浅色](narrow-light.png)
- [窄屏深色](narrow-dark.png)

复现：先运行 `npm run build:admin`，再运行 `node scripts/verify-gateway-user-filters-browser.mjs`。可用 `ZHIYUAN_ADMIN_SCREENSHOTS` 指定截图输出目录，使用 `ZHIYUAN_CHROME_PATH` 指定 Chrome 可执行文件。脚本启动独立的 mock API 和本地静态服务，退出后关闭，不更改现有预览、实际用户授权或配额。
