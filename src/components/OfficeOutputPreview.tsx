import { SimpleListBlock } from './ListBlock';
import { isPrdOutput, isStructuredMinutes, isWeeklyOutput } from '../lib/office';
import type { PrdReviewOutput, SkillId, StructuredMinutes, WeeklyReportOutput } from '../types';

export function OfficeOutputPreview({
  output,
  skillId,
}: {
  output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes;
  skillId: SkillId;
}) {
  if (skillId === 'weekly_report' && isWeeklyOutput(output)) {
    return (
      <section className="panel office-output-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Skill 输出</span>
            <h2>{output.one_sentence_summary}</h2>
          </div>
        </div>
        <div className="result-grid">
          <SimpleListBlock title="完成事项" tone="mint" items={output.completed_items.map((item) => item.item)} />
          <SimpleListBlock title="关键进展" tone="sky" items={output.key_progress} />
          <SimpleListBlock title="问题与风险" tone="peach" items={output.risks.map((item) => item.risk)} />
          <SimpleListBlock title="下周计划" tone="lavender" items={output.next_week_plan.map((item) => item.plan)} />
        </div>
        <pre className="copy-block">{output.copy_ready_report}</pre>
      </section>
    );
  }

  if (skillId === 'prd_review' && isPrdOutput(output)) {
    return (
      <section className="panel office-output-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">PRD 草稿</span>
            <h2>{output.background}</h2>
          </div>
        </div>
        <div className="result-grid">
          <SimpleListBlock title="用户痛点" tone="rose" items={output.user_pain_points.map((item) => item.pain)} />
          <SimpleListBlock title="功能范围" tone="sky" items={output.scope} />
          <SimpleListBlock title="验收标准" tone="mint" items={output.acceptance_criteria.map((item) => item.criterion)} />
          <SimpleListBlock title="风险点" tone="peach" items={output.risks.map((item) => item.risk)} />
        </div>
        <pre className="copy-block">{output.prd_draft}</pre>
      </section>
    );
  }

  return (
    <section className="panel office-output-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">会议纪要 Skill 输出</span>
          <h2>{isStructuredMinutes(output) ? output.one_sentence_summary : '已生成输出'}</h2>
        </div>
      </div>
      {isStructuredMinutes(output) && (
        <div className="summary-block">
          <p>{output.summary}</p>
        </div>
      )}
    </section>
  );
}
