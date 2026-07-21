import { History, Loader2 } from 'lucide-react';
import { Badge, Button } from '../freejoy';
import { SectionCard } from '../components/SectionCard';
import { skillName } from '../lib/office';
import type { FeedbackTicketRecord } from '../types';

/** Feedback ticket history — user-facing list of submitted problem reports. */
export function FeedbackIterationView({
  feedback,
  loading,
  onOpenOutputs,
}: {
  feedback: FeedbackTicketRecord[];
  loading: boolean;
  onOpenOutputs: () => void;
}) {
  if (loading) {
    return (
      <SectionCard>
        <div className="loading-row">
          <Loader2 className="spin" size={18} />
          正在读取反馈工单
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="我的反馈工单"
      caption="遇到内容不准确、信息遗漏、格式不合适或操作问题？提交一张反馈工单，系统会记录这次问题。"
      actions={
        <Button variant="ghost" size="sm" iconLeft={<History size={15} />} onClick={onOpenOutputs}>
          查看输出记录
        </Button>
      }
    >
      {feedback.length === 0 ? (
        <div className="empty-state">
          <h3>暂时没有反馈工单</h3>
          <p>使用任一技能后，都可以在结果下方提交问题。</p>
        </div>
      ) : (
        <div className="ticket-list">
          {feedback.map((ticket) => (
            <article className="ticket-row" key={ticket.id}>
              <div className="ticket-row-top">
                <span className="ticket-no">{ticket.ticket_no}</span>
                <strong>{ticket.subject}</strong>
                <Badge tone="neutral">{ticket.issue_type}</Badge>
                <Badge tone="success">{ticket.status}</Badge>
              </div>
              <div className="ticket-row-meta">
                {ticket.skill_id && <span>{skillName(ticket.skill_id)}</span>}
                {ticket.output_title && <span>{ticket.output_title}</span>}
                {ticket.impact && <span>影响程度：{ticket.impact}</span>}
                <time>{new Date(ticket.created_at).toLocaleString()}</time>
              </div>
              {ticket.details && <p className="ticket-row-details">{ticket.details}</p>}
              {ticket.expected_result && (
                <p className="ticket-row-details">期望结果：{ticket.expected_result}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
