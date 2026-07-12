import { History, Loader2, Plus } from 'lucide-react';
import { Button } from '../freejoy';
import { SectionCard } from '../components/SectionCard';
import { StatTile } from '../components/StatTile';
import { skillName } from '../lib/office';
import type { OfficeFeedbackRecord } from '../types';

function priorityRank(priority: string): { cls: string; label: string } {
  if (priority === 'high') return { cls: 'p0', label: 'P0' };
  if (priority === 'medium') return { cls: 'p1', label: 'P1' };
  return { cls: 'p2', label: 'P2' };
}

export function FeedbackIterationView({
  feedback,
  loading,
  onOpenOutputs,
}: {
  feedback: OfficeFeedbackRecord[];
  loading: boolean;
  onOpenOutputs: () => void;
}) {
  const scored = feedback.map((item) => (item.accuracy_score + item.copyability_score + item.completeness_score) / 3);
  const average = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
  const processed = feedback.filter((item) => item.feedback_summary).length;
  const processedPct = feedback.length ? Math.round((processed / feedback.length) * 100) : 0;
  const lowScore = feedback.filter((item, index) => scored[index] < 3.5 || item.needs_heavy_edit);

  // Aggregate problem categories into a frequency + representative-priority list.
  const issueMap = new Map<string, { count: number; priority: string }>();
  for (const item of feedback) {
    const priority = item.feedback_summary?.priority || 'low';
    for (const category of item.feedback_summary?.problem_categories || []) {
      const existing = issueMap.get(category);
      issueMap.set(category, {
        count: (existing?.count || 0) + 1,
        priority: existing?.priority === 'high' ? 'high' : priority,
      });
    }
  }
  const issues = Array.from(issueMap.entries())
    .map(([label, meta]) => ({ label, ...meta }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const maxCount = issues.reduce((max, issue) => Math.max(max, issue.count), 1);

  if (loading) {
    return (
      <SectionCard>
        <div className="loading-row">
          <Loader2 className="spin" size={18} />
          正在读取反馈
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <div className="hero-dark">
        <div className="hero-dark-copy">
          <span className="hero-pill mono">Feedback Loop</span>
          <h2>把用户评分，变成下一版可执行的改进项。</h2>
          <div className="hero-actions">
            <Button variant="ghost" iconLeft={<History size={16} />} onClick={onOpenOutputs}>
              查看输出记录
            </Button>
          </div>
        </div>
        <div className="hero-stat">
          <span className="eyebrow">本月反馈</span>
          <strong>{feedback.length}</strong>
          <div className="hero-stat-badges">
            <span className="hero-pill">已处理 {processedPct}%</span>
          </div>
        </div>
      </div>

      <div className="overview-grid">
        <StatTile value={average ? average.toFixed(1) : '—'} label="平均评分" />
        <StatTile value={`${processedPct}%`} label="反馈已处理" />
        <StatTile value={issues.length} label="高频问题" />
        <StatTile value={lowScore.length} label="低分输出" delta={lowScore.length ? '待复盘' : '良好'} deltaTone={lowScore.length ? 'danger' : 'success'} />
      </div>

      <div className="feedback-columns">
        <SectionCard title="最近问题" caption="按出现次数聚合，优先安排迭代">
          {issues.length === 0 ? (
            <div className="empty-state">
              <h3>暂无高频问题</h3>
              <p>先在输出记录中提交一次评价。</p>
            </div>
          ) : (
            <div className="issue-list">
              {issues.map((issue) => {
                const rank = priorityRank(issue.priority);
                return (
                  <div className={`issue-row ${rank.cls}`} key={issue.label}>
                    <div className="issue-row-top">
                      <span className={`priority-badge ${rank.cls}`}>{rank.label}</span>
                      <strong>{issue.label}</strong>
                      <span className="issue-count">{issue.count} 次</span>
                    </div>
                    <div className="issue-bar">
                      <span style={{ width: `${(issue.count / maxCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="低分输出" caption="查看具体反馈并创建迭代项">
          {lowScore.length === 0 ? (
            <div className="empty-state">
              <h3>暂无低分输出</h3>
              <p>保存并反馈办公输出后会自动归档。</p>
            </div>
          ) : (
            <div className="lowscore-list">
              {lowScore.slice(0, 6).map((item) => {
                const avg = (item.accuracy_score + item.copyability_score + item.completeness_score) / 3;
                return (
                  <div className="lowscore-card" key={item.id}>
                    <div className="lowscore-top">
                      <span className="score-flag">{avg.toFixed(1)} 分</span>
                      <strong>{item.output_title || skillName(item.skill_id || 'weekly_report')}</strong>
                      <time>{new Date(item.updated_at).toLocaleDateString()}</time>
                    </div>
                    <p>{item.feedback_summary?.feedback_summary || item.suggestion || item.missing_info || '用户提交了评分反馈。'}</p>
                    <div className="button-row">
                      <Button variant="secondary" size="sm" iconLeft={<Plus size={14} />} onClick={onOpenOutputs}>
                        创建迭代
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
