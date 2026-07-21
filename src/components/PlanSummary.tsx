import { Badge } from '../freejoy';
import { planMissingInfo, planRisks, planSteps, skillName } from '../lib/office';
import type { AgentPlan } from '../types';

/**
 * User-facing "处理说明" — an expandable summary of the execution plan:
 * observable steps, missing information, source usage, and risks. It never
 * renders prompts or hidden reasoning; legacy v1 plans are normalized by the
 * lib/office helpers.
 */
export function PlanSummary({ plan }: { plan: AgentPlan | null | undefined }) {
  if (!plan) {
    return null;
  }

  const steps = planSteps(plan);
  const missing = planMissingInfo(plan);
  const risks = planRisks(plan);
  const sources = plan.source_inventory || [];
  const clarifications = plan.clarification_questions || [];
  const summary = plan.task_summary || plan.user_goal || '';

  return (
    <details className="plan-summary">
      <summary>
        <span className="plan-summary-title">
          处理说明 · {skillName(plan.selected_skill)}
          <Badge tone="bloom">{String(plan.confidence || 'medium')}</Badge>
        </span>
        <span className="mono-line">展开查看步骤与缺口</span>
      </summary>

      <div className="plan-summary-body">
        {summary && <p className="plan-summary-goal">{summary}</p>}

        {steps.length > 0 && (
          <div className="plan-summary-section">
            <h4>执行步骤</h4>
            <ol>
              {steps.map((step) => (
                <li key={step.step}>
                  {step.action}
                  {step.expected_result && <span className="plan-summary-note">→ {step.expected_result}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {sources.length > 0 && (
          <div className="plan-summary-section">
            <h4>信息来源</h4>
            <ul>
              {sources.map((source, index) => (
                <li key={`${source.source_id}-${index}`}>
                  {source.source_type === 'primary_input'
                    ? '主要输入'
                    : source.source_type === 'linked_meeting'
                      ? '关联会议'
                      : '资料库'}
                  {source.authority === 'supporting' && <span className="plan-summary-note">（仅作背景）</span>}
                  {source.purpose && <span className="plan-summary-note"> · {source.purpose}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {missing.length > 0 && (
          <div className="plan-summary-section">
            <h4>缺失信息</h4>
            <ul>
              {missing.map((item, index) => (
                <li key={`${item.field}-${index}`}>
                  {item.field}
                  {item.blocking && <Badge tone="warn">影响可靠性</Badge>}
                  {item.reason && <span className="plan-summary-note"> · {item.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {clarifications.length > 0 && (
          <div className="plan-summary-section">
            <h4>需要确认的问题</h4>
            <ul>
              {clarifications.map((question, index) => (
                <li key={index}>{question}</li>
              ))}
            </ul>
          </div>
        )}

        {risks.length > 0 && (
          <div className="plan-summary-section">
            <h4>风险提示</h4>
            <ul>
              {risks.map((risk, index) => (
                <li key={`${risk.risk}-${index}`}>
                  {risk.risk}
                  {risk.mitigation && <span className="plan-summary-note"> · {risk.mitigation}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
