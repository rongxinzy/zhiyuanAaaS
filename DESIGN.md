# DESIGN.md

知远企业控制台（Web 管理端）前端设计标准。本文件改编自主应用的 `DESIGN.md`，作为本项目 admin console（`src/admin` + `src/ui`）的**项目级约束**：所有新增和修改的 UI 代码必须遵守。与 `AGENTS.md` 的组件库规则配套使用。

## 与主应用的适配说明

admin console 是**纯浏览器应用**，不是 Electron 桌面应用。因此本文件在主应用标准的基础上做了以下裁剪，阅读时以本文件为准：

- **无 IPC、无 Node 能力。** 一切数据经 `/aep` HTTP API 获取。禁止依赖 `window.electronAPI`、`ipcRenderer`、`process`、Node 模块等桌面运行时能力，能力探测不得假设其存在。
- **主题单真源。** Tea Design 的完整明暗主题变量位于 `src/ui/tea-theme.css`，包含 Color、Shadow、Border、Space、Font、Typography 及组件状态变量；`src/ui/index.css` 只负责将它们桥接到 shadcn/Tailwind 语义 token。
- **无聊天输入框。** 主应用的「输入框是主角」等对话产品范式不适用于管理台，已移除；保留通用的连续性、加载态、空状态规则。
- **无 framer-motion。** 本仓库未引入动画库，动效一律用 CSS transition / animation（含 `tw-animate-css` 工具类）实现。

## 技能参考

涉及 UI 实现时，**必须参考以下技能**（通过 `/` 或 Skill 工具加载，优先级从高到低）：

1. **`shadcn`** — shadcn/ui 组件用法、样式规则、表单、组合、图标。本仓库 shadcn 组件安装于 `src/ui/components/ui/*`。
2. **`ai-elements`** — Vercel AI Elements 的 AI 原生组件。管理台目前没有对话类界面；仅在引入 AI 管理特性（如智能体行为预览、AI 审计摘要）时按需使用。

**使用规则：**

- 任何新增 UI 组件，首先查上述技能是否有现成的 shadcn 组件可用，**禁止自造轮子**。
- 组合现有组件时遵循 shadcn 技能的样式范式（`FieldGroup` + `Field` 而不用 `space-y-*`；Button 的 `variant`/`size` 枚举等）。
- 所有面向用户的文本通过 `src/admin/i18n.ts` 的翻译字典走 i18n，键同时补充 `zh` / `en` 两套，不写裸文案。
- 页面 key、API 路径、事件类型、主题模式等字符串常量必须定义为 `as const` 对象（参照 `App.tsx` 的 `AdminPage`、`theme.ts` 的 `AdminThemeMode`），禁止裸字符串字面量。

## 运行环境

- **目标浏览器：** Chromium ≥130（`vite.admin.config.ts` 的 build target）。使用 CSS custom properties 与现代 CSS，不承诺旧版浏览器兼容；Safari / Firefox 非首要目标，允许优雅降级。
- **主题三态：** 浅色 / 深色 / 跟随系统，实现于 `src/admin/theme.ts`（`.dark` class + `theme-mode` attribute + `prefers-color-scheme` + localStorage）。主题等浏览器偏好持久化必须用 try/catch 容忍存储被禁用（该文件即范式）。
- **布局面向桌面浏览器：** 以 ≥1280px 视口为一等公民，窗口可任意缩放；不要求移动端布局，hover 交互按桌面鼠标假设。
- **明暗两套外观下都成立。** 所有设计决策必须同时在浅色与深色主题下验证。

## 设计方向

以 **Kimi、Codex 这一代 AI 产品的质感**为基准：中性、克制、内容优先。

- **界面退后，内容向前。** 界面骨架由中性灰构成，颜色只出现在该出现的地方（品牌强调、状态语义）。不做炫技的渐变、发光、彩色装饰。
- **用留白和字重建立层级，而不是用颜色和边框。** 分组靠间距，强调靠字重，分隔优先用空白，其次用 1px 细线，最后才是阴影。
- **暗色与亮色是同一套设计的两个面。** 主题只保留：浅色 / 深色 / 跟随系统。不再新增彩色主题。

### 质感目标：轻盈、流畅、有呼吸感

在"克制"的底色之上，产品应当感觉**轻盈、流畅、有呼吸感**——这与克制不矛盾，它靠节奏和留白实现，不靠加特效：

- **轻盈** = 视觉重量低 + 动效质量感小。视觉重量由本文件的色彩/边框/字重规则保证；动效质量感小意味着小幅度、短距离、快速到位的运动，没有沉重的大位移和迟缓的过渡。
- **流畅** = 轨迹连续，没有断裂点。流畅的反义词不是"慢"，是"断"：硬切、闪屏、中途重挂载都是断裂。具体规则见「交互手感」。
- **呼吸感** = 节奏。内容按次序落位而不是整屏同时砸出来；留白有疏密；进行中的状态有缓慢的生命迹象（脉冲、微光）。一屏的呼吸感由一处编排好的节奏提供，不是到处都在动。
- **不呆板** = 微交互覆盖。每个可交互元素对 hover/press 都有即时、轻微的回应（见「动效语言」）。微交互单个不起眼，合在一起是"做得用心"的直觉。

## 色彩

### 事实来源（单真源）

颜色只允许通过 Tea Design 变量或其语义别名使用。真源是 `src/ui/tea-theme.css`：

- `:root` / `.tea-theme-light` / `[theme-mode='light']` 提供完整浅色主题。
- `.dark` / `.tea-theme-dark` / `[theme-mode='dark'][theme-enable='true']` 提供完整深色主题。
- `src/ui/index.css` 的 `:root` / `.dark` 只定义 `--background`、`--primary`、`--border` 等兼容 shadcn 的语义别名，`@theme inline` 再桥接为 Tailwind 工具类。

组件一律通过 shadcn 语义 utility（`bg-card`、`text-muted-foreground`、`border-border` 等）消费颜色，不得绕过 token。

**禁止：**

- 在组件中直接写 hex / rgb / hsl 色值（如 `bg-[#3B82F6]`、`text-gray-500`、`bg-white`）。
- 使用 Tailwind 默认彩色刻度（`blue-*`、`gray-*`、`slate-*` 等）。
- 新增一次性颜色。需要新颜色时，先确认 Tea Design 是否已有对应的 Color token；优先使用 `--tea-color-*`，否则在 `src/ui/index.css` 的明暗语义映射中增加别名，再通过 `@theme inline` 桥接后使用。

### 色板角色

| 角色     | Token                              | 用途                                                   |
| -------- | ---------------------------------- | ------------------------------------------------------ |
| 画布     | `background`                       | 应用底层背景                                           |
| 表面     | `card`（次要表面 `secondary`）     | 卡片、侧边栏、输入框底色                               |
| 浮起表面 | `muted` / `accent`                 | hover 态、次级填充                                     |
| 覆盖层   | `popover`                          | 弹层、下拉、浮窗                                       |
| 侧边栏   | `sidebar` 系列                     | 侧边栏专用表面、边框、激活态                           |
| 主文本   | `foreground`                       | 正文、标题                                             |
| 次文本   | `muted-foreground`                 | 辅助说明、表头、占位符、搜索无匹配结果及紧凑空态       |
| 淡色文本 | `tertiary-foreground`              | 用户名、资源 ID、版本、时间戳、eyebrow 等元信息       |
| 边框     | `border` / `input`                 | 分隔线、控件描边                                       |
| 强调     | `primary` / `primary-foreground`   | 唯一的品牌强调色，用于主按钮、激活态、链接、focus ring |
| 状态     | `destructive` / `success` / `warning` / `info` | 危险、成功、警告、信息只使用 Tea 对应的 `--tea-color-function-*`、`--tea-color-bg-*`、`--tea-color-text-*` token |

侧边栏必须通过 `sidebar` 语义 token 直接消费 Tea 的 `--menu-*` 组件变量：默认表面使用 `--menu-bg`，hover 使用 `--menu-item-bg-hover` / `--menu-item-text-hover`，选中态使用 `--menu-item-bg-active` / `--menu-item-text-active`。浅色主题的选中背景固定为 `#e5ecff`，深色主题的选中背景固定为 `#282e40`；选中文字和图标保持 Tea 既有的 `--tea-color-text-on-bg-brand-default`，不因背景调整而改变。选中项不增加可见边框、不加粗，文字和图标继承同一选中前景色。

### Tea 色值参考（Light / Dark）

完整变量见 `src/ui/tea-theme.css`。组件代码使用语义别名，不直接依赖下面的具体色值：

| 角色 | Tea token | 浅色观测值 |
| ---- | --------- | ---------- |
| 品牌默认 | `--tea-color-bg-brand-default` | `#0052d9` |
| 品牌 hover | `--tea-color-bg-brand-hover` | `#266fe8` |
| 品牌 active | `--tea-color-bg-brand-active` | `#0034b5` |
| 品牌 focus | `--tea-color-bg-brand-focus` | `#699ef5` |
| 选中背景 | `--menu-item-bg-active` | `#e5ecff`（浅色） / `#282e40`（深色） |
| 页面背景 | `--tea-color-bg-page-default` | `#f7f8fb` |
| 容器背景 | `--tea-color-bg-container-default` | `#fff` |
| 主文本 | `--tea-color-text-primary` | `rgba(0,0,0,0.9)` |
| 次文本 | `--tea-color-text-secondary` | `rgba(0,0,0,0.7)` |
| 主边框 | `--tea-color-border-primary-default` | `#e6e9ef` |
| 错误默认 | `--tea-color-function-error-default` | `#f64041` |

> 深色值由同一组 Tea token 在 `.dark` 主题块中提供；禁止在组件中用 `dark:` 写第二套颜色。

### 删除确认操作

- 不可撤销删除的确认按钮使用 `destructive` token（填充色、浅色前景）；hover 可使用同色系更深一档反馈。
- 取消按钮使用 `text-muted-foreground`，无可见边线、无阴影；hover 仅使用中性表面背景反馈。
- 删除确认说明使用一句简短文案并保持单行；省略"此操作不可撤销"等重复说明。模型名等动态文本过长时截断，不得撑高确认框。

规则：

1. **强调色唯一。** 一个屏幕内，`primary` 只出现在一个主要动作和少数激活态上。禁止用强调色给普通图标、普通文本"提色"。
2. **状态色不装饰。** 红/绿/黄只表达危险、成功、警告。
3. **层级公式：** 背景每浮起一层（background → card → muted → popover），明暗差异缩小一档；不要跳档制造高反差色块。
4. 明暗主题共用同一套 token 名，组件代码不得出现 `dark:` 前缀的单独配色——差异必须在 `src/ui/tea-theme.css` 和 `src/ui/index.css` 的 token 层解决。模态遮罩使用 `bg-overlay`，不在组件中写黑色透明度。
5. **搜索空结果使用次文本。** 关键词无匹配、无可选项等紧凑空态使用 `text-sm text-muted-foreground`，不使用主文本、状态色或额外边框；完整空状态页面再按空状态组件规范处理。

6. **文本层级按语义区分。** 辅助说明和表头使用 `text-muted-foreground`；资源 ID、用户名、版本、时间戳和 eyebrow 等元信息使用 `text-tertiary-foreground`，不通过 opacity 临时降低颜色。
7. **状态组件使用语义变体。** `Badge` 和 `Alert` 支持 `success`、`warning`、`info`、`destructive` 变体；启用、连接和操作成功使用 `success`，权限或不可用提示使用 `warning`，错误和危险操作使用 `destructive`，默认/已标记类信息使用 `info`。

## 字体

### 字体族

- **界面字体：** 使用 Tea 的 `--tea-font-family-default`，通过 `--font-sans` 暴露给 Tailwind。禁止引入 Web 字体文件——浏览器端尤其如此，避免额外下载与 FOUT。
- **代码字体：** 使用 Tea 的 `--tea-font-family-code`，通过 `--font-mono` 暴露给 Tailwind。所有代码块、行内代码、终端、diff 统一使用。
- 全局统一，禁止在组件上用 `font-family` 覆盖（组件库内部对 `--font-sans` 的引用除外）。

### 字号刻度

字号必须来自 Tea 的 `--tea-font-size-*` 或 `--tea-typography-*`，Tailwind 的常用字号已在 `src/ui/index.css` 中桥接：

| 档位 | 类名        | Tea 字号 token | 尺寸 | 用途 |
| ---- | ----------- | -------------- | ---- | ---- |
| 辅助 | `text-xs`   | `--tea-font-size-300` | 12px | 时间戳、badge、caption |
| 次要 | `text-sm`   | `--tea-font-size-350` | 14px | 正文、按钮、列表项、表格 |
| 强调 | `text-base` | `--tea-font-size-400` | 16px | 区块标题、面板标题 |
| 页面 | `text-lg`   | `--tea-font-size-450` | 18px | 页面级标题、空状态主标题 |
| 展示 | `text-xl`   | `--tea-font-size-500` | 20px | 登录页等展示场景 |
| 大标题 | `text-2xl` | `--tea-font-size-600` | 24px | 需要明确强调的页面标题 |

> 标题角色优先使用 Tea 的 `--tea-typography-heading-*`，正文角色优先使用 `--tea-typography-body-*`；不要新增 22px 等 Tea 未提供的字号。

### 字重

只允许 Tea 提供的两档：

| 字重 | 类名            | Tea token | 用途 |
| ---- | --------------- | --------- | ---- |
| 400  | `font-normal`   | `--tea-font-weight-regular` | 正文、按钮、导航、标签、Tab、表头、Badge、数据值 |
| 600  | `font-medium` / `font-semibold` | `--tea-font-weight-medium` | 页面/区块/卡片/弹层标题、品牌字标、hero 与展示型数据 |

除标题、品牌字标、hero 与展示型数据外，一律使用 400；激活态通过 Tea 的状态色和背景表达，不通过加粗表达。禁止 `font-bold`（700）及以上，也禁止自行引入 500。

### 行高

| 场景         | Tea token | 说明 |
| ------------ | --------- | ---- |
| 默认正文     | `--tea-typography-body-default` | 12px / 20px |
| 中号正文     | `--tea-typography-body-md` | 14px / 22px |
| 标题         | `--tea-typography-heading-4` 至 `heading-1` | 按标题层级选择 |
| 代码块       | `--tea-font-line-height-500` | 20px 基准 |

## 圆角

圆角必须来自 Tea 的 `--tea-border-radius-*`。`--radius` 对应 Tea 的 `--tea-border-radius-default`（0px），Tailwind 刻度在 `@theme inline` 中直接映射 Tea 档位：

| 圆角  | 类名             | Tea token | 实际值 | 用途 |
| ----- | ---------------- | --------- | ------ | ---- |
| 小    | `rounded-sm`     | `--tea-border-radius-150` | 6px | badge、行内代码块、小图标按钮 |
| 中    | `rounded-md`     | `--tea-border-radius-200` | 8px | 按钮、输入框、下拉项 |
| 默认  | `rounded-lg`     | `--tea-border-radius-300` | 12px | 卡片、面板、导航项 |
| 大    | `rounded-xl`     | `--tea-border-radius-400` | 16px | 对话框、大型弹层、代码块容器 |
| 全圆  | `rounded-full`   | `--tea-border-radius-full` | 9999px | 头像、分段控件滑块 |

规则：

1. 同一容器内，子元素圆角 ≤ 父元素圆角，视觉上保持同心。
2. 禁止任意值圆角（`rounded-[7px]` 等）；刻度不满足时优先改设计，其次扩展 `@theme` 刻度。
3. 主应用中主输入框（hero prompt input）`rounded-3xl` 的例外是聊天产品特征，管理台不适用。

## 阴影

阴影必须来自 Tea 的 `--tea-shadow-*`。Tailwind 的 `shadow-sm` 至 `shadow-xl` 已在 `src/ui/index.css` 中桥接，不能使用 Tailwind 默认阴影值：

| 级别         | 类名         | 用途                     |
| ------------ | ------------ | ------------------------ |
| `shadow-sm`  | 极轻的浮起感 | 默认、hint               |
| `shadow-md`  | 卡片级       | 卡片、控制柄滑块         |
| `shadow-lg`  | 悬浮级       | hover 浮起、sticky 栏    |
| `shadow-xl`  | 弹层级       | 对话框、modal            |
| `shadow-2xl` | 映射到 Tea `shadow-xl` | popover、tooltip |

> Tea 的阴影由 `--tea-size-*`、`--tea-shadow-*-*` 和 `--tea-shadow-*` 组合而成。确需新增阴影时，先在 `src/ui/tea-theme.css` 的明暗主题块中补齐对应变量，不得手写 `shadow-[...]` 任意值。

规则：

1. **边框优先，阴影殿后。** 浅色主题下能用一个 1px `border` 说清的层级，不用阴影。阴影只用于"真正浮在内容之上"的元素（弹层、对话框）。
2. 暗色主题慎用阴影（深色上阴影不可见），层级用表面色明度差 + 边框表达。
3. 普通按钮、输入框**不加阴影**。

## 间距与填充

- 以 Tea 的 `--tea-space-100`（4px）为基准网格，`@theme inline` 的 `--spacing` 指向该 token。只使用 Tailwind 标准间距刻度（`p-1`=4px … `p-6`=24px），更大或特殊间距直接引用对应的 `--tea-space-*` 语义值。禁止 `p-[13px]` 这类任意值。
- 约定俗成的填充模式：

| 场景         | 模式                                                              |
| ------------ | ----------------------------------------------------------------- |
| 侧边栏分组   | 水平 `px-3`，组内项间距 `space-y-0.5`，组间 `space-y-2` 或 `mt-2` |
| 导航/列表项  | `px-3 py-1.5`，圆角 `rounded-lg`                                  |
| 按钮（默认） | 组件库默认（`h-9 px-4`），小号 `h-8 px-3`                         |
| 图标按钮     | `h-8 w-8`，图标 `h-4 w-4`                                         |
| 卡片         | `p-4`；密集卡片 `p-3`                                             |
| 对话框       | 内容区 `p-6`， footer `px-6 py-4`                                 |
| 表格单元格   | `px-3 py-2`；表头 `text-xs` 或 `text-sm` + `text-muted-foreground` |
| 表单行距     | `space-y-4`                                                       |

- 图标与文字并排时间距 `gap-1.5`（紧凑）或 `gap-2`（默认）。

## 边框

- **宽度一律使用 Tea 的 `--tea-border-width-default`**（当前为 1px；使用 `border`，不显式写 `border-1`）。唯一允许 2px+ 的地方是 focus ring 和个别进度条，并应使用 `--tea-border-width-50`。
- 颜色只用 token：常规 `border-border`，更弱的分隔 `border-border/50` 或表面色差，输入框 `border-input`。
- hover 不改变边框宽度（避免布局抖动），只改 Tea 的 Border color token 或背景 token。
- **所有浮层必须有边框。** Popover、Dropdown、Select、HoverCard 与 Dialog 使用 `border border-border`，不得以 `ring` 模拟边框或用 `border-0` 移除。
- 模态遮罩用 `bg-overlay`（只变暗、**不使用 backdrop-blur**），其值来自 Tea 的 `--tea-color-bg-mask-default`。

## 透明度

透明度只用于**状态**，不用于**配色**：

| 场景                       | 做法                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| 禁用态                     | `opacity-50`（配合 `pointer-events-none`）                                                          |
| 非激活的分段选项           | `opacity-50` + 激活时恢复（参见下方范例）                                                           |
| 骨架屏加载                 | `Skeleton` 组件（`animate-pulse`）                                                                  |
| 模态遮罩                   | `bg-overlay`，只变暗、**不使用 backdrop-blur**                                                       |
| 其余一切"让颜色变浅"的需求 | **禁止用 opacity 实现**，改用对应的弱档 token（`muted-foreground`、`border`、`primary-foreground`） |

原因：opacity 会让元素与背后的内容混色，在明暗两套主题下表现不一致；token 才能在两套主题中各自取到正确的值。

## 动效

- 时长：普通交互 **100–250ms**；具备明确语义过程的动态图标 **400–600ms**，统一 `ease-out`。超过 600ms 的动画需要理由。
- 可动属性只有 `opacity` 和 `transform`；禁止动画化 width/height/top/left（布局抖动）。
- 入场动画优先用 `tw-animate-css` 工具类（本仓库已引入）：`animate-in`、`fade-in`、`slide-in-from-bottom-2`、`zoom-in-95` 等，组合使用（如 `animate-in fade-in slide-in-from-bottom-2`）。需要自定义时在 `@theme` 补 keyframes，不内联。
- 实现手段只有 CSS（transition / animation）。本仓库没有 framer-motion，不要为动效引入 JS 动画库。
- 必须遵守 `prefers-reduced-motion`：给自定义动画补 `motion-reduce:animate-none` 或等效处理；`tw-animate-css` 已内置时验证即可。

### 动效语言

动效分三档，各自的幅度和时长不得混用：

| 档位 | 场景 | 幅度 | 时长 |
| ---- | ---- | ---- | ---- |
| 微交互 | hover / press / focus / 状态切换 | 位移 1–2px；背景或阴影换一档；简单图标形变 | 100–200ms |
| 语义动态图标 | 文件写入、对勾绘制、器件脉冲等可读的单次过程 | 仅图标内部 `opacity` / `transform`；一次完成、不循环 | 400–600ms |
| 过渡 | 视图切换、展开收起、弹层进出 | 位移 4–28px；opacity | 150–250ms |
| 入场编排 | 页面/区块首次出现 | `fade-in` + `slide-in-from-bottom-2`（8px），错峰 delay 60–100ms 递增 | 单层 ≤250ms |

规则：

1. **按压有反馈。** 按钮和可点卡片 active 态下沉 `translate-y-px`（组件库 Button 已内置）；可点卡片可加 `active:scale-[0.99]`。
2. **hover 反馈必须可感知。** 背景换一档（`hover:bg-accent` / `hover:bg-muted`）或阴影升一档（`shadow-sm → shadow-md`），二选一但要看得出差别；对比度不足 3% 的"假 hover"视同没有。
3. **缩放只用于小元素。** 图标、按钮、缩略图可以 `scale`（hover ≤1.02）；**含正文文本的卡片禁止 scale**——高分屏下缩放会使文字瞬时发虚，浮起感改用阴影 + 背景表达。
4. **入场错峰有节制。** 同一屏幕至多一组错峰编排，2–4 层，delay 步进 60–100ms，总延迟 ≤400ms——用户永远不应该"等"内容出现。其余页面内容直接渲染，不要到处加入场动画。
5. **循环动画只表达状态。** 缓慢的循环（`animate-pulse`、`Spinner`）只允许用于进行中的状态指示（连接中、刷新中、登录中），一屏至多一处；禁止与状态无关的装饰性循环动画（飘浮、流光、无限摆动）。
6. **一屏一个重点。** 同一屏幕同时进行的编排动画至多一处；其余元素保持安静。动效的总预算是固定的，花在一个地方才被感知，到处都动等于没有动。
7. **语义动态图标不等于普通 hover。** 只有动画本身表达明确过程时才可使用 400–600ms；鼠标悬停期间不重复播放，离开后复位。导航、普通按钮仍使用微交互档，不得借此整体放慢。

正误对照：

- ✅ 概览卡片 `animate-in fade-in slide-in-from-bottom-2` 错峰；Tab 切换指示滑动；按钮 `active:translate-y-px`
- ❌ 整屏内容无过渡瞬间出现；三层以上的错峰或总延迟 >400ms
- ❌ 对含文字的卡片做 `scale` hover；对比度 <3% 的 hover 变色
- ❌ 装饰性循环动画；一屏多处同时脉冲/流光
- ❌ 为动画引入 framer-motion 等新依赖

## 交互手感

「手感」是交互轨迹、UI 与动效的综合感受。基准仍是 Kimi、Codex 这一代产品：它们的共性不是某个具体动画，而是**连续性**——用户的每个动作都落在一条不间断的轨迹上。管理台没有对话输入框，主线是**侧边栏导航与主内容区的对应关系**：点一个页签，主内容区就抵达一个明确的场所。

### 规则

1. **导航必须有目的地。** 点击一个导航项必须让主面板抵达一个对应的场所（概览、资源、模型、事件），不允许只改变侧栏状态而主面板无响应。没有目的地的导航等于没有导航。
2. **视图切换走"退出-进入"序列，禁止硬切。** 旧内容退出（opacity，≤150ms）→ 新内容进入（opacity + 位移，≤250ms）。本仓库用 CSS 实现：容器内 `animate-in fade-in slide-in-from-bottom-2 duration-200`；`prefers-reduced-motion` 下退化为瞬时切换。同一屏幕内只做一次编排好的过渡，不做多元素各自为政的散落动画。
3. **异步标识替换不得打断界面。** 前端先生成稳定 id 并全程用作 React key；后端真实 id 返回后只建立映射，不替换 key。禁止在刷新、轮询等连续体验中途 remount 组件树（滚动位置、动画、局部状态会全部重置，用户感知为"闪一下"）。
4. **加载态用骨架屏，不用全屏 Spinner。** 原地内容加载（表格、列表、卡片）渲染目标区域的 `Skeleton`；预计 <200ms 的加载直接渲染结果，不展示任何加载态，避免闪屏。全屏 Spinner 仅保留给应用级启动（登录恢复会话时）。
5. **空状态是邀请，不是死端。** 每个空状态必须给出下一步动作（CTA 按钮或明确的操作指引），禁止只有一行灰字的死端画面。
6. **主要动作不靠 hover 显形。** 新建、启用/停用等主操作常显（可用低对比度呈现，hover 提亮）；hover 才出现的隐藏入口只允许用于删除等低频危险动作。
7. **切换不得静默丢状态。** 页签、筛选切换时若有未提交内容或进行中的操作，要么保留现场，要么明确告知；不允许无提示地清空用户正在看的内容。

### 反面清单

- 条件渲染直接换掉整棵视图树，硬切无过渡
- 轮询/刷新时 React `key` 变化触发整树 remount
- 快机器上全屏 Spinner 一闪而过，比不显示更糟
- 关键入口 `opacity-0` 藏到 hover 才出现，用户找不到
- 表格重新加载时整页闪烁而不是原地骨架屏

## 控件质感基准

### 切换/分段控件

新做开关、分段控件、Tab 切换时参照以下语言（源自主应用侧边栏模式切换控件）：

1. **全宽胶囊轨道**：轨道用中性灰（`bg-muted` + 1px 边框），与背景分得开但不抢眼。
2. **滑动滑块**：全圆角滑块带 `shadow-md` 级投影，200ms ease 滑动，方向感清晰。
3. **状态用文字表达，不用色块**：选中侧 `font-normal text-foreground`，未选侧 `font-normal text-muted-foreground opacity-50`；不通过加粗或强调色染色。
4. **整行可点**：点击目标是整个控件区域，不只是滑块。

### 线性页签

资源管理等内容分区使用 RongxinAI 风格的线性页签：

1. **底部分割线**：页签容器与内容区域之间使用 `border-b border-border`，不使用胶囊轨道。
2. **活动下划线**：使用共享 Tabs 的 `TabsIndicator`，颜色使用 `primary` token，活动项保持 `font-normal`。
3. **切换滑动**：指示条根据 Base UI 的 `--active-tab-left` / `--active-tab-width` 移动，过渡为 200ms `ease-in-out`；`prefers-reduced-motion` 下取消过渡。
4. **非活动项**：使用 `text-muted-foreground`，hover 时提升为 `text-foreground`，不使用额外状态色。

### 工具栏触发按钮

下拉选择器、菜单触发器、工具栏动作按钮一律使用以下语言：

1. **静止时融入工具栏**：ghost 风格——无边框、无背景、无阴影。
2. **hover 用背景表达**：`hover:bg-accent`，200ms 内过渡；不用边框、阴影或颜色变化做 hover 信号。
3. **下拉触发器带尾部箭头**：`ChevronDown`（`h-3.5 w-3.5 text-muted-foreground`），表明"点开有菜单"；纯动作按钮（如「+」）只放图标，不加箭头。
4. **内容从左到右**：可选的前置图标（`size-4`）→ `text-sm` 文字 → 尾部箭头；文字过长用 `max-w` + `truncate` 截断。
5. **成对出现时必须同构**：同一工具栏里的多个选择器共享完全相同的尺寸、间距与状态样式。

禁止：给工具栏触发按钮加 `border`（包括 `border-input`）、用 `rounded-full` 胶囊、用阴影作为 hover 反馈——这些是已被否决的变体。

## 交互状态

所有可交互元素必须具备完整状态链，缺一不可：

- **hover**：背景变浅一档（`hover:bg-accent` / `hover:bg-muted`）或文字变深一档；200ms 内过渡。
- **active/pressed**：可省略，由 hover 延续。
- **focus-visible**：统一 focus ring（组件库默认 `outline-ring/50`），颜色取 `ring` token，不得移除焦点样式而不提供替代。
- **disabled**：`opacity-50` + 禁止指针事件，不改变配色结构。
- **loading**：异步动作（刷新、登录）进行中按钮转入 pending 态（`disabled` + `Spinner`），避免重复提交。

## 落地检查清单

提交 UI 代码前逐项自查：

- [ ] 没有直接写死的色值 / Tailwind 默认彩色刻度；全部走 `src/ui/index.css` 的语义 token 及其桥接工具类
- [ ] 没有 `dark:` 前缀的单独配色（主题差异在 Tea token 层解决）
- [ ] 没有 Electron / Node 运行时依赖（`window.electronAPI`、`ipcRenderer`、`process`、Node 模块）
- [ ] 字号使用 Tea 字号档位；除标题、品牌字标、hero 与展示型数据外，所有文字均使用 400
- [ ] 圆角、阴影只用本文件定义的刻度，无任意值
- [ ] 边框 1px，颜色用 token
- [ ] 透明度只用于状态，配色变浅一律换 token
- [ ] 普通交互动效 ≤250ms；语义动态图标 400–600ms；只动 opacity/transform，幅度符合「动效语言」规范；CSS 实现，未引入 JS 动画库
- [ ] hover 反馈可感知（非 <3% 的假 hover）；含文字卡片未用 scale；自定义动画遵守 reduced-motion
- [ ] 入场错峰至多一组、≤4 层、总延迟 ≤400ms；循环动画只用于状态指示且一屏一处
- [ ] 视图切换有退出-进入序列，无硬切；reduced-motion 下退化正常
- [ ] 异步 id 替换不触发 key 变化和中途 remount
- [ ] 原地加载用骨架屏，无全屏 Spinner 闪屏
- [ ] 空状态有 CTA；主要动作常显，不靠 hover 显形
- [ ] 每个可交互元素有 hover / focus / disabled（含异步 loading）状态
- [ ] 亮色与暗色两种外观下都看过效果
- [ ] 所有用户可见文本走 i18n.ts 字典，zh / en 两键同补
- [ ] 组件优先使用 shadcn/ui（`src/ui/components/ui/*`），未自造轮子
