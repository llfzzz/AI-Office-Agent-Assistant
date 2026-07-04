function formatRagContext(ragContext) {
  if (!ragContext?.enabled || !ragContext.context) {
    return '未启用。';
  }

  return `已启用。以下是用户资料库检索结果，只能用于补充项目背景、术语、业务规则和协作约定；会议决策、待办、风险仍必须以会议原文为准。\n\n${ragContext.context}`;
}

function formatOfficeInput(input) {
  const metadata = Object.entries(input.metadata || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `- ${key}：${value}`)
    .join('\n');
  const linkedMeetings = String(input.linked_meetings_context || '').trim();

  return `Skill：${input.skill_id || '未指定'}
标题：${input.title || '未提及'}
日期 / 周期：${input.date || '未提及'}
补充字段：
${metadata || '未提及'}
关联会议：
${linkedMeetings || '未选择'}

用户输入：
${input.content || '未提及'}`;
}

export function buildOfficePlanMessages(input, ragContext) {
  return [
    {
      role: 'system',
      content:
        '你是 AI Office Agent Assistant 的任务规划模块。你只输出合法 JSON，不生成最终办公文档。',
    },
    {
      role: 'user',
      content: `产品背景：
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
${formatOfficeInput(input)}

可用 RAG 资料摘要：
${formatRagContext(ragContext)}`,
    },
  ];
}

export function buildWeeklyReportMessages(input, agentPlan, ragContext) {
  return [
    {
      role: 'system',
      content:
        '你是 AI Office Agent Assistant 中的周报生成 Skill。你把零散工作记录整理成真实、结构化、可复制的周报，输出合法 JSON。',
    },
    {
      role: 'user',
      content: `Agent Plan：
${JSON.stringify(agentPlan, null, 2)}

RAG 资料库上下文：
${formatRagContext(ragContext)}

输入内容：
${formatOfficeInput(input)}

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
}`,
    },
  ];
}

export function buildPrdReviewMessages(input, agentPlan, ragContext) {
  return [
    {
      role: 'system',
      content:
        '你是 AI Office Agent Assistant 中的需求评审准备 Skill。你帮助产品实习生把功能想法、用户反馈和背景资料整理为可评审的 PRD 草稿，输出合法 JSON。',
    },
    {
      role: 'user',
      content: `Agent Plan：
${JSON.stringify(agentPlan, null, 2)}

RAG 资料库上下文：
${formatRagContext(ragContext)}

输入内容：
${formatOfficeInput(input)}

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
}`,
    },
  ];
}

export function buildOfficeQualityCheckMessages(input, agentPlan, skillOutput) {
  return [
    {
      role: 'system',
      content:
        '你是 AI Office Agent Assistant 的输出质量检查器。你检查 Skill 输出是否符合输入、Agent Plan 和产品要求，输出合法 JSON。',
    },
    {
      role: 'user',
      content: `检查重点：
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
${formatOfficeInput(input)}

Agent Plan：
${JSON.stringify(agentPlan, null, 2)}

Skill 输出：
${JSON.stringify(skillOutput, null, 2)}`,
    },
  ];
}

export function buildFeedbackSummaryMessages(feedbackInput) {
  return [
    {
      role: 'system',
      content:
        '你是 AI Office Agent Assistant 的产品迭代分析模块。你根据用户反馈整理 Skill 优化建议，输出合法 JSON。',
    },
    {
      role: 'user',
      content: `输入：
${JSON.stringify(feedbackInput, null, 2)}

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
}`,
    },
  ];
}

export function buildUnderstandingMessages(input, ragContext) {
  return [
    {
      role: 'system',
      content:
        '你是一个 AI 会议记忆产品中的会议理解模块。你只基于用户提供的会议信息判断上下文，不编造事实，输出合法 JSON。',
    },
    {
      role: 'user',
      content: `产品背景：
用户会输入一段会议转写文本。文本可能口语化、重复、断句混乱、多人观点交织。
你的任务是先理解会议上下文，为后续结构化提取做准备。

RAG 资料库上下文：
${formatRagContext(ragContext)}

会议元信息：
- 标题：${input.title || '未提及'}
- 日期：${input.date || '未提及'}
- 用户选择的会议类型：${input.meeting_type || '未提及'}
- 参会人：${input.participants || '未提及'}

请基于原文完成：
1. 判断会议类型。
2. 判断会议主要讨论对象。
3. 判断会议中最重要的 3 个主题。
4. 判断是否存在明确结论。
5. 判断是否存在后续行动。

约束：
- 只能基于原文。
- 不要编造。
- 如果无法判断，写“无法判断”。
- 输出必须是合法 JSON，不要输出 JSON 以外的任何内容。

输出格式：
{
  "meeting_type": "",
  "main_topic": "",
  "top_themes": [],
  "has_clear_decision": true,
  "has_action_items": true,
  "notes_for_extraction": ""
}

会议文本：
${input.raw_transcript}`,
    },
  ];
}

export function buildMinutesMessages(input, meetingUnderstanding, ragContext) {
  return [
    {
      role: 'system',
      content:
        '你是一个 AI 会议记忆产品中的结构化分析引擎。你的目标不是简单总结，而是把会议内容整理成可执行、可追踪、可检索的会议记忆。输出合法 JSON。',
    },
    {
      role: 'user',
      content: `会议理解结果：
${JSON.stringify(meetingUnderstanding, null, 2)}

RAG 资料库上下文：
${formatRagContext(ragContext)}

会议元信息：
- 标题：${input.title || '未提及'}
- 日期：${input.date || '未提及'}
- 参会人：${input.participants || '未提及'}

请从会议文本中提取：
1. 会议类型
2. 一句话结论
3. 会议摘要
4. 关键决策
5. 待办事项
6. 风险点
7. 未解决问题
8. 长期记忆点
9. 搜索关键词

判断标准：
- 决策：已经明确达成一致或明确拍板的内容。
- 待办：后续需要执行的具体动作。
- 风险：可能影响进度、质量、上线、协作或用户体验的问题。
- 未解决问题：会议中提到但尚未有结论的问题。
- 长期记忆：未来可能复用的信息，例如项目背景、用户偏好、业务规则、协作约定、技术约束。

约束：
1. 只能基于原文，不要编造。
2. RAG 资料库只能帮助理解背景、术语和长期记忆分类，不能替代会议原文作为决策或待办依据。
3. 如果负责人或截止时间未出现，填写“未提及”。
4. 不要把讨论中的想法误判为决策。
5. 每个决策和待办都要给出原文依据。
6. 不确定的信息在 confidence 字段标记为 low。
7. 输出必须是合法 JSON。
8. 不要输出 JSON 以外的任何内容。

输出 JSON 结构：
{
  "meeting_type": "需求评审 / 项目进度会 / Bug复盘 / 竞品讨论 / 其他",
  "one_sentence_summary": "",
  "summary": "",
  "decisions": [
    {
      "decision": "",
      "evidence": "",
      "confidence": "high / medium / low"
    }
  ],
  "action_items": [
    {
      "task": "",
      "owner": "",
      "deadline": "",
      "priority": "high / medium / low",
      "evidence": ""
    }
  ],
  "risks": [
    {
      "risk": "",
      "impact": "",
      "suggestion": "",
      "confidence": "high / medium / low"
    }
  ],
  "open_questions": [
    {
      "question": "",
      "why_it_matters": ""
    }
  ],
  "long_term_memory": [
    {
      "memory": "",
      "category": "项目背景 / 用户偏好 / 业务规则 / 协作约定 / 技术约束"
    }
  ],
  "keywords": []
}

会议文本：
${input.raw_transcript}`,
    },
  ];
}

export function buildQualityCheckMessages(input, structuredMinutes) {
  return [
    {
      role: 'system',
      content:
        '你是一个 AI 会议纪要质量检查器。你检查结构化会议纪要是否严格基于原文，输出合法 JSON。',
    },
    {
      role: 'user',
      content: `请检查下面的结构化会议纪要是否严格基于原始会议文本。

检查重点：
1. 是否存在原文没有提到的信息。
2. 是否把讨论中的想法误判为决策。
3. 是否把模糊表达误判为明确待办。
4. 是否遗漏明显的风险或未解决问题。
5. 是否有负责人、截止时间被错误补全。

请输出：
{
  "has_hallucination": true,
  "hallucination_items": [],
  "questionable_decisions": [],
  "questionable_action_items": [],
  "missing_risks_or_questions": [],
  "revision_suggestions": []
}

原始会议文本：
${input.raw_transcript}

结构化会议纪要：
${JSON.stringify(structuredMinutes, null, 2)}`,
    },
  ];
}

export function buildAskMessages(meeting, question) {
  return [
    {
      role: 'system',
      content:
        '你是一个 AI 会议记忆助手。你只能基于给定会议记录回答问题。如果会议记录中没有答案，回答“这条会议记录中没有明确提到”。不要编造。',
    },
    {
      role: 'user',
      content: `会议记录：
${JSON.stringify(meeting, null, 2)}

用户问题：
${question}

回答要求：
1. 先给出直接答案。
2. 如果有依据，引用会议记录中的相关内容。
3. 如果信息不确定，说明不确定原因。

输出格式：
{
  "answer": "",
  "evidence": "",
  "confidence": "high / medium / low"
}`,
    },
  ];
}
