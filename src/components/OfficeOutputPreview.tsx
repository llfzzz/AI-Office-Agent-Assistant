import { TintPanel } from '../ui';
import { isPrdOutput, isStructuredMinutes, isWeeklyOutput } from '../lib/office';
import type { PrdReviewOutput, SkillId, StructuredMinutes, WeeklyReportOutput } from '../types';

/** Renders the body of a generated office output (weekly / prd / minutes). */
export function OfficeOutputPreview({
  output,
  skillId,
}: {
  output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes;
  skillId: SkillId;
}) {
  if (skillId === 'weekly_report' && isWeeklyOutput(output)) {
    return (
      <div className="report-body" style={{ display: 'grid', gap: 16 }}>
        <div className="report-title">{output.one_sentence_summary || '本周工作周报'}</div>

        <div className="report-section">
          <h4>本周完成</h4>
          <ul>
            {output.completed_items.length === 0 ? (
              <li className="list-empty">未提及</li>
            ) : (
              output.completed_items.map((item, index) => <li key={index}>{item.item}</li>)
            )}
          </ul>
        </div>

        <div className="report-section">
          <h4>关键进展</h4>
          <ul>
            {output.key_progress.length === 0 ? (
              <li className="list-empty">未提及</li>
            ) : (
              output.key_progress.map((item, index) => <li key={index}>{item}</li>)
            )}
          </ul>
        </div>

        <div className="report-section">
          <h4>下周计划</h4>
          <ul>
            {output.next_week_plan.length === 0 ? (
              <li className="list-empty">未提及</li>
            ) : (
              output.next_week_plan.map((item, index) => (
                <li key={index}>
                  {item.plan}
                  {item.basis && <span> · {item.basis}</span>}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    );
  }

  if (skillId === 'prd_review' && isPrdOutput(output)) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {output.background && (
          <div className="report-title" style={{ fontSize: 17 }}>
            {output.background}
          </div>
        )}
        <TintPanel tone="peach" title="产品目标">
          {output.product_goals.length === 0 ? (
            <p className="list-empty">未提及</p>
          ) : (
            output.product_goals.map((goal, index) => <div key={index}>{goal}</div>)
          )}
        </TintPanel>
        <TintPanel tone="sky" title="核心范围">
          {output.scope.length === 0 ? (
            <p className="list-empty">未提及</p>
          ) : (
            output.scope.map((item, index) => <div key={index}>{item}</div>)
          )}
        </TintPanel>
        <TintPanel tone="mint" title="验收标准">
          {output.acceptance_criteria.length === 0 ? (
            <p className="list-empty">未提及</p>
          ) : (
            output.acceptance_criteria.map((item, index) => (
              <div key={index}>
                <strong>{item.criterion}</strong>
                {item.verification_method && <div className="mono-line">{item.verification_method}</div>}
              </div>
            ))
          )}
        </TintPanel>
        <TintPanel tone="rose" title="主要风险">
          {output.risks.length === 0 ? (
            <p className="list-empty">未提及</p>
          ) : (
            output.risks.map((item, index) => (
              <div key={index}>
                <strong>{item.risk}</strong>
                {item.mitigation && <div className="mono-line">{item.mitigation}</div>}
              </div>
            ))
          )}
        </TintPanel>
      </div>
    );
  }

  return (
    <TintPanel tone="peach" title="会议纪要输出">
      <p>{isStructuredMinutes(output) ? output.summary || output.one_sentence_summary : '已生成输出'}</p>
    </TintPanel>
  );
}
