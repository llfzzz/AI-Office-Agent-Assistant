import type { PrdReviewOutput, SkillId, StructuredMinutes, WeeklyReportOutput } from '../types';

export function skillName(skillId: SkillId | string) {
  if (skillId === 'meeting_minutes') return '会议纪要';
  if (skillId === 'prd_review') return '需求评审';
  return '周报生成';
}

export function isWeeklyOutput(
  output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes,
): output is WeeklyReportOutput {
  return 'copy_ready_report' in output;
}

export function isPrdOutput(
  output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes,
): output is PrdReviewOutput {
  return 'prd_draft' in output;
}

export function isStructuredMinutes(
  output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes,
): output is StructuredMinutes {
  return 'one_sentence_summary' in output && 'decisions' in output;
}
