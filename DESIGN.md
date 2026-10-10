# Admin Console 设计与开发规范

本文件约束知远企业控制台的 Web 管理端（`src/admin`），与 [AGENTS.md](AGENTS.md) 配套使用。
组件、主题与交互写法以现有业务页面的 **Ant Design** 实现为基准。
`src/ui` 的企业 renderer 独立构建，其样式、宿主主题和共享组件规则不自动适用于 Web 管理端。

## Agent 入口与源码职责

开始修改 Admin Console 前，依次阅读：

1. 本文件、`AGENTS.md` 和 [DEVOPS.md](DEVOPS.md)。
2. `src/admin/App.tsx`、`src/admin/main.tsx`、`src/admin/admin.css`、`src/admin/theme.ts`。
3. 受影响的业务页面及 `src/admin/components/*` 中已有的业务组合组件。
4. `src/admin/i18n.ts`、相关测试，以及 `scripts/verify-admin-console.mjs` 的构建边界检查。

| 文件/目录 | 职责 |
| --------- | ---- |
| `src/admin/App.tsx` | 根 ConfigProvider、明暗算法、主题 seed、会话门控、shell、导航、权限和路由 |
| `src/admin/theme.ts` | 浅色、深色、跟随系统的状态、持久化与系统主题监听 |
| `src/admin/main.tsx` | Web 入口；加载 `antd/dist/reset.css` 和 `src/admin/admin.css` |
| `src/admin/admin.css` | Admin 布局、业务组合样式与 `--ant-*` 变量消费 |
| `src/admin/components/*` | 基于 AntD 的业务组合，如列表查询、重置、导出按钮组 |
| `src/admin/Resources.tsx` | 用户、团队、角色、Skill 等资源管理 |
| `src/admin/Models.tsx` | 模型目录、创建、配置与授权 |
| `src/admin/Operations.tsx` | 接入配置、配置生效状态及相关平台操作 |
| `src/admin/Events.tsx` | 控管事件与审计查询 |
| `src/admin/i18n.ts` | 用户可见的中英文文案 |
| `src/ui/*` | 企业 renderer 的独立入口与样式资产；不作为 Admin 主题来源 |

当需求与规则冲突时，优先级为：用户明确需求 > 本文件的项目规则 > 现有组件实现 > 单个页面的历史写法。
发现文档与业务实现冲突时，应明确指出并同步修正规范，不能默默引入另一套设计系统。
已有页面的零散硬编码不是新页面复制它们的理由；应优先使用同一 ConfigProvider 派生的 token。

## 运行环境与边界

- Admin Console 是纯浏览器应用，通过 `/aep` HTTP API 通信；不得使用 Electron IPC、Node 模块或 `process`。
- 浏览器目标以 `vite.admin.config.ts` 为准，当前为 Chromium ≥130；桌面视口为主要使用场景，窄视口仍须可操作。
- 主题只保留浅色、深色、跟随系统。浏览器存储被禁用时仍须正常渲染。
- 复用现有 `antd` 依赖，不为 Admin 安装 shadcn 组件或强制加载 shadcn 技能。
- 不从 `src/ui/components/ui/*` 导入 Admin 视觉原语，不在 Admin 入口加载 `src/ui/index.css` 或 `src/ui/tea-theme.css`。
- `scripts/verify-admin-console.mjs` 明确检查 Admin CSS 不包含 Tea 主题。仓库中的 Tea/shadcn 文件和
  [腾讯云 token 采集记录](docs/tencent-cloud-theme-tokens.md) 不是 Web 管理端的规范。
- 技能可辅助设计审查，但必须服从本文件的组件和主题边界；不为加载技能修改应用依赖。

## 设计方向

管理界面应克制、清晰、内容优先。用间距、标题和业务分组建立层级，避免渐变、发光、装饰性动画和重复容器。
浅色与深色是同一套 AntD 主题的两个外观，不另建页面专属配色。
主要动作清晰可见，状态有文字说明，错误能定位到具体操作；数据缺失不能伪装为成功或零值。

## 组件与主题单真源

### 根 ConfigProvider

复用 `src/admin/App.tsx` 的唯一根主题配置，当前配置如下：

```tsx
<ConfigProvider
  theme={{
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    cssVar: { key: 'zhiyuan-admin' },
    token: { colorPrimary: '#1677ff', borderRadius: 6, fontSize: 14 },
  }}
>
  {/* 现有 Admin 页面 */}
</ConfigProvider>
```

以上 seed 值只在根配置集中定义。需要调整时，在同一处修改，并验证所有受影响业务页；
不要将它们复制到页面、局部 ConfigProvider、CSS 颜色常量或另一个 token 文件。
主题其余颜色、尺寸、圆角与状态由 AntD 当前算法和组件 token 派生。

### Token 消费方式

- React 自定义区域使用 `const { token } = theme.useToken()`；优先复用 AntD 组件自身的样式。
- `admin.css` 使用现有 `--ant-*` CSS 变量，与根 `cssVar` 配置保持一致。
- 不在 JSX 中按主题拼接两套配色，不用 `dark:` 颜色覆盖，也不引入 Tea → shadcn 的语义映射。
- Tailwind 可以保留现有布局工具类；不要使用默认颜色刻度或 `bg-card`、`text-muted-foreground` 等
  依赖另一套主题桥接的颜色类来定义 Admin 表面。

| 语义 | AntD token | 使用位置 |
| ---- | ---------- | -------- |
| 页面画布 | `colorBgLayout` | shell 内容背景、登录画布 |
| 容器表面 | `colorBgContainer` | Card、表格和普通输入控件的默认表面 |
| 浮层表面 | `colorBgElevated` | Select 菜单、Dropdown、Tooltip 等浮层 |
| 次级填充 | `colorFillAlter` / `colorFillSecondary` | 自定义代码区域、次级信息区 |
| 主文本 | `colorText` | 标题与正文 |
| 次文本 | `colorTextSecondary` | 说明、单位、元信息 |
| 边框 | `colorBorder` / `colorBorderSecondary` | 控件边框与弱分隔线 |
| 强调 | `colorPrimary` / `colorPrimaryText` | 主动作、链接、曲线与活动指示 |
| 状态 | `colorSuccess` / `colorWarning` / `colorError` / `colorInfo` | 业务状态、错误和提示 |
| 字体 | `fontFamily` / `fontFamilyCode` | 自定义正文与代码区域 |
| 尺寸与间距 | `fontSize*`、`padding*`、`margin*`、`controlHeight*` | 自定义排版和布局 |
| 圆角与阴影 | `borderRadius*`、`boxShadow*` | 自定义容器与浮层 |

CSS 对应写法如 `var(--ant-color-bg-container)`、`var(--ant-color-bg-elevated)`。
优先按语义选 token，避免把所有背景都设为同一个值。

### Card、Select 与浮层

- 使用 `antd` 的 Card。默认浅色卡片为白色，与 `colorBgLayout` 的页面画布区分；
  不将卡片设为透明或页面背景色。深色使用算法派生的容器表面，不手写深色值。
- 使用 AntD Select 及其 options、loading、disabled 等状态，不替换为原生 `<select>` 或 shadcn Select。
- 保留 Select 默认轮廓、尺寸、箭头、焦点反馈和菜单浮层；同一工具栏内的选择器保持同构。
- 菜单使用 `colorBgElevated`，不强制与 Card 颜色相同；深色浮层可比普通容器更亮。
- 保留 AntD disabled 的填充与文字样式，不通过整块 `opacity` 或 `pointer-events: none` 替代组件状态。
- 不为“修复背景色”编写全局 `.ant-*` 颜色覆盖；先检查入口样式、ConfigProvider 和 token 来源。

### 自定义图表与代码块

图表库只负责图表绘制，周边控件仍使用 AntD。线条、坐标、网格、提示浮层分别消费状态色、
`colorTextSecondary`、`colorBorderSecondary`、`colorBgElevated` 等 token。
代码块使用 `fontFamilyCode` 和次级填充，长命令可横向滚动，键盘用户可以进入并滚动区域。
禁止把缺失值当作零绘图或计价；示例数据必须有显式标识，不能冒充实际观测结果。

### 禁止事项

- 在页面中新增 hex、rgb、hsl 配色或 Tailwind 默认颜色刻度，包括硬写白底和黑底。
- 创建页面级主题、第二套 localStorage 主题键、`useTheme` 或系统主题监听。
- 自造 Button、Tag、Modal、Tabs、Select、Form 字段等已有 AntD 组件。
- 使用背景色、边框和阴影叠加层层嵌套 Card。
- 为设计规则引入 Web 字体、动画库或另一个组件库。

## 页面壳层、导航与排版

### 固定壳层

复用 `App.tsx` 的 Layout：左侧导航 + 顶部行 + 内容区。登录、工作台和管理台的会话门控不另起实现。
布局类由 `admin.css` 管理；不要用 renderer 的 shell 类或 CSS reset 覆盖 Admin。

当前一级目的地为概览、数字员工、知识库、技能管理、用户管理、模型网关、日志审计、系统管理。
实际可见项由 `App.tsx` 的权限规则决定。增加或移动目的地时同时更新路由、兼容映射、权限、文案与测试；
不恢复旧版“四个/五个目的地”或把模型服务重新放回系统管理。
模型目录、接入配置、配置生效详情属于模型网关；新增同级功能继续使用同一组最上级下划线页签。
不得为了视觉调整改变页面归属或扩大权限。

窄视口采用当前 shell 支持的导航方式。新增折叠入口时使用 AntD Drawer/Menu，并复用同一选中状态与权限过滤。
内容区必须允许收缩，长 ID、用户名、版本与 endpoint 使用省略或换行；
表格允许局部横向滚动，不能撑宽整页。不要在文档里宣称尚未实现的窄屏布局已经存在。

### 页面模板

- 标题行复用已有 `.admin-page-heading` 或相邻业务页的 Row/Space 组合。
- 标题使用 `Typography.Title`；级别和字号与相邻页面一致，说明使用 `Typography.Text type="secondary"`。
- 主操作使用 `Button type="primary"`，次操作使用默认 Button；图标动作使用 `icon` 属性并提供可读名称。
- Card 使用 `title`、`extra` 与 children，不使用 shadcn 的 CardHeader/CardContent 写法。
- 列表使用 AntD Table 的 columns、dataSource、rowKey 和 loading；信息详情优先使用 Descriptions。
- 不将整页装进一个浮动 Card，也不嵌套 Card 制造重复层级。

### 字体、间距、圆角与边框

- 保留根主题的 `fontSize: 14`，标题与正文优先由 Typography 选择，不套用 Tea 字号、字重或零圆角规则。
- 自定义区域读取 `fontFamily`、`fontFamilyCode`、`fontSize*`、`fontWeightStrong`，不增加字体文件。
- 新增布局优先使用 Row/Col、Space、Flex 的标准能力，以及 token 的 margin/padding 档位。
  既有 shell 的布局值以 `admin.css` 为准，不为对齐组件重置整页间距。
- 圆角、控件高度、边框宽度与阴影保留 AntD 默认或根主题派生值。自定义区域使用对应 token。
- hover 不改变边框宽度；不新增任意色值、阴影或全局按钮尺寸覆盖。

## 组件组合契约

| 需求 | AntD 组件/写法 | 约束 |
| ---- | -------------- | ---- |
| 主动作 | `Button type="primary"` | 一个明确的主要动作；异步使用 loading 并阻止重复提交 |
| 次动作 | 默认 `Button` | 延续相邻业务页的轮廓样式，不强制全部改成 ghost |
| 低强调或行内动作 | `Button type="text"` / `type="link"` | 删除等危险动作使用 danger 和确认流程 |
| 纯图标动作 | `Button icon={...}` | `aria-label`，必要时 title 或 Tooltip；保留完整点击和焦点区域 |
| 状态标签 | `Tag` | 使用 AntD 语义预设；状态同时有文本 |
| 页面错误与提示 | `Alert` 的 `type` 选择 error/info/warning/success | 使用 title、description、showIcon；页面错误可提供重试 |
| 表单 | `Form` + `Form.Item` + `Input/Select/InputNumber` | label 关联输入，rules 校验，保留错误说明 |
| 开关 | `Switch` | 关联标签，保留 checked、disabled、loading 和键盘行为 |
| 详情容器 | `Card` + `Descriptions` | 不嵌套卡片；长内容可换行 |
| 列表 | `Table` | 稳定 rowKey，局部滚动；加载、错误和空结果明确区分 |
| 空数据 | `Empty` | 提供下一步动作或说明，未接入与无数据区分 |
| 编辑弹层 | `Modal` / `Drawer` | 表单校验、焦点、Escape 与提交中行为按组件契约处理 |
| 不可逆动作 | `Popconfirm` / 确认 Modal | 清楚说明影响，防止重复提交，失败可恢复 |
| 内容页签 | `Tabs` 默认 line 类型 | 同级内容使用同一层下划线，不套用 TabsIndicator 或胶囊轨道 |
| 少量互斥选项 | `Segmented` / `Radio.Group` | 只用于业务选项，不替代最上级页签 |
| 计价说明等折叠内容 | `Collapse` | 使用 items API，保留可访问性与展开状态 |
| 查询/重置/导出 | 已有 `ListQueryActions` | 复用页面注入的操作与鉴权，导出不可绕过权限 |

新增控件优先使用 `@ant-design/icons`；现有导航中的 Lucide 图标可保留，不能为统一图标擅自改已有页面。
装饰图标使用 `aria-hidden`；不要让图标内部英文名称混入按钮的可访问名称。
不使用 emoji、手绘 SVG 或 Unicode 符号代替现有图标。

## 主题运行契约

- 切换统一调用 `applyAdminTheme` / `persistAdminTheme`，枚举使用 `AdminThemeMode`。
- `theme.ts` 在 documentElement 上维护 `.dark`、`theme-mode` 和 `theme-enable`；
  根 ConfigProvider 根据同一状态选择算法，这些属性不代表 Admin 加载了 Tea CSS。
- system 模式持续监听 `prefers-color-scheme`；存储读写必须容忍被禁用。
- 对比相邻业务页检查 Card、Select、菜单、Tooltip、Table、Modal 的背景、边框、焦点与 disabled 状态。
- 不覆盖 AntD Menu 的选中颜色为 Tea 色值；导航状态由同一主题的 Menu 组件 token 表达。

## 交互、异步状态与动效

1. 导航必须对应真实目的地；URL、选中项和内容一致，兼容旧路由。
2. 加载尽量保留当前布局，使用 Table loading、Skeleton 或组件 loading；应用级会话恢复可使用 Spin。
3. 加载失败显示错误与可执行重试，不伪装为空列表；未知指标显示“未提供”，不填造数值。
4. 空状态说明原因和下一步；主要动作常显，不仅在 hover 时出现。
5. 操作使用稳定 React key；刷新与轮询不通过随意 remount 清空滚动位置和输入。
6. 切换筛选、页签或弹层时，不静默丢弃未提交内容；保存成功、部分失败与尚未生效明确区分。
7. 需要权限或后端配置能力的动作不能仅靠前端展示假成功；未接通的保存禁用并解释原因。

保留 AntD 自身的 hover、focus、pressed、弹层和 Tabs 动效，不以另一套组件的动画覆盖它们。
新增自定义动画使用 CSS 和 AntD 的 motion token（如 `motionDurationFast/Mid/Slow`），
尊重 `prefers-reduced-motion`；不要为普通页面切换强制加入退出/进入序列或动画库。
避免布局属性动画、含正文卡片缩放和无业务意义的循环动画。

## 文案、可访问性与安全

- 所有新增用户可见文本加入 `src/admin/i18n.ts` 的 zh/en 字典，检查双语长度。
- 页面 key、API 路径、事件类型和主题模式沿用项目的 `as const` 枚举模式。
- 字段使用 Form.Item label、稳定 id 与校验说明；不可只依赖红色边框。
- 不移除 AntD 焦点样式。Modal、Drawer、Select、Switch、Tabs 均检查键盘操作。
- 状态同时有文字或图标，不能只靠颜色；表格保留表头，长值不撑宽布局。
- 不在 UI、日志、截图或测试 fixture 中暴露真实密码、provider key、模型令牌与其他密钥。

操作成功和失败复用 `src/admin/notifications.tsx` 的 `notify` / `AdminNotificationViewport`。
当前 viewport 使用 AntD Alert，成功 3 秒、失败 5 秒后消失，只显示最新一条，带 status 与 aria-live。
不要另写深色悬浮提示或引入第二套 toast。字段错误留在 Form.Item；页面加载错误留在对应区域。

## 验证与提交

UI 变更至少执行：

```text
npm run typecheck
npm test
npm run verify:admin
git diff --check
```

涉及表单、路由或壳层时，运行相应浏览器回归（如 `npm run verify:admin:e2e`），区分 fixture 与真实后端验证。
视觉检查覆盖桌面、窄视口、浅色、深色，以及 loading/error/empty/success/disabled/focus 状态。
检查卡片与画布区分、Select 菜单浮层、控件尺寸及主题切换后的一致性；不要只检查 JSX 类名。
无法登录或缺少真实数据时，报告未覆盖的范围，不宣称完成业务验收。

仅修改设计/开发文档时，核对说明与当前源码、相对链接、`git diff --check` 和 PR 文件范围即可。
说明未运行运行时测试的原因；不要把其他工作树的 UI 检查冒充本次文档变更的验证。
提交、PR 标题、描述与评审继续遵循 DEVOPS.md，使用 Conventional Commits，并填写改动、原因、实际验证。

提交 UI 前检查：

- [ ] 组件来自 AntD 或已有 Admin 业务组合，未自造基础控件。
- [ ] 使用唯一根 ConfigProvider，颜色与尺寸消费 AntD token。
- [ ] Card、Select、浮层与相邻业务页一致；没有页面级配色或透明卡片。
- [ ] 没有引入 renderer 的 Tea/shadcn 样式或 Electron/Node 能力。
- [ ] 导航、权限、路由兼容和页面归属正确，同级页签使用统一下划线。
- [ ] 双语文案、键盘焦点、加载、错误、空数据及禁用状态完整。
- [ ] 桌面与窄视口、浅色与深色实际检查过，长内容无整页溢出。
- [ ] 必需检查通过，验证说明与本次变更范围一致。
