import { History, Loader2 } from 'lucide-react';
import { skillName } from '../lib/office';
import type { OfficeFeedbackRecord, OfficeOutputRecord } from '../types';

export function FeedbackIterationView({
  feedback,
  outputs,
  loading,
  onOpenOutputs,
}: {
  feedback: OfficeFeedbackRecord[];
  outputs: OfficeOutputRecord[];
  loading: boolean;
  onOpenOutputs: () => void;
}) {
  const lowScoreFeedback = feedback.filter((item) => {
    const average = (item.accuracy_score + item.copyability_score + item.completeness_score) / 3;
    return average < 3.5 || item.needs_heavy_edit;
  });

  return (
    <section className="office-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">反馈迭代</span>
          <h1>下一版优化清单</h1>
          <p>汇总低分输出、遗漏信息、幻觉反馈和用户建议，用于下一轮 Prompt 与产品交互优化。</p>
        </div>
        <button type="button" className="button secondary" onClick={onOpenOutputs}>
          <History size={17} />
          查看输出记录
        </button>
      </div>

      {loading ? (
        <div className="panel loading-row">
          <Loader2 className="spin" size={18} />
          正在读取反馈
        </div>
      ) : (
        <div className="iteration-grid">
          <section className="panel iteration-panel">
            <span className="eyebrow">高频问题</span>
            <h2>待关注反馈</h2>
            {feedback.length === 0 ? (
              <p className="muted-copy">暂无反馈。先在输出记录中提交一次评价。</p>
            ) : (
              <div className="iteration-list">
                {feedback.slice(0, 6).map((item) => (
                  <article key={item.id}>
                    <span className="status fallback">{skillName(item.skill_id || 'weekly_report')}</span>
                    <strong>{item.output_title || '未命名输出'}</strong>
                    <p>{item.feedback_summary?.feedback_summary || item.suggestion || item.missing_info || '用户提交了评分反馈。'}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel iteration-panel">
            <span className="eyebrow">低分输出</span>
            <h2>{lowScoreFeedback.length} 条需要复盘</h2>
            <div className="iteration-list">
              {(lowScoreFeedback.length ? lowScoreFeedback : feedback.slice(0, 3)).map((item) => (
                <article key={item.id}>
                  <strong>{item.output_title || '未命名输出'}</strong>
                  <p>
                    准确性 {item.accuracy_score} / 可复制性 {item.copyability_score} / 完整性 {item.completeness_score}
                  </p>
                </article>
              ))}
              {feedback.length === 0 && <p className="muted-copy">保存并反馈办公输出后会自动归档。</p>}
            </div>
          </section>

          <section className="panel iteration-panel wide">
            <span className="eyebrow">下一版建议</span>
            <h2>Prompt 与页面交互</h2>
            <div className="suggestion-grid">
              <div>
                <strong>Prompt 调整</strong>
                <p>强化“不编造、信息不足明确标记、计划不得写成完成”的质量约束。</p>
              </div>
              <div>
                <strong>产品调整</strong>
                <p>在周报和需求评审表单中继续增加缺口提示，并把 RAG、引用会议和反馈记录串联到输出详情。</p>
              </div>
              <div>
                <strong>当前数据</strong>
                <p>{outputs.length} 条办公输出，{feedback.length} 条反馈记录。</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
