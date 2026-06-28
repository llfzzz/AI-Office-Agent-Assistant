# AI Office Agent Assistant — 设计基准

本项目界面采用 **Free Joy（FJ）设计系统** 重构。Free Joy 是一套受“青春、个性、安静自信”启发的极简组件库，iOS-18 light 风格：暖纸白底、单一珊瑚色交互强调、克制圆角与发丝边框、轻柔玻璃质感。

来源：claude.ai/design 项目「Free Joy Design System」，通过 Claude 设计 MC 导入。

## 接入方式

- **设计 token**：`src/freejoy/tokens/{fonts,colors,typography,spacing,base}.css`，由 `src/freejoy/styles.css` 汇总，在 `src/index.css` 顶部一次性引入（保证 `--accent`/`--paper`/`--font-*` 等先于 `App.css` 可解析）。
- **Token bridge（换肤）**：`src/App.css` 的 `:root` 把本项目原有变量重映射到 FJ token，从而全站一次性切换到 FJ 外观。两处命名冲突已处理：
  - `--surface`（本项目=纸白页底）改名为 `--app-surface`，避免覆盖 FJ 的 `--surface`（白色卡片面）。
  - `--ink` 不再在本项目 `:root` 定义，直接继承 FJ 的 `--ink`。
- **组件**：`src/freejoy/components/**`（ES 导出的 `.jsx` + 同名 `.d.ts`），统一从 `src/freejoy` 桶文件导出。现有 `lucide-react` 图标可直接传入组件的图标槽。
- **适配层**：`src/ui/`，用 FJ 基元组合出贴合本应用语义的组件：`SemanticPanel`（会议纪要分类面板）、`ScorePicker`（反馈星级评分，基于 lucide-react，无 CDN 依赖）。

## 设计 token

颜色（语义别名，见 `tokens/colors.css`）：
- 强调/交互：`--accent` = Joy Coral `#F2603C`（hover `--accent-hover`、按下 `--accent-press`、浅底 `--accent-soft`）
- 中性：`--bg` 纸白 `#F6F6F4`、`--surface` 白、`--text` 近黑 `#1C1C1A`、`--text-muted`/`--text-subtle`、`--border` 发丝线
- 支持色（仅小面积点缀）：Sun（暖黄）、Bloom（淡紫）
- 语义：`--success-*`、`--warn-*`、`--danger-*`、`--info-*`
- 玻璃：`--glass-bg`/`--glass-bg-strong` + `backdrop-filter`（`.fj-glass` 工具类）
- 暗色主题：`[data-theme="dark"]` 已随 token 引入（暂未接通切换开关）

字体（`tokens/typography.css`，经 Google Fonts 加载）：
- Display：**Bricolage Grotesque**（标题，紧字距 `-0.02em`、紧行高 1.05）
- Text/UI：**Hanken Grotesk**（正文/控件，行高 1.5–1.65）
- Mono：**JetBrains Mono**（代码、元信息、大写 eyebrow）

几何（`tokens/spacing.css`）：
- 圆角：卡片/输入 `--radius-md/lg`（12–18px）；按钮/标签/头像 pill `--radius-pill`（999px）
- 间距：4px 基准，区块留白偏大（48–128px）
- 阴影：柔和暖色、克制（`--shadow-xs` 静置，hover 抬升到 `--shadow-md`）
- 优先用发丝边框而非阴影定义边界

## 产品语义映射

会议纪要输出的分类面板（`SemanticPanel`）保留语义配色，但改用 FJ 软色：
- 关键决策 → success（绿）
- 待办事项 → info（蓝）
- 风险点 → joy（珊瑚）
- 未解决问题 → danger（红）
- 长期记忆 → bloom（淡紫）
- 摘要强调 → sun（暖黄）

Skill 工作台磁贴用白色 FJ `Card` + 彩色 `Badge` 点缀（贴合 FJ「小面积点缀，不做大色块」的原则）；关键词/记忆用 `Tag`；状态用 `Badge`；提示用 `Alert`；加载用 `Spinner`；登录页 tab 用 `SegmentedControl`。

## 已迁移到 FJ 组件的界面

登录/注册、首页入口、Skill 工作台、会议纪要（含表单与会议类型 Select）、周报生成、需求评审、结构化纪要结果（经 `SemanticPanel`，决策/待办/风险/问题/记忆/关键词）、会议记忆库（搜索/筛选/状态 Badge）、会议追问、RAG 资料库（Switch + 编辑器 + 操作按钮）、AI 设置弹窗（FJ `Modal`）、反馈表单（`ScorePicker` 星级 + Switch + Textarea）、输出记录、全局错误与加载态。

其余少量界面（侧栏指标、工具菜单下拉、产品资料、会议附件工具条）仍由 token bridge 提供 FJ 配色与字体，可按需继续替换。

vendored 的 FJ 组件子集（`src/freejoy/components`）：Button、Card、Badge、Tag、Divider 之外的 Input、Textarea、Select、Switch、Alert、Spinner、SegmentedControl、Modal、Stat 等；统一从 `src/freejoy` 桶导出。
