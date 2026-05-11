# AI Office Agent Assistant 升级方案

> 目标：在现有 `AI Meeting Memory Assistant` 基础上升级为 `AI Office Agent Assistant`。  
> 重点：保留现有会议助手能力，把它封装为办公 Agent 的一个 Skill，再新增办公任务 Skill、Agent 任务拆解、产品文档化和反馈迭代能力。  
> 禁止：不要完全重构，不要废弃现有会议分析链路，不要换技术栈。

## 1. 当前项目基线

现有项目已经具备完整 AI 应用闭环：

- 前端：`React + TypeScript + Vite`
- 后端：`Express`
- 数据库与认证：`PocketBase`
- AI 调用：`OpenAI-compatible API`
- 已有能力：
  - 用户注册 / 登录
  - 会议数据按账号隔离
  - 浏览器录音 / 上传音频转写
  - 会议理解 Prompt
  - 结构化纪要 Prompt
  - 质量自检 Prompt
  - 单场会议追问 Prompt
  - RAG 资料库
  - 会议记忆库

现有关键文件：

```text
src/App.tsx                # 主应用界面和视图路由
src/api.ts                 # 前端 API 调用
src/types.ts               # 前端类型定义
src/App.css                # Notion 风格 UI 样式
src/index.css              # 全局样式
server/index.js            # Express API 路由
server/prompts.js          # Prompt 链路
server/analyzer.js         # 会议分析和追问入口
server/storage.js          # 会议存储与查询
server/rag.js              # RAG 资料库
server/transcriber.js      # 音频转写
server/pocketbase.js       # PocketBase 认证与连接
pb_migrations/*            # PocketBase schema
DESIGN.md                  # 当前设计基准
```

## 2. 升级后的产品定位

产品名：

```text
AI Office Agent Assistant
AI 办公智能体助手
```

一句话介绍：

> 一个面向办公场景的 AI Agent 原型系统。用户可以通过自然语言或材料输入触发不同办公 Skill，系统将任务拆解为 Agent 目标理解、资料检索、Skill 执行、结构化生成、质量自检和结果保存。现有会议助手升级为“会议纪要 Skill”，并新增周报生成 Skill 与需求评审 Skill。

升级后的能力结构：

```text
AI Office Agent Assistant
├── 会议纪要 Skill
│   ├── 录音 / 音频上传
│   ├── 会议理解
│   ├── 结构化纪要
│   ├── 质量自检
│   ├── 长期记忆
│   └── 单场会议追问
├── 周报生成 Skill
│   ├── 工作记录输入
│   ├── 会议记录引用
│   ├── 待办状态整理
│   ├── 周报生成
│   └── 风险与下周计划
├── 需求评审 Skill
│   ├── 功能想法输入
│   ├── 用户反馈输入
│   ├── RAG 背景增强
│   ├── PRD 草稿生成
│   ├── 验收标准生成
│   └── 研发 / 测试关注点
├── Agent Plan
│   ├── 意图识别
│   ├── Skill 选择
│   ├── 信息缺口判断
│   ├── 执行步骤
│   └── 输出物说明
├── 反馈与迭代
│   ├── 准确性反馈
│   ├── 可复制性反馈
│   ├── 遗漏信息反馈
│   ├── 修改成本反馈
│   └── 迭代优化清单
└── 产品资料
    ├── Skill 产品说明书
    ├── 用户操作教程
    ├── 演示素材
    └── PRD / 竞品分析资料
```

## 3. 为什么这样升级

现有项目适合 Plaud：

```text
语音转写 -> 智能总结 -> 记忆系统 -> AI Agent
```

升级后也更适合百度千帆 / DuMate 岗位：

```text
办公 Agent -> Tool / Skill -> 企业级 AI 产品 -> PRD -> 用户反馈 -> 迭代优化
```

所以不要新建一个完全独立项目。正确方式是：

```text
把现有会议助手 Skill 化
再扩展为办公 Agent 多 Skill 工作区
```

这样简历表达更强：

> 从单点 AI 会议助手升级为办公 Agent 原型，将会议纪要、周报生成、需求评审等办公任务抽象为可复用 Skill，并支持 Agent 任务拆解、RAG 背景增强、质量自检、用户反馈和迭代清单。

## 4. 设计风格要求

本项目已经参考 `VoltAgent/awesome-design-md` 的 Notion `DESIGN.md`，升级时必须保持一致。

参考来源：

- GitHub：`VoltAgent/awesome-design-md`
- 文件：`design-md/notion/DESIGN.md`
- 当前本地文件：`DESIGN.md`

继续使用当前视觉语言：

- 深 navy 工作区头部：`#0a1530`
- 紫色主按钮：`#5645d4`
- 白色文档式面板
- 8px 矩形按钮和输入框
- 12px 卡片
- Notion / Inter 风格字体
- pastel 色块区分不同 Skill 和输出类型
- sidebar + workspace 的办公产品布局

新增 Skill 色彩映射：

```text
会议纪要 Skill：Lavender / Sky
周报生成 Skill：Mint / Yellow
需求评审 Skill：Peach / Rose
Agent Plan：Navy + White document card
反馈与迭代：Surface gray + Purple status badge
```

不要做成花哨 landing page。第一屏仍然应该是可用的工作区。

## 5. 升级原则

### 5.1 保留现有功能

必须保留：

- 用户登录 / 注册
- 会议录音 / 音频上传
- 会议分析
- 会议保存
- RAG 资料库
- 记忆库
- 会议追问

现有会议链路不要删除，只改名或包装为：

```text
Meeting Skill / 会议纪要 Skill
```

### 5.2 在现有架构上扩展

优先扩展现有文件：

```text
server/prompts.js      # 新增办公 Agent / 周报 / 需求评审 Prompt
server/analyzer.js     # 新增 analyzeOfficeTask / runOfficeSkill
server/index.js        # 新增 /api/office/* 路由
server/storage.js      # 新增 office_outputs / feedback 存储函数
src/types.ts           # 新增 Skill、AgentPlan、OfficeOutput、Feedback 类型
src/api.ts             # 新增 office API 调用
src/App.tsx            # 新增 skill/workbench/feedback/docs 视图
src/App.css            # 在现有设计 token 下增加新组件样式
pb_migrations/*        # 增加 PocketBase collection
```

### 5.3 不要过度工程化

第一版只做 3 个 Skill：

1. 会议纪要 Skill：复用现有会议助手
2. 周报生成 Skill：新增
3. 需求评审 Skill：新增

不要第一版就做：

- 复杂插件市场
- 多 Agent 协作
- 真实第三方办公软件集成
- 权限系统大改
- 工作流编排器
- 大规模数据看板

## 6. MVP 功能范围

### 6.1 Skill 工作台

新增一个主视图：

```text
Skill 工作台
```

页面内容：

- 3 个 Skill 卡片
- 每个卡片展示：
  - Skill 名称
  - 使用场景
  - 输入内容
  - 输出内容
  - 适合用户
  - 风险提示

Skill 卡片：

```text
会议纪要 Skill
把录音、音频或会议转写稿整理为摘要、决策、待办、风险和长期记忆。

周报生成 Skill
把工作记录、会议结论、待办状态整理为结构化周报。

需求评审 Skill
把功能想法、用户反馈和背景资料整理为 PRD 草稿、验收标准和研发测试关注点。
```

### 6.2 Agent Plan

每次运行 Skill 前，先生成 Agent Plan。

Agent Plan 不是给模型看的隐藏过程，而是产品界面的一部分，用于展示：

- 用户目标
- 判断出的任务类型
- 选择的 Skill
- 需要哪些输入
- 是否使用 RAG
- 执行步骤
- 输出物
- 风险提示

示例：

```json
{
  "user_goal": "把本周工作记录整理成周报",
  "detected_intent": "weekly_report",
  "selected_skill": "weekly_report_skill",
  "required_inputs": ["工作记录", "本周会议", "下周计划"],
  "missing_information": ["下周计划未明确"],
  "use_rag": true,
  "execution_steps": [
    "识别本周完成事项",
    "合并会议中的待办和风险",
    "按周报结构生成内容",
    "检查是否存在夸大或虚构"
  ],
  "expected_outputs": ["本周总结", "完成事项", "问题风险", "下周计划", "需协助事项"],
  "risk_notes": ["如果原文没有明确完成结果，不要写成已完成"]
}
```

### 6.3 周报生成 Skill

输入字段：

- 周报标题
- 周期
- 工作记录
- 可选：引用会议记录
- 可选：RAG 资料库
- 可选：下周计划草稿

输出：

- 一句话本周总结
- 本周完成事项
- 关键进展
- 问题与风险
- 下周计划
- 需要协助事项
- 可复制周报正文

### 6.4 需求评审 Skill

输入字段：

- 功能名称
- 功能想法
- 目标用户
- 用户反馈 / 痛点
- 业务背景
- 约束条件
- 可选：RAG 资料库

输出：

- 需求背景
- 用户痛点
- 产品目标
- 用户流程
- 功能范围
- 非目标范围
- 验收标准
- 研发关注点
- 测试关注点
- 风险点
- PRD 草稿

### 6.5 反馈与迭代

每个 AI 输出结果都允许用户反馈：

- 准确性：1-5
- 可复制性：1-5
- 完整性：1-5
- 是否需要大量人工修改
- 遗漏了什么
- 哪些内容有幻觉
- 下一版建议

系统保存后，在“迭代清单”页面展示：

- 高频问题
- 低分输出
- 待优化 Skill
- 下一版优化建议

## 7. 后端设计

### 7.1 新增核心类型

建议引入通用办公任务结构：

```ts
type SkillId = 'meeting_minutes' | 'weekly_report' | 'prd_review';

interface OfficeTaskInput {
  skill_id: SkillId;
  title: string;
  content: string;
  date?: string;
  metadata?: Record<string, string>;
  rag?: {
    enabled: boolean;
  };
  linked_meeting_ids?: string[];
}
```

### 7.2 新增 API

在 `server/index.js` 中新增：

```text
POST /api/office/plan
输入办公任务，返回 Agent Plan。

POST /api/office/run
输入办公任务，返回 Agent Plan + Skill 输出 + 质量自检。

POST /api/office/outputs
保存办公任务输出。

GET /api/office/outputs
获取历史办公输出。

GET /api/office/outputs/:id
获取单条办公输出详情。

POST /api/office/outputs/:id/feedback
提交用户反馈。
```

### 7.3 PocketBase collections

新增 collection：`office_outputs`

字段建议：

```text
user              relation users
skill_id          text
title             text
input             json
agent_plan        json
output            json
quality_check     json
rag               json
created           auto
updated           auto
```

新增 collection：`office_feedback`

字段建议：

```text
user              relation users
office_output     relation office_outputs
accuracy_score    number
copyability_score number
completeness_score number
needs_heavy_edit  bool
missing_info      text
hallucination     text
suggestion        text
created           auto
updated           auto
```

## 8. Prompt 工程升级

本项目升级的核心不是“多加几个按钮”，而是把现有会议 Prompt 链路升级成通用办公 Agent Prompt 链路。

新链路：

```text
任务理解 Prompt
-> Skill 选择 / Agent Plan Prompt
-> Skill 执行 Prompt
-> 质量自检 Prompt
-> 反馈总结 Prompt
```

现有会议链路保留：

```text
会议理解
-> 结构化纪要
-> 质量自检
-> 会议追问
```

会议链路只是 `meeting_minutes` Skill 的执行逻辑。

## 9. Prompt 模板

### 9.1 Agent 任务理解与 Skill 选择 Prompt

用途：

让 AI 先理解用户办公目标，并选择合适 Skill，而不是直接生成结果。

```text
你是 AI Office Agent Assistant 的任务规划模块。

产品背景：
这是一个办公 Agent 原型系统。系统包含多个办公 Skill：
1. meeting_minutes：会议纪要 Skill，适用于会议文本、录音转写、会议总结、决策/待办/风险提取。
2. weekly_report：周报生成 Skill，适用于工作记录、会议结论、待办状态、下周计划整理。
3. prd_review：需求评审 Skill，适用于功能想法、用户反馈、痛点分析、PRD 草稿、验收标准和研发测试关注点整理。

你的任务：
1. 理解用户输入的真实目标。
2. 判断应该使用哪个 Skill。
3. 判断输入信息是否足够。
4. 判断是否需要引用 RAG 资料库。
5. 给出清晰的执行步骤。
6. 明确最终输出物。
7. 标记可能的风险。

约束：
- 不要直接生成最终办公文档。
- 不要编造用户没有提供的信息。
- 如果信息不足，写入 missing_information。
- 输出必须是合法 JSON。
- 不要输出 JSON 以外的任何内容。

输出格式：
{
  "user_goal": "",
  "detected_intent": "meeting_minutes / weekly_report / prd_review / unknown",
  "selected_skill": "meeting_minutes / weekly_report / prd_review",
  "confidence": "high / medium / low",
  "required_inputs": [],
  "missing_information": [],
  "use_rag": true,
  "execution_steps": [],
  "expected_outputs": [],
  "risk_notes": []
}

用户输入：
{{task_input}}

可用 RAG 资料摘要：
{{rag_context}}
```

### 9.2 周报生成 Skill Prompt

```text
你是 AI Office Agent Assistant 中的周报生成 Skill。

产品目标：
帮助用户把零散工作记录、会议结论和待办状态整理成清晰、真实、可复制的周报。

Agent Plan：
{{agent_plan}}

RAG 资料库上下文：
{{rag_context}}

输入内容：
{{task_input}}

请生成：
1. 一句话本周总结
2. 本周完成事项
3. 关键进展
4. 问题与风险
5. 下周计划
6. 需要协助事项
7. 可直接复制的周报正文

判断标准：
- 完成事项：必须来自输入中明确提到的已完成或已推进事项。
- 问题风险：必须是影响进度、质量、协作或交付的问题。
- 下周计划：如果没有明确输入，只能基于未完成事项提出建议，并标记为“建议”。
- 需协助事项：必须与阻塞、依赖或资源缺口相关。

约束：
1. 不要夸大成果。
2. 不要把计划写成已完成。
3. 不要补充用户没有说过的具体数据。
4. 如果信息不足，写“未提及”或“建议补充”。
5. 输出必须是合法 JSON。
6. 不要输出 JSON 以外的任何内容。

输出格式：
{
  "one_sentence_summary": "",
  "completed_items": [
    {
      "item": "",
      "evidence": "",
      "impact": ""
    }
  ],
  "key_progress": [],
  "risks": [
    {
      "risk": "",
      "impact": "",
      "suggestion": ""
    }
  ],
  "next_week_plan": [
    {
      "plan": "",
      "basis": "明确输入 / 基于未完成事项的建议"
    }
  ],
  "support_needed": [],
  "copy_ready_report": ""
}
```

### 9.3 需求评审 Skill Prompt

```text
你是 AI Office Agent Assistant 中的需求评审准备 Skill。

产品目标：
帮助产品实习生把功能想法、用户反馈和背景资料整理为可评审的 PRD 草稿。

Agent Plan：
{{agent_plan}}

RAG 资料库上下文：
{{rag_context}}

输入内容：
{{task_input}}

请生成：
1. 需求背景
2. 用户痛点
3. 产品目标
4. 用户流程
5. 功能范围
6. 非目标范围
7. 验收标准
8. 研发关注点
9. 测试关注点
10. 风险点
11. PRD 草稿

判断标准：
- 用户痛点：必须来自用户反馈、场景描述或明确问题。
- 产品目标：必须能回应痛点。
- 功能范围：只写本次版本需要做的内容。
- 非目标范围：明确本次不做什么，避免需求膨胀。
- 验收标准：必须可检查、可验证。
- 研发关注点：偏数据结构、接口、状态、异常、性能或权限。
- 测试关注点：偏输入边界、异常流程、结果准确性和用户操作路径。

约束：
1. 不要写空泛的“提升体验”。
2. 不要生成无法验证的验收标准。
3. 不要把猜测写成事实。
4. 如果缺少用户反馈，明确提示“建议补充用户反馈样本”。
5. 输出必须是合法 JSON。
6. 不要输出 JSON 以外的任何内容。

输出格式：
{
  "background": "",
  "user_pain_points": [
    {
      "pain": "",
      "source": "",
      "severity": "high / medium / low"
    }
  ],
  "product_goals": [],
  "user_flow": [],
  "scope": [],
  "out_of_scope": [],
  "acceptance_criteria": [
    {
      "criterion": "",
      "verification_method": ""
    }
  ],
  "engineering_notes": [],
  "testing_notes": [],
  "risks": [
    {
      "risk": "",
      "mitigation": ""
    }
  ],
  "prd_draft": ""
}
```

### 9.4 通用质量自检 Prompt

```text
你是 AI Office Agent Assistant 的输出质量检查器。

请检查 Skill 输出是否符合输入、Agent Plan 和产品要求。

检查重点：
1. 是否编造了输入中没有的信息。
2. 是否把计划写成已完成。
3. 是否把建议写成事实。
4. 是否遗漏了明显风险。
5. 是否存在不可验证的验收标准。
6. 输出是否可以直接复制给办公场景使用。

输出格式：
{
  "has_hallucination": true,
  "hallucination_items": [],
  "overclaim_items": [],
  "missing_key_points": [],
  "unclear_items": [],
  "copy_ready_score": 1,
  "revision_suggestions": []
}

用户输入：
{{task_input}}

Agent Plan：
{{agent_plan}}

Skill 输出：
{{skill_output}}
```

### 9.5 反馈总结 Prompt

```text
你是 AI Office Agent Assistant 的产品迭代分析模块。

请根据用户反馈，整理这个 Skill 的优化建议。

输入：
- Skill 信息
- AI 输出
- 用户评分
- 用户文字反馈

请输出：
{
  "feedback_summary": "",
  "problem_categories": [
    "准确性问题 / 完整性问题 / 可复制性问题 / 幻觉问题 / 交互问题 / 其他"
  ],
  "iteration_suggestions": [],
  "priority": "high / medium / low",
  "next_prompt_adjustment": "",
  "next_product_adjustment": ""
}
```

## 10. 前端升级方案

### 10.1 View 扩展

当前：

```ts
type View = 'home' | 'compose' | 'library' | 'detail' | 'rag';
```

建议扩展为：

```ts
type View =
  | 'home'
  | 'skills'
  | 'compose'
  | 'weekly'
  | 'prd'
  | 'library'
  | 'detail'
  | 'rag'
  | 'outputs'
  | 'feedback'
  | 'docs';
```

### 10.2 导航升级

当前 sidebar：

```text
转写整理
RAG 配置
记忆库
会议追问
```

升级为：

```text
Skill 工作台
会议纪要
周报生成
需求评审
RAG 资料库
输出记录
反馈迭代
会议记忆库
```

注意：

- 会议纪要继续指向现有 `compose` 能力。
- 记忆库继续保留。
- 不要把会议记忆库和办公输出记录混在一起，第一版可以分开。

### 10.3 新组件建议

可以在 `src/App.tsx` 内先增加组件，等变大后再拆文件：

```text
SkillWorkbenchView
SkillCard
AgentPlanPanel
WeeklyReportView
PrdReviewView
OfficeOutputView
FeedbackView
ProductDocsView
```

## 11. 后端升级方案

### 11.1 prompts.js

新增导出：

```js
buildOfficePlanMessages(input, ragContext)
buildWeeklyReportMessages(input, agentPlan, ragContext)
buildPrdReviewMessages(input, agentPlan, ragContext)
buildOfficeQualityCheckMessages(input, agentPlan, skillOutput)
buildFeedbackSummaryMessages(feedbackInput)
```

保留现有：

```js
buildUnderstandingMessages
buildMinutesMessages
buildQualityCheckMessages
buildAskMessages
```

### 11.2 analyzer.js

新增：

```js
export async function planOfficeTask(input, context)
export async function runOfficeSkill(input, context)
export async function summarizeFeedback(input)
```

逻辑：

```text
retrieveRagContext
-> buildOfficePlanMessages
-> 根据 selected_skill 调用对应 Skill Prompt
-> buildOfficeQualityCheckMessages
-> 返回 agent_plan + skill_output + quality_check
```

会议纪要 Skill 可以直接复用 `analyzeMeeting`，不需要重写。

### 11.3 index.js

新增路由：

```js
app.post('/api/office/plan', ...)
app.post('/api/office/run', ...)
app.post('/api/office/outputs', ...)
app.get('/api/office/outputs', ...)
app.get('/api/office/outputs/:id', ...)
app.post('/api/office/outputs/:id/feedback', ...)
```

## 12. 数据迁移方案

新增 migration，例如：

```text
pb_migrations/20260511000400_office_agent_schema.js
```

collections：

- `office_outputs`
- `office_feedback`

保留已有：

- `meetings`
- `qa_entries`
- `knowledge_documents`

不要把历史会议迁移到 `office_outputs`。第一版保持分离，后续可以做统一视图。

## 13. README 升级方向

README 标题改为：

```text
# AI Office Agent Assistant
```

但保留一句：

```text
由 AI Meeting Memory Assistant 升级而来，会议助手能力现在作为“会议纪要 Skill”保留。
```

README 应包含：

- 产品定位
- Skill 列表
- 现有会议能力说明
- 新增周报 / 需求评审能力
- Agent Plan 说明
- Prompt 链路
- 技术栈
- 运行方式
- 设计说明

## 14. 实施顺序

### Phase 1：产品骨架升级

目标：

- 改品牌名
- 新增 Skill 工作台
- sidebar 增加 Skill 导航
- 会议助手作为会议纪要 Skill 保留

验收：

- 原会议功能不受影响
- 首页能清楚看到 3 个 Skill
- UI 仍保持 Notion design-md 风格

### Phase 2：Agent Plan

目标：

- 新增 `/api/office/plan`
- 前端展示 Agent Plan
- 用户能看到任务如何被拆解

验收：

- 输入周报任务，系统能选择 `weekly_report`
- 输入需求评审任务，系统能选择 `prd_review`
- 输入会议文本，系统能选择 `meeting_minutes`

### Phase 3：周报生成 Skill

目标：

- 新增周报表单
- 新增周报 Prompt
- 返回结构化周报
- 支持保存 office output

验收：

- 能生成本周总结、完成事项、风险、下周计划、需协助事项
- 不把计划写成已完成
- 信息不足时明确标记

### Phase 4：需求评审 Skill

目标：

- 新增需求评审表单
- 新增 PRD Prompt
- 返回 PRD 草稿、验收标准、研发/测试关注点

验收：

- 验收标准可验证
- 能区分 scope 和 out_of_scope
- 能提示缺少用户反馈样本

### Phase 5：反馈与迭代

目标：

- 新增 feedback collection
- 输出记录可提交反馈
- 反馈页展示迭代清单

验收：

- 用户能给输出评分
- 能保存遗漏信息、幻觉问题、修改建议
- 能汇总成下一版优化建议

### Phase 6：文档和演示素材

目标：

- README 更新
- 新增产品说明书
- 新增用户操作教程
- 新增演示流程图

验收：

- 项目能作为求职作品展示
- 简历能写“PRD / 产品说明书 / 用户教程 / 反馈迭代”

## 15. 给 AI 编程助手的总 Prompt

下面这段可以直接给 AI 编程助手执行：

```text
你正在维护一个已有项目，不是从零开始。

项目路径：AI-Meeting-memory-assistant
当前技术栈：React + TypeScript + Vite + Express + PocketBase + OpenAI-compatible API。
当前产品：AI Meeting Memory Assistant，已实现用户登录、会议录音/音频转写、会议分析、质量自检、RAG 资料库、会议记忆库和会议追问。

任务：
请在现有项目基础上升级为 AI Office Agent Assistant。

硬性要求：
1. 不要完全重构。
2. 不要删除现有会议助手能力。
3. 将现有会议助手封装为“会议纪要 Skill”。
4. 新增“周报生成 Skill”和“需求评审 Skill”。
5. 新增 Agent Plan，用于展示用户目标、Skill 选择、信息缺口、执行步骤、输出物和风险提示。
6. 新增办公输出记录和用户反馈机制。
7. 保持现有 Notion design-md 风格，参考 DESIGN.md 和 VoltAgent/awesome-design-md 的 Notion 设计：深 navy、紫色主按钮、白色文档面板、8px 按钮、12px 卡片、pastel 色块。
8. 复用现有 auth、PocketBase、RAG、OpenAI-compatible API 调用。
9. 所有新增 AI 输出必须要求合法 JSON，并做 fallback 或错误提示。
10. 完成后不要破坏 npm run build。

优先修改：
- server/prompts.js：新增 office plan、weekly report、prd review、office quality check、feedback summary prompts。
- server/analyzer.js：新增 planOfficeTask 和 runOfficeSkill。
- server/index.js：新增 /api/office/plan、/api/office/run、/api/office/outputs、/api/office/outputs/:id/feedback。
- server/storage.js：新增 office output 和 feedback 的读写函数。
- src/types.ts：新增 SkillId、AgentPlan、OfficeTaskInput、WeeklyReportOutput、PrdReviewOutput、OfficeOutputRecord、OfficeFeedback。
- src/api.ts：新增 office API。
- src/App.tsx：新增 Skill 工作台、周报生成、需求评审、办公输出记录、反馈迭代视图。
- src/App.css：补充新视图样式，但保持现有设计 token。
- pb_migrations：新增 office_outputs 和 office_feedback collections。
- README.md：更新为 AI Office Agent Assistant，并说明会议助手作为会议纪要 Skill 被保留。

实施顺序：
1. 先新增类型、Prompt 和 API，不动原会议功能。
2. 再新增前端 Skill 工作台和周报/需求评审页面。
3. 再新增保存输出和反馈。
4. 最后更新 README 和文档。

验收标准：
- 原会议纪要功能仍可用。
- 用户登录后能进入 Skill 工作台。
- 周报生成 Skill 能输出结构化 JSON，并展示为可复制周报。
- 需求评审 Skill 能输出 PRD 草稿、验收标准、研发关注点、测试关注点。
- Agent Plan 在运行结果中可见。
- 用户能对办公输出提交反馈。
- UI 风格与现有 DESIGN.md 保持一致。
- npm run build 通过。
```

## 16. 简历更新方向

升级完成后，简历项目可以改成：

```text
AI Office Agent Assistant｜AI 办公智能体助手
基于 AI Meeting Memory Assistant 升级的办公 Agent 原型，围绕会议纪要、周报生成、需求评审 3 个高频办公场景，将 AI 能力抽象为可复用 Skill，支持语音转写、结构化纪要、RAG 资料库、长期记忆、Agent 任务拆解、办公文档生成和用户反馈迭代。

- 将原会议助手能力封装为会议纪要 Skill，支持录音/音频转写、会议理解、结构化摘要、关键决策/待办/风险提取、长期记忆沉淀和单场会议追问。
- 新增周报生成 Skill，基于工作记录、会议结论和待办状态生成结构化周报，输出完成事项、问题风险、下周计划和需协助事项。
- 新增需求评审 Skill，基于功能想法、用户反馈和 RAG 背景资料生成需求背景、用户痛点、功能目标、验收标准、研发/测试关注点和 PRD 草稿。
- 设计 Agent Plan 任务拆解模块，将用户自然语言请求拆解为意图识别、资料检索、Skill 选择、执行步骤、质量自检和结果保存。
- 构建用户反馈与迭代机制，收集准确性、可复制性、遗漏信息和修改成本等反馈，整理产品优化清单。
```

## 17. 不要做的事

不要在第一版做：

- 真实飞书 / Notion / 邮件 API 集成
- 多 Agent 并发执行
- 复杂工作流画布
- 完整插件市场
- 权限系统重写
- UI 全面换风格
- 把会议记录强行迁移到办公输出表

第一版目标是：

```text
在现有项目上，最小成本把单点会议助手升级为办公 Agent 多 Skill 原型。
```

