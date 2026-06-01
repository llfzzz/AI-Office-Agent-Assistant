const SENTENCE_LIMIT = 120;

function splitSentences(text) {
  return String(text || '')
    .split(/[。！？!?；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clip(text, size = SENTENCE_LIMIT) {
  const value = String(text || '').trim();
  return value.length > size ? `${value.slice(0, size)}...` : value;
}

function inferType(input, sentences) {
  if (input.meeting_type && input.meeting_type !== '自动识别') {
    return input.meeting_type;
  }

  const joined = sentences.join(' ');
  if (/bug|复盘|故障|线上|事故/i.test(joined)) return 'Bug复盘';
  if (/竞品|对标|市场|benchmark/i.test(joined)) return '竞品讨论';
  if (/进度|排期|里程碑|延期|本周|下周/i.test(joined)) return '项目进度会';
  if (/需求|评审|功能|版本|demo|原型/i.test(joined)) return '需求评审';
  return '其他';
}

function firstMatch(sentences, pattern) {
  return sentences.find((sentence) => pattern.test(sentence)) || sentences[0] || '原文未提供足够内容';
}

function extractOwner(sentence) {
  if (!sentence.includes('负责')) {
    return '未提及';
  }

  const compactMatch = sentence.match(/([\u4e00-\u9fa5A-Za-z]{1,8})(?:先|本周|这周|下周|今天|明天)?负责/);

  if (compactMatch?.[1]) {
    return compactMatch[1].replace(/(先|本周|这周|下周|今天|明天)$/u, '') || '未提及';
  }

  const before = sentence.split('负责')[0];
  const owner = before
    .split(/[,，、\s]+/)
    .filter(Boolean)
    .at(-1)
    ?.replace(/(先|本周|这周|下周|今天|明天)$/u, '');

  return owner || '未提及';
}

function extractDeadline(sentence) {
  const matches = sentence.match(/今天|明天|后天|本周|这周|下周|周[一二三四五六日天]|月底|月末|\d{1,2}月\d{1,2}日/);
  return matches?.[0] || '未提及';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractKeywords(input, sentences, meetingType) {
  const candidates = [
    meetingType,
    input.title,
    ...String(input.participants || '')
      .split(/[,，、\s]+/)
      .filter(Boolean),
  ];

  const dictionary = [
    'AI',
    '会议助手',
    'Prompt',
    '结构化纪要',
    '长期记忆',
    '风险',
    '待办',
    '决策',
    'JSON',
    'Demo',
    '转写',
    '语音识别',
    '模型',
    '接口',
    '前端',
    '后端',
  ];

  const joined = sentences.join(' ');
  dictionary.forEach((word) => {
    if (joined.includes(word)) candidates.push(word);
  });

  return unique(candidates).slice(0, 10);
}

export function fallbackAnalysis(input, warning) {
  const sentences = splitSentences(input.raw_transcript);
  const meetingType = inferType(input, sentences);
  const mainTopic = firstMatch(sentences, /讨论|主要|目标|功能|项目|版本|会议/);
  const explicitDecisions = sentences.filter((sentence) =>
    /决定|确定|明确|达成一致|拍板/i.test(sentence),
  );
  const decisionSentences =
    explicitDecisions.length > 0
      ? explicitDecisions
      : sentences.filter((sentence) => /先做|第一版要|第一版包含/i.test(sentence));
  const actionSentences = sentences.filter((sentence) =>
    /负责|完成|跟进|处理|整理|开发|设计|写|做|准备/i.test(sentence),
  );
  const riskSentences = sentences.filter((sentence) =>
    /风险|可能|担心|不稳定|解析失败|编造|影响|阻塞|遗漏/i.test(sentence),
  );
  const questionSentences = sentences.filter((sentence) =>
    /问题|未确定|待定|下次|再考虑|再看|没有结论/i.test(sentence),
  );
  const keywords = extractKeywords(input, sentences, meetingType);

  const meeting_understanding = {
    meeting_type: meetingType,
    main_topic: clip(mainTopic, 80),
    top_themes: unique([
      ...keywords.filter((keyword) => !['AI', 'Demo'].includes(keyword)).slice(0, 3),
      '会议记忆',
    ]).slice(0, 3),
    has_clear_decision: decisionSentences.length > 0,
    has_action_items: actionSentences.length > 0,
    notes_for_extraction: warning
      ? `当前使用演示解析：${warning}`
      : '当前使用演示解析，建议配置 GEMINI_API_KEY 运行真实 Prompt 链路。',
  };

  const structured_minutes = {
    meeting_type: meetingType,
    one_sentence_summary: clip(firstMatch(sentences, /决定|主要|目标|第一版|项目|功能/), 90),
    summary: clip(
      sentences.slice(0, 4).join('。') || '原始会议文本不足，暂无法形成完整摘要。',
      280,
    ),
    decisions: decisionSentences.slice(0, 5).map((sentence) => ({
      decision: clip(sentence, 100),
      evidence: clip(sentence, 120),
      confidence: /决定|确定|明确|达成一致|拍板/.test(sentence) ? 'high' : 'medium',
    })),
    action_items: actionSentences.slice(0, 6).map((sentence) => ({
      task: clip(sentence, 100),
      owner: extractOwner(sentence),
      deadline: extractDeadline(sentence),
      priority: /本周|今天|明天|风险|阻塞/.test(sentence) ? 'high' : 'medium',
      evidence: clip(sentence, 120),
    })),
    risks: riskSentences.slice(0, 5).map((sentence) => ({
      risk: clip(sentence, 100),
      impact: '可能影响进度、质量、协作或输出稳定性。',
      suggestion: '在后续执行中保留原文依据，并对不确定字段标记为低置信度。',
      confidence: /风险|不稳定|解析失败|编造/.test(sentence) ? 'high' : 'medium',
    })),
    open_questions: questionSentences.slice(0, 5).map((sentence) => ({
      question: clip(sentence, 100),
      why_it_matters: '该问题会影响后续行动边界或下一次会议准备。',
    })),
    long_term_memory: unique([
      input.title ? `会议主题：${input.title}` : '',
      input.participants ? `参会人：${input.participants}` : '',
      meetingType ? `会议类型：${meetingType}` : '',
      ...sentences.filter((sentence) => /背景|规则|约定|约束|偏好|第一版|长期/.test(sentence)).slice(0, 3),
    ])
      .filter(Boolean)
      .slice(0, 6)
      .map((memory) => ({
        memory: clip(memory, 120),
        category: /约束|规则/.test(memory) ? '业务规则' : '项目背景',
      })),
    keywords,
  };

  const quality_check = {
    has_hallucination: false,
    hallucination_items: [],
    questionable_decisions: [],
    questionable_action_items: [],
    missing_risks_or_questions: [],
    revision_suggestions: warning
      ? ['已降级为演示解析；配置 GEMINI_API_KEY 后可运行完整三段 Prompt 自检。']
      : [],
  };

  return {
    source: 'demo-fallback',
    provider: null,
    warnings: warning ? [warning] : ['未配置 GEMINI_API_KEY，当前结果来自本地演示解析。'],
    meeting_understanding,
    structured_minutes,
    quality_check,
  };
}

export function fallbackAnswer(meeting, question, warning) {
  const minutes = meeting.analysis?.structured_minutes || {};
  const text = String(question || '');
  let answer = '这条会议记录中没有明确提到';
  let evidence = '';
  let confidence = 'low';

  if (/谁|负责人|负责|跟进/.test(text) && minutes.action_items?.length) {
    const ownedItems = minutes.action_items.filter((item) => item.owner && item.owner !== '未提及');
    const sourceItems = ownedItems.length > 0 ? ownedItems : minutes.action_items;
    answer = sourceItems
      .map((item) => `${item.owner || '未提及'}：${item.task}`)
      .join('；');
    evidence = sourceItems.map((item) => item.evidence).filter(Boolean).join('；');
    confidence = 'medium';
  } else if (/风险|问题|阻塞/.test(text) && minutes.risks?.length) {
    answer = minutes.risks.map((item) => item.risk).join('；');
    evidence = minutes.risks.map((item) => item.suggestion).filter(Boolean).join('；');
    confidence = 'medium';
  } else if (/待办|准备|下次|行动/.test(text) && minutes.action_items?.length) {
    answer = minutes.action_items.map((item) => item.task).join('；');
    evidence = minutes.action_items.map((item) => item.evidence).filter(Boolean).join('；');
    confidence = 'medium';
  } else if (/决策|决定|结论/.test(text) && minutes.decisions?.length) {
    answer = minutes.decisions.map((item) => item.decision).join('；');
    evidence = minutes.decisions.map((item) => item.evidence).filter(Boolean).join('；');
    confidence = 'medium';
  } else if (/摘要|总结|讲了什么/.test(text) && minutes.summary) {
    answer = minutes.summary;
    evidence = minutes.one_sentence_summary || '';
    confidence = 'medium';
  }

  return {
    answer,
    evidence,
    confidence,
    source: 'demo-fallback',
    warnings: warning ? [warning] : ['未配置 GEMINI_API_KEY，当前回答来自本地会议记录匹配。'],
  };
}

function inferOfficeSkill(input) {
  if (['meeting_minutes', 'weekly_report', 'prd_review'].includes(input.skill_id)) {
    return input.skill_id;
  }

  const text = `${input.title || ''} ${input.content || ''}`;
  if (/周报|本周|下周|完成事项|工作记录/.test(text)) return 'weekly_report';
  if (/需求|PRD|验收|用户反馈|痛点|功能/.test(text)) return 'prd_review';
  return 'meeting_minutes';
}

function splitOfficeItems(input) {
  return splitSentences(input.content)
    .flatMap((sentence) => sentence.split(/[，,]/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOfficePlan(input, selectedSkill, ragContext, warning) {
  const isWeekly = selectedSkill === 'weekly_report';
  const isPrd = selectedSkill === 'prd_review';
  const requiredInputs = isWeekly
    ? ['工作记录', '周期', '下周计划']
    : isPrd
      ? ['功能想法', '目标用户', '用户反馈 / 痛点', '约束条件']
      : ['会议文本', '会议标题', '参会人'];
  const content = String(input.content || '').trim();
  const missingInformation = requiredInputs.filter((item) => {
    if (item === '周期') return !input.date && !input.metadata?.period;
    if (item.includes('下周计划')) return !input.metadata?.next_plan && !/下周|计划|继续|准备/.test(content);
    if (item.includes('用户反馈')) return !input.metadata?.feedback && !/反馈|痛点|用户|抱怨|希望/.test(content);
    if (item.includes('约束')) return !input.metadata?.constraints && !/约束|限制|风险|不能|必须/.test(content);
    return !content;
  });

  return {
    user_goal: input.title || (isWeekly ? '生成结构化周报' : isPrd ? '准备需求评审材料' : '生成会议纪要'),
    detected_intent: selectedSkill,
    selected_skill: selectedSkill,
    confidence: content.length > 80 ? 'medium' : 'low',
    required_inputs: requiredInputs,
    missing_information: missingInformation,
    use_rag: Boolean(ragContext?.enabled),
    execution_steps: isWeekly
      ? ['识别本周完成事项', '合并会议结论和待办状态', '整理风险与下周计划', '检查是否存在夸大或虚构']
      : isPrd
        ? ['识别用户痛点', '拆解产品目标和范围', '生成验收标准', '整理研发和测试关注点']
        : ['理解会议主题', '提取决策和待办', '整理风险和长期记忆', '执行质量自检'],
    expected_outputs: isWeekly
      ? ['本周总结', '完成事项', '关键进展', '问题风险', '下周计划', '需协助事项']
      : isPrd
        ? ['需求背景', '用户痛点', '产品目标', '功能范围', '验收标准', '研发 / 测试关注点', 'PRD 草稿']
        : ['摘要', '决策', '待办', '风险', '未解决问题', '长期记忆'],
    risk_notes: warning
      ? [`当前使用演示规划：${warning}`]
      : ['演示模式只做关键词级拆解，建议配置 GEMINI_API_KEY 运行真实 Agent Plan。'],
  };
}

function buildFallbackWeeklyOutput(input) {
  const items = splitOfficeItems(input);
  const completed = items.filter((item) => /完成|上线|交付|推进|整理|修复|对齐|评审|实现|发布|已/.test(item));
  const risks = items.filter((item) => /风险|阻塞|延期|问题|不稳定|缺少|依赖|卡住|未明确/.test(item));
  const plans = [
    ...items.filter((item) => /下周|计划|准备|继续|待|跟进/.test(item)),
    input.metadata?.next_plan,
  ].filter(Boolean);
  const summary = completed[0] || items[0] || '本周工作记录信息不足，建议补充关键完成事项。';

  return {
    one_sentence_summary: clip(summary, 100),
    completed_items: (completed.length ? completed : items.slice(0, 3)).slice(0, 6).map((item) => ({
      item: clip(item, 120),
      evidence: clip(item, 140),
      impact: /完成|上线|交付|发布/.test(item) ? '形成阶段性交付。' : '推动相关工作继续前进。',
    })),
    key_progress: unique(items.filter((item) => /推进|对齐|评审|实现|联调|测试|设计/.test(item)).slice(0, 6)),
    risks: risks.slice(0, 5).map((risk) => ({
      risk: clip(risk, 120),
      impact: '可能影响后续交付节奏或协作效率。',
      suggestion: '补充责任人、截止时间和依赖方后继续跟进。',
    })),
    next_week_plan: (plans.length ? plans : ['建议补充下周计划，并区分已确定事项和待确认事项。']).slice(0, 5).map((plan) => ({
      plan: clip(plan, 120),
      basis: /下周|计划|准备|继续|待|跟进/.test(plan) ? '明确输入' : '基于未完成事项的建议',
    })),
    support_needed: risks.length ? ['需要相关依赖方明确优先级、资源或截止时间。'] : ['未提及'],
    copy_ready_report: [
      `本周总结：${clip(summary, 140)}`,
      `完成事项：${(completed.length ? completed : items.slice(0, 3)).map((item) => `\n- ${clip(item, 100)}`).join('') || '\n- 未提及'}`,
      `问题与风险：${risks.map((item) => `\n- ${clip(item, 100)}`).join('') || '\n- 未提及'}`,
      `下周计划：${plans.map((item) => `\n- ${clip(item, 100)}`).join('') || '\n- 建议补充'}`,
    ].join('\n\n'),
  };
}

function buildFallbackPrdOutput(input) {
  const items = splitOfficeItems(input);
  const painItems = items.filter((item) => /痛点|反馈|问题|无法|效率|成本|抱怨|希望|不清楚|困难/.test(item));
  const scopeItems = items.filter((item) => /功能|支持|允许|提供|新增|需要|实现|入口|流程/.test(item));
  const riskItems = items.filter((item) => /风险|约束|限制|不能|必须|依赖|权限|性能|准确/.test(item));
  const featureName = input.metadata?.feature_name || input.title || '未命名功能';

  return {
    background: clip(input.metadata?.business_context || items[0] || '建议补充业务背景和目标场景。', 240),
    user_pain_points: (painItems.length ? painItems : ['建议补充用户反馈样本']).slice(0, 5).map((pain, index) => ({
      pain: clip(pain, 120),
      source: painItems.length ? '用户输入' : '信息缺口',
      severity: index === 0 && painItems.length ? 'medium' : 'low',
    })),
    product_goals: [
      `${featureName} 需要回应已提供的用户痛点。`,
      '输出必须可被评审、拆解和验收。',
    ],
    user_flow: ['用户进入功能入口', '输入或选择必要材料', '系统生成结构化结果', '用户检查、修改并保存'],
    scope: (scopeItems.length ? scopeItems : [`${featureName} 的核心能力待进一步明确`]).slice(0, 6),
    out_of_scope: ['复杂权限体系重构', '第三方办公系统深度集成', '未提供依据的自动决策'],
    acceptance_criteria: [
      {
        criterion: '用户提供必要输入后，系统能生成包含背景、痛点、范围和验收标准的 PRD 草稿。',
        verification_method: '使用一组包含功能想法和用户反馈的样例输入进行端到端验证。',
      },
      {
        criterion: '缺少用户反馈时，输出明确提示需要补充，而不是编造痛点。',
        verification_method: '用不含反馈的输入测试输出中的缺口提示。',
      },
    ],
    engineering_notes: ['需要保留原始输入、Agent Plan、输出和质量自检结果。', '保存记录应绑定当前用户。'],
    testing_notes: ['测试空输入、超长输入、缺少用户反馈、含 RAG 背景等路径。', '检查验收标准是否可验证。'],
    risks: (riskItems.length ? riskItems : ['用户反馈不足会导致需求判断置信度偏低。']).slice(0, 5).map((risk) => ({
      risk: clip(risk, 120),
      mitigation: '在评审前补充样本、约束或数据依据。',
    })),
    prd_draft: `# ${featureName}\n\n## 背景\n${clip(input.metadata?.business_context || items[0] || '建议补充业务背景。', 220)}\n\n## 用户痛点\n${(painItems.length ? painItems : ['建议补充用户反馈样本']).map((item) => `- ${clip(item, 100)}`).join('\n')}\n\n## 功能范围\n${(scopeItems.length ? scopeItems : [`明确 ${featureName} 的核心功能边界`]).map((item) => `- ${clip(item, 100)}`).join('\n')}\n\n## 验收标准\n- 能基于输入生成可评审草稿。\n- 信息不足时明确标记缺口，不编造事实。`,
  };
}

export function fallbackOfficePlan(input, ragContext, warning) {
  return normalizeOfficePlan(input, inferOfficeSkill(input), ragContext, warning);
}

export function fallbackOfficeRun(input, ragContext, warning) {
  const agent_plan = fallbackOfficePlan(input, ragContext, warning);
  const skill_output =
    agent_plan.selected_skill === 'prd_review'
      ? buildFallbackPrdOutput(input)
      : buildFallbackWeeklyOutput(input);

  return {
    source: 'demo-fallback',
    provider: null,
    warnings: warning ? [warning] : ['未配置 GEMINI_API_KEY，当前结果来自本地演示解析。'],
    rag: ragContext,
    agent_plan,
    skill_output,
    quality_check: {
      has_hallucination: false,
      hallucination_items: [],
      overclaim_items: [],
      missing_key_points: agent_plan.missing_information,
      unclear_items: [],
      copy_ready_score: agent_plan.missing_information.length > 0 ? 3 : 4,
      revision_suggestions: agent_plan.missing_information.length
        ? ['补充 Agent Plan 标记的缺失信息后再次生成。']
        : ['演示模式已完成基础自检；配置 GEMINI_API_KEY 后可运行完整质量检查 Prompt。'],
    },
  };
}

export function fallbackFeedbackSummary(input, warning) {
  const feedback = input.feedback || {};
  const scores = [
    Number(feedback.accuracy_score || 0),
    Number(feedback.copyability_score || 0),
    Number(feedback.completeness_score || 0),
  ].filter(Boolean);
  const average = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : 0;

  return {
    feedback_summary:
      feedback.suggestion || feedback.missing_info || feedback.hallucination || '用户已提交评分，建议结合原输出继续观察。',
    problem_categories: [
      ...(feedback.hallucination ? ['幻觉问题'] : []),
      ...(feedback.missing_info ? ['完整性问题'] : []),
      ...(feedback.needs_heavy_edit ? ['可复制性问题'] : []),
      ...(average && average < 3 ? ['准确性问题'] : []),
      ...(!feedback.hallucination && !feedback.missing_info && !feedback.needs_heavy_edit ? ['其他'] : []),
    ],
    iteration_suggestions: [
      feedback.missing_info ? `补充缺失信息判断：${clip(feedback.missing_info, 120)}` : '',
      feedback.hallucination ? `加强幻觉检查：${clip(feedback.hallucination, 120)}` : '',
      feedback.suggestion ? clip(feedback.suggestion, 140) : '',
      warning ? `演示反馈总结：${warning}` : '',
    ].filter(Boolean),
    priority: average && average < 3 ? 'high' : feedback.needs_heavy_edit ? 'medium' : 'low',
    next_prompt_adjustment: '在对应 Skill Prompt 中强化“只能基于输入”和“信息不足需标记”的约束。',
    next_product_adjustment: '在表单中补充信息缺口提示，并把低分输出纳入反馈迭代页。',
  };
}
