import type {
  AgentPlan,
  PlanExecutionStep,
  PlanMissingInformation,
  PlanRisk,
  PrdReviewOutput,
  QualityCheck,
  SkillId,
  StructuredMinutes,
  WeeklyReportOutput,
} from '../types';

export function skillName(skillId: SkillId | string) {
  if (skillId === 'meeting_minutes') return '会议纪要';
  if (skillId === 'prd_review') return '需求评审';
  return '周报生成';
}

// --- Plan helpers (tolerate legacy v1 plans on saved records) --------------

export function planMissingInfo(plan: AgentPlan | null | undefined): PlanMissingInformation[] {
  return (plan?.missing_information || [])
    .map((entry) =>
      typeof entry === 'string'
        ? { field: entry, reason: '', blocking: false, fallback_strategy: '' }
        : entry,
    )
    .filter((entry) => entry && entry.field);
}

export function planSteps(plan: AgentPlan | null | undefined): PlanExecutionStep[] {
  return (plan?.execution_steps || [])
    .map((entry, index) =>
      typeof entry === 'string'
        ? { step: index + 1, action: entry, inputs: [], expected_result: '', quality_gate: '' }
        : entry,
    )
    .filter((entry) => entry && entry.action);
}

export function planRisks(plan: AgentPlan | null | undefined): PlanRisk[] {
  if (plan?.risk_register?.length) {
    return plan.risk_register.filter((entry) => entry && entry.risk);
  }

  return (plan?.risk_notes || [])
    .filter(Boolean)
    .map((risk) => ({ risk, likelihood: '', impact: '', mitigation: '' }));
}

// --- Quality-gate helpers (v2 verdict + legacy score shapes) ---------------

export type QualityVerdict = 'pass' | 'revise' | 'blocked';

export interface QualityStatus {
  verdict: QualityVerdict;
  label: string;
  detail: string;
  issueCount: number;
  missingCount: number;
}

export function qualityStatus(
  check: QualityCheck | null | undefined,
  revisionApplied?: boolean,
): QualityStatus {
  const source = check || {};
  const issues = source.issues || [];
  const missing = [
    ...(source.missing_information || []),
    ...(source.missing_key_points || []),
    ...(source.missing_risks_or_questions || []),
  ];

  let verdict: QualityVerdict;

  if (source.verdict === 'pass' || source.verdict === 'revise' || source.verdict === 'blocked') {
    verdict = source.verdict;
  } else {
    // Legacy record: derive a verdict from the old score/hallucination fields.
    const legacyIssues =
      (source.hallucination_items?.length || 0) +
      (source.overclaim_items?.length || 0) +
      (source.questionable_decisions?.length || 0) +
      (source.questionable_action_items?.length || 0);
    const score = source.copy_ready_score ?? (source.has_hallucination ? 2 : 4);
    verdict = source.has_hallucination || legacyIssues > 0 ? 'revise' : score >= 4 ? 'pass' : score <= 1 ? 'blocked' : 'revise';
  }

  const issueCount =
    issues.length ||
    (source.hallucination_items?.length || 0) +
      (source.overclaim_items?.length || 0) +
      (source.questionable_decisions?.length || 0) +
      (source.questionable_action_items?.length || 0) +
      (source.unclear_items?.length || 0);

  const label =
    verdict === 'pass'
      ? revisionApplied
        ? '质量检查通过 · 已自动修订一次'
        : '质量检查通过'
      : verdict === 'revise'
        ? revisionApplied
          ? '已自动修订一次 · 建议人工复核'
          : '建议人工复核'
        : '关键信息不足，结果仅供参考';

  const detailParts = [
    issueCount > 0 ? `${issueCount} 项待复核问题` : '未发现明显问题',
    missing.length > 0 ? `${missing.length} 项信息待补充` : '',
  ].filter(Boolean);

  return {
    verdict,
    label,
    detail: detailParts.join(' · '),
    issueCount,
    missingCount: missing.length,
  };
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
