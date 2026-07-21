import type {
  MeetingAttachmentKind,
  MeetingInput,
  OfficeTaskInput,
  SkillId,
  View,
} from '../types';

export const meetingTypes = ['自动识别', '需求评审', '项目进度会', 'Bug复盘', '竞品讨论', '其他'];

export const sampleMeeting: MeetingInput = {
  title: 'AI 工作台第一版功能评审',
  date: new Date().toISOString().slice(0, 10),
  meeting_type: '需求评审',
  participants: '林岚, 产品负责人, 后端同学',
  raw_transcript:
    '今天主要评审 AI 工作台第一版功能范围。林岚先负责搭建会议材料输入页面，第一版先支持用户粘贴会议转写内容，语音识别放到后续迭代。首页需要有会议标题、参会人、会议类型和正文输入框。\n\n关于 AI 输出，第一版要包含摘要、待办、关键决策和风险点。负责人如果没有提到，就不要臆测补全。本周先完成核心链路，下周接入生产环境的大模型 API。\n\n风险是模型可能会编造没有提到的信息，所以需要在 Prompt 里要求引用原文依据。另一个问题是输出 JSON 可能不稳定，需要后端做解析失败兜底处理。\n\n林岚本周完成输入页面与结构化输出，后端先提供基础接口。下次会议复盘生成效果。',
};

export const attachmentKindLabels: Record<MeetingAttachmentKind, string> = {
  recording: '录音',
  audio: '音频',
  image: '图片',
  file: '文件',
};

export const meetingFileAccept = [
  '.txt',
  '.text',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.log',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
  '.rtf',
  '.docx',
  '.odt',
  '.pptx',
  '.xlsx',
  'text/*',
  'application/json',
  'text/csv',
  'text/tab-separated-values',
  'application/xml',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

export const blankForm: MeetingInput = {
  title: '',
  date: new Date().toISOString().slice(0, 10),
  meeting_type: '自动识别',
  participants: '',
  raw_transcript: '',
};

export const blankWeeklyTask: OfficeTaskInput = {
  skill_id: 'weekly_report',
  title: '本周工作周报',
  date: '',
  content: '',
  metadata: {
    period: '',
    next_plan: '',
  },
  rag: { enabled: false },
  linked_meeting_ids: [],
};

export const blankPrdTask: OfficeTaskInput = {
  skill_id: 'prd_review',
  title: '新功能需求评审',
  content: '',
  metadata: {
    feature_name: '',
    target_user: '',
    feedback: '',
    business_context: '',
    constraints: '',
  },
  rag: { enabled: false },
  linked_meeting_ids: [],
};

export const skillCards: Array<{
  id: SkillId;
  title: string;
  scene: string;
  inputs: string;
  outputs: string;
  users: string;
  risk: string;
  tone: 'meeting' | 'weekly' | 'prd';
  view: View;
}> = [
  {
    id: 'meeting_minutes',
    title: '会议纪要 Skill',
    scene: '把录音、音频或会议转写稿整理为可追踪的会议记忆。',
    inputs: '录音、音频文件、会议转写稿、参会人、会议类型',
    outputs: '摘要、决策、待办、风险、未解决问题、长期记忆',
    users: '产品、项目、研发协作会议记录者',
    risk: '决策和待办必须来自会议原文，不能由 RAG 背景替代。',
    tone: 'meeting',
    view: 'compose',
  },
  {
    id: 'weekly_report',
    title: '周报生成 Skill',
    scene: '把工作记录、会议结论和待办状态整理成结构化周报。',
    inputs: '工作记录、周期、引用会议、下周计划草稿',
    outputs: '本周总结、完成事项、关键进展、风险、下周计划',
    users: '实习生、项目成员、需要复盘进展的协作者',
    risk: '不能把计划写成已完成，缺少结果时需要标记为建议。',
    tone: 'weekly',
    view: 'weekly',
  },
  {
    id: 'prd_review',
    title: '需求评审 Skill',
    scene: '把功能想法、用户反馈和背景资料整理为可评审 PRD 草稿。',
    inputs: '功能想法、目标用户、反馈痛点、业务背景、约束条件',
    outputs: '需求背景、痛点、范围、验收标准、研发/测试关注点',
    users: '产品实习生、业务分析、需求评审准备者',
    risk: '缺少用户反馈时必须提示补充，不能编造痛点和数据。',
    tone: 'prd',
    view: 'prd',
  },
];
