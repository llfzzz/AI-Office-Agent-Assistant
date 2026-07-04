import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  History,
  Library,
  Loader2,
  Send,
  UserRound,
} from 'lucide-react';
import { Badge, Button, Textarea } from '../freejoy';
import { EmptyState } from '../components/primitives';
import { ListBlock } from '../components/ListBlock';
import type { ActionItem, Decision, LongTermMemory, MeetingRecord } from '../types';

export function DetailView({
  meeting,
  question,
  isAsking,
  onQuestion,
  onAsk,
  onOpenLibrary,
}: {
  meeting: MeetingRecord | null;
  question: string;
  isAsking: boolean;
  onQuestion: (value: string) => void;
  onAsk: () => void;
  onOpenLibrary: () => void;
}) {
  if (!meeting) {
    return (
      <section className="panel detail-panel">
        <EmptyState />
        <Button variant="secondary" onClick={onOpenLibrary} iconLeft={<Library size={17} />}>
          打开记忆库
        </Button>
      </section>
    );
  }

  const minutes = meeting.analysis.structured_minutes;

  return (
    <section className="detail-layout">
      <div className="panel detail-main">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">会议详情</span>
            <h2>{meeting.title}</h2>
          </div>
          <Badge tone="success">{minutes.meeting_type}</Badge>
        </div>

        <div className="detail-meta">
          <span>
            <CalendarDays size={16} />
            {meeting.date}
          </span>
          <span>
            <UserRound size={16} />
            {meeting.participants || '未提及'}
          </span>
          <span>
            <History size={16} />
            {new Date(meeting.updated_at).toLocaleString()}
          </span>
        </div>

        <div className="summary-block elevated">
          <strong>{minutes.one_sentence_summary}</strong>
          <p>{minutes.summary}</p>
        </div>

        <div className="detail-sections">
          <ListBlock
            title="关键决策"
            icon={<CheckCircle2 size={18} />}
            tone="mint"
            items={minutes.decisions}
            render={(item: Decision) => (
              <>
                <strong>{item.decision}</strong>
                <span>{item.evidence}</span>
              </>
            )}
          />
          <ListBlock
            title="待办事项"
            icon={<ClipboardList size={18} />}
            tone="sky"
            items={minutes.action_items}
            render={(item: ActionItem) => (
              <>
                <strong>{item.task}</strong>
                <span>
                  {item.owner} / {item.deadline} / {item.priority}
                </span>
              </>
            )}
          />
          <ListBlock
            title="长期记忆"
            icon={<Database size={18} />}
            tone="lavender"
            items={minutes.long_term_memory}
            render={(item: LongTermMemory) => (
              <>
                <strong>{item.memory}</strong>
                <span>{item.category}</span>
              </>
            )}
          />
        </div>

        <details className="raw-transcript">
          <summary>原始会议文本</summary>
          <p>{meeting.raw_transcript}</p>
        </details>
      </div>

      <aside className="panel ask-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">追问</span>
            <h2>单条会议问答</h2>
          </div>
        </div>

        <div className="question-box">
          <Textarea
            rows={3}
            value={question}
            onChange={(event) => onQuestion(event.target.value)}
            placeholder="例如：这次会议谁负责后续跟进？"
          />
          <Button
            onClick={onAsk}
            disabled={isAsking || !question.trim()}
            iconLeft={isAsking ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
          >
            发送
          </Button>
        </div>

        <div className="qa-list">
          {meeting.qa_history.length === 0 ? (
            <div className="qa-empty">暂无追问记录</div>
          ) : (
            meeting.qa_history.map((entry) => (
              <article className="qa-item" key={entry.id}>
                <strong>{entry.question}</strong>
                <p>{entry.answer}</p>
                {entry.evidence && <span>{entry.evidence}</span>}
              </article>
            ))
          )}
        </div>
      </aside>
    </section>
  );
}
