import { TintPanel } from '../ui';
import { isPrdOutput, isStructuredMinutes, isWeeklyOutput } from '../lib/office';
import type { PrdReviewOutput, SkillId, StructuredMinutes, WeeklyReportOutput } from '../types';

function readinessLabel(level: string | undefined) {
  if (level === 'ready') return '可进入评审';
  if (level === 'not_ready') return '暂不具备评审条件';
  return '补充后可评审';
}

/** Renders the body of a generated office output (weekly / prd / minutes).
 * New v2 sections render only when present so legacy records stay intact. */
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
        <div className="report-title">{output.executive_summary || output.one_sentence_summary || '本周工作周报'}</div>
        {output.reporting_period && output.reporting_period !== '未提及' && (
          <div className="mono-line">报告周期：{output.reporting_period}</div>
        )}

        <div className="report-section">
          <h4>本周完成</h4>
          <ul>
            {output.completed_items.length === 0 ? (
              <li className="list-empty">未提及</li>
            ) : (
              output.completed_items.map((item, index) => (
                <li key={index}>
                  {item.item}
                  {item.impact && <span> · {item.impact}</span>}
                </li>
              ))
            )}
          </ul>
        </div>

        {output.in_progress && output.in_progress.length > 0 && (
          <div className="report-section">
            <h4>进行中</h4>
            <ul>
              {output.in_progress.map((item, index) => (
                <li key={index}>
                  {item.item}
                  {item.status && <span> · {item.status}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

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

        {output.blockers && output.blockers.length > 0 && (
          <div className="report-section">
            <h4>阻塞项</h4>
            <ul>
              {output.blockers.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="report-section">
          <h4>下周计划</h4>
          <ul>
            {output.next_week_plan.length === 0 ? (
              <li className="list-empty">未提及</li>
            ) : (
              output.next_week_plan.map((item, index) => (
                <li key={index}>
                  {item.objective || item.plan}
                  {item.priority && <span> · {item.priority}</span>}
                  {item.basis && <span> · {item.basis}</span>}
                </li>
              ))
            )}
          </ul>
        </div>

        {output.management_highlights && output.management_highlights.length > 0 && (
          <div className="report-section">
            <h4>管理层要点</h4>
            <ul>
              {output.management_highlights.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (skillId === 'prd_review' && isPrdOutput(output)) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {output.review_readiness && (
          <TintPanel tone="yellow" title={`评审结论 · ${readinessLabel(output.review_readiness.level)}`}>
            <p>{output.review_readiness.conclusion || '结合缺口信息判断评审就绪度。'}</p>
          </TintPanel>
        )}
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
        <TintPanel tone="sky" title={output.functional_requirements?.length ? '功能需求' : '核心范围'}>
          {output.functional_requirements?.length ? (
            output.functional_requirements.map((item) => (
              <div key={item.id}>
                <strong>
                  {item.id} · {item.priority}
                </strong>
                <div>{item.requirement}</div>
              </div>
            ))
          ) : output.scope.length === 0 ? (
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
                {(item.given || item.when || item.then) && (
                  <div className="mono-line">
                    {[item.given && `Given ${item.given}`, item.when && `When ${item.when}`, item.then && `Then ${item.then}`]
                      .filter(Boolean)
                      .join(' / ')}
                  </div>
                )}
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
        {output.open_questions && output.open_questions.length > 0 && (
          <TintPanel tone="lavender" title="待确认问题">
            {output.open_questions.map((question, index) => (
              <div key={index}>{question}</div>
            ))}
          </TintPanel>
        )}
      </div>
    );
  }

  if (isStructuredMinutes(output)) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {output.meeting_purpose && output.meeting_purpose !== '未提及' && (
          <TintPanel tone="yellow" title="会议目的">
            <p>{output.meeting_purpose}</p>
          </TintPanel>
        )}
        <TintPanel tone="peach" title="会议摘要">
          <p>{output.summary || output.one_sentence_summary}</p>
        </TintPanel>
        <TintPanel tone="sky" title="关键决策">
          {output.decisions.length === 0 ? (
            <p className="list-empty">未提及</p>
          ) : (
            output.decisions.map((item, index) => (
              <div key={index}>
                <strong>{item.decision}</strong>
                {item.evidence && <div className="mono-line">{item.evidence}</div>}
              </div>
            ))
          )}
        </TintPanel>
        <TintPanel tone="mint" title="待办事项">
          {output.action_items.length === 0 ? (
            <p className="list-empty">未提及</p>
          ) : (
            output.action_items.map((item, index) => (
              <div key={index}>
                <strong>{item.task}</strong>
                <div className="mono-line">
                  {[item.owner, item.deadline, item.priority, item.status].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))
          )}
        </TintPanel>
      </div>
    );
  }

  return (
    <TintPanel tone="peach" title="输出内容">
      <p>已生成输出</p>
    </TintPanel>
  );
}
