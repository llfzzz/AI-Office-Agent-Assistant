# AI Office Agent Assistant

由 AI Meeting Memory Assistant 升级而来，会议助手能力现在作为“会议纪要 Skill”保留。产品定位是一个面向办公场景的 AI Agent 原型：用户输入会议、周报或需求材料后，系统展示 Agent Plan，并调用对应 Skill 生成结构化办公输出、质量自检、保存记录和反馈迭代清单。

## 功能

- 用户系统：注册 / 登录后才能进入应用，数据按账号隔离
- Skill 工作台：会议纪要、周报生成、需求评审三个办公 Skill
- 会议纪要 Skill：浏览器录音 / 上传音频 / 会议文本转结构化纪要
- 周报生成 Skill：工作记录、会议引用、待办状态转结构化周报
- 需求评审 Skill：功能想法、用户反馈、背景资料转 PRD 草稿和验收标准
- Agent Plan：展示目标理解、Skill 选择、信息缺口、执行步骤和风险提示
- 质量自检：检查幻觉、夸大、遗漏、不可复制等问题
- 输出记录：PocketBase 持久化保存办公 Skill 输出
- 反馈迭代：保存准确性、可复制性、完整性评分和下一版建议
- 会议记忆库：PocketBase 持久化保存，支持标题、关键词、参会人搜索和类型筛选
- RAG 配置：在独立页面保存项目背景、业务规则和术语资料
- 会议追问：基于单条会议记录回答问题

## 技术栈

- React + TypeScript + Vite
- Express API server
- PocketBase：本地数据库、用户认证、会议记忆和 RAG 资料库
- Google Gemini API
- Free Joy（FJ）设计系统 —— 暖纸白 + Joy Coral 珊瑚色，组件 vendored 在 `src/freejoy/`，适配组件在 `src/ui/`

## API 配置

本项目默认按 Google Gemini API `generateContent` 调用方式实现，参考：

- Quickstart：`https://ai.google.dev/gemini-api/docs/quickstart?hl=zh-cn`
- Base URL：`https://generativelanguage.googleapis.com/v1beta`
- Endpoint：`/models/{model}:generateContent`
- Model：`gemini-3-flash-preview`（Google 文档中 Gemini 3 Flash 当前 REST 模型 ID）
- Header：`X-goog-api-key: <GEMINI_API_KEY>`
- 请求体包含 `contents`、`parts` 和 `generationConfig`

复制 `.env.example` 为 `.env`，填入 Gemini key。仓库示例文件中 key 保持留空：

```bash
cp .env.example .env
```

```env
PORT=8788
PB_URL=http://127.0.0.1:8090
JSON_BODY_LIMIT=10mb
GEMINI_API_KEY=
GEMINI_HTTPS_PROXY=
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_UPLOAD_BASE_URL=https://generativelanguage.googleapis.com/upload/v1beta
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_MAX_OUTPUT_TOKENS=2000
GEMINI_THINKING_LEVEL=low
GEMINI_TIMEOUT_MS=90000
GEMINI_RETRY_ATTEMPTS=4
```

未配置 `GEMINI_API_KEY` 时，服务端会降级为本地演示解析，前端会标记为“演示模式”。录音转写和图片提取也使用同一个 Gemini key；浏览器产生的 WebM 录音会通过 `ffmpeg-static` 转成 Gemini 支持的 FLAC 音频。纯文本、Markdown、CSV、JSON、HTML、XML、RTF、DOCX、ODT、PPTX 和 XLSX 会在服务端本地提取文本。

如果服务器访问 Google API 必须经过代理，可设置 `GEMINI_HTTPS_PROXY`，例如 `http://127.0.0.1:7890`。该代理只用于 Gemini API 请求。

## 运行

准备 PocketBase：

```bash
# macOS 示例，也可以从 https://pocketbase.io/docs/ 下载对应系统版本
curl -L https://github.com/pocketbase/pocketbase/releases/download/v0.31.0/pocketbase_0.31.0_darwin_arm64.zip -o pocketbase.zip
unzip pocketbase.zip pocketbase
chmod +x pocketbase
```

```bash
npm install
./pocketbase migrate up
./pocketbase serve
```

另开一个终端启动前后端：

```bash
npm run dev
```

默认地址：

- 前端：`http://localhost:5173/office-agent/`
- API：`http://localhost:8788`
- PocketBase：`http://127.0.0.1:8090`

首次进入前端需要注册或登录账号。所有会议、追问和 RAG 文档都会通过 PocketBase token 绑定到当前用户。

生产构建：

```bash
npm run build
npm start
```

## Prompt 链路

服务端保留原会议 Prompt 链路，并新增办公 Agent Prompt 链路：

1. Agent Plan：任务理解、Skill 选择、输入缺口、RAG 判断和执行步骤
2. Skill 执行：会议纪要复用原链路；周报 / 需求评审使用新增 Prompt
3. 质量自检：检查幻觉、夸大、遗漏、不可复制和不可验证内容
4. 输出保存：保存 input、agent_plan、output、quality_check 和 rag
5. 反馈总结：把用户评分和文字反馈整理为迭代建议

核心文件：

- `server/prompts.js`
- `server/analyzer.js`
- `server/gemini.js`
- `server/storage.js`
- `server/pocketbase.js`
- `pb_migrations/*`

## 设计说明

前端采用 **Free Joy（FJ）设计系统** 重构（来自 claude.ai/design，经 Claude 设计 MCP 导入）：

- 暖纸白底（`--paper`）+ 单一 Joy Coral 珊瑚色交互强调（`--accent` `#F2603C`）
- Bricolage Grotesque 标题 + Hanken Grotesk 正文
- 白色发丝边框卡片、pill 按钮/标签、克制圆角与轻柔玻璃质感
- 会议纪要分类（决策/待办/风险/问题/记忆/摘要）用 FJ 软色点缀区分

接入方式：FJ token 在 `src/index.css` 引入，`src/App.css` 的 `:root` 做 token bridge 全站换肤；FJ 组件 vendored 在 `src/freejoy/`，应用适配组件在 `src/ui/`。项目内的设计基准见 `DESIGN.md`。

## 后续可扩展

- 多会议 RAG 检索
- 项目维度长期记忆
- 自动生成下次会议议程
- 飞书 / Notion 导出
