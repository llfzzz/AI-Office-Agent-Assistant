import type { MeetingInput } from './types';

export const meetingTypes = ['自动识别', '需求评审', '项目进度会', 'Bug复盘', '竞品讨论', '其他'];

export const sampleMeeting: MeetingInput = {
  title: 'AI 会议助手第一版功能讨论',
  date: new Date().toISOString().slice(0, 10),
  meeting_type: '需求评审',
  participants: '小罗, 产品负责人, 后端同学',
  raw_transcript:
    '今天主要讨论 AI 会议助手第一版功能。小罗先负责做一个文本输入页面，不用先接语音识别，先支持用户粘贴会议转写内容。首页需要有会议标题、参会人、会议类型和正文输入框。\n\n关于 AI 输出，第一版要包含摘要、待办、关键决策和风险点。负责人如果没有提到，就不要乱填。我们决定本周先做 Demo，下周再考虑接入真实大模型 API。\n\n风险是模型可能会编造没有提到的信息，所以需要在 Prompt 里要求引用原文依据。另一个问题是输出 JSON 可能不稳定，需要后端做解析失败处理。\n\n小罗这周完成前端页面和 mock 数据，后端接口可以先简单写。下次会议再看效果。',
};
