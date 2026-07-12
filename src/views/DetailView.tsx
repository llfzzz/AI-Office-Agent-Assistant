import { ChevronLeft, Library, Loader2, Send } from 'lucide-react';
import { Badge, Button } from '../freejoy';
import { SectionCard } from '../components/SectionCard';
import type { MeetingRecord } from '../types';

const SUGGESTED = ['还有哪些风险？', '给我一份执行清单'];

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
      <SectionCard title="未选择会议">
        <div className="empty-state">
          <h3>还没有选择会议</h3>
          <p>先从会议记忆中挑选一场会议，再进入追问。</p>
        </div>
        <Button variant="secondary" onClick={onOpenLibrary} iconLeft={<Library size={16} />} style={{ justifySelf: 'center' }}>
          打开会议记忆
        </Button>
      </SectionCard>
    );
  }

  const minutes = meeting.analysis.structured_minutes;
  const latestQa = meeting.qa_history[meeting.qa_history.length - 1] || null;

  return (
    <>
      <div className="detail-head-row">
        <Badge tone="accent">{minutes.meeting_type || meeting.meeting_type}</Badge>
        <h2>{meeting.title}</h2>
        <span className="spacer" />
        <Button variant="secondary" size="sm" iconLeft={<ChevronLeft size={15} />} onClick={onOpenLibrary}>
          返回会议记忆
        </Button>
      </div>

      <div className="detail-columns">
        <SectionCard title="会议详情" caption={`${meeting.date} · ${meeting.participants || '未提及参会人'}`}>
          <div className="tint-panel" style={{ background: 'var(--joy-50)' }}>
            <div className="tint-panel-head" style={{ color: 'var(--joy-700)' }}>
              <span className="tint-panel-title">摘要</span>
            </div>
            <div className="tint-panel-body">
              <strong>{minutes.one_sentence_summary}</strong>
              <p>{minutes.summary}</p>
            </div>
          </div>

          <div className="detail-section">
            <h4>关键决策</h4>
            {minutes.decisions.length === 0 ? (
              <p className="list-empty">未提及</p>
            ) : (
              <div className="decision-list">
                {minutes.decisions.map((item, index) => (
                  <div className="decision-row" key={index}>
                    <span className="decision-num">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      {item.decision}
                      {item.evidence && <span>{item.evidence}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="detail-section">
            <h4>待办事项</h4>
            {minutes.action_items.length === 0 ? (
              <p className="list-empty">未提及</p>
            ) : (
              <div className="todo-list">
                {minutes.action_items.map((item, index) => (
                  <div className="todo-row" key={index}>
                    <span className="tone-dot mint" />
                    <span className="todo-text">{item.task}</span>
                    {item.owner && <span className="assignee-pill">{item.owner}</span>}
                    {item.deadline && <span className="todo-date">{item.deadline}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="detail-section">
            <h4>长期记忆</h4>
            {minutes.long_term_memory.length === 0 ? (
              <p className="list-empty">未提及</p>
            ) : (
              <div className="chip-row">
                {minutes.long_term_memory.map((item, index) => (
                  <span className="chip" key={index}>
                    {item.category ? `${item.category} · ` : ''}
                    {item.memory}
                  </span>
                ))}
              </div>
            )}
          </div>

          <details className="raw-transcript">
            <summary>
              <span>原始转写稿</span>
              <span className="mono-line">{meeting.raw_transcript.trim().length} 字 · 展开</span>
            </summary>
            <pre>{meeting.raw_transcript || '（无原始文本）'}</pre>
          </details>
        </SectionCard>

        <SectionCard title="向这场会议追问" caption="答案仅基于当前会议和关联资料">
          <div className="qa-thread">
            {meeting.qa_history.length === 0 ? (
              <div className="qa-bubble ai">
                <span className="qa-meta">AI 助手</span>
                提出问题后，我会结合这场会议的决策、待办与记忆来回答。
              </div>
            ) : (
              meeting.qa_history.map((entry) => (
                <div key={entry.id} style={{ display: 'grid', gap: 8 }}>
                  <div className="qa-bubble user">{entry.question}</div>
                  <div className="qa-bubble ai">
                    <span className="qa-meta">
                      AI 助手 · {entry.source === 'default-api' ? 'API' : '体验'}
                    </span>
                    {entry.answer}
                    {(entry.evidence || entry.confidence) && (
                      <span className="qa-cite">
                        {entry.evidence ? `${entry.evidence}` : '基于当前会议'}
                        {entry.confidence ? ` · 置信度 ${entry.confidence}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="suggest-chips">
            {SUGGESTED.map((item) => (
              <button type="button" className="chip" key={item} onClick={() => onQuestion(item)}>
                {item}
              </button>
            ))}
          </div>

          <div className="ask-box">
            <textarea
              className="fj-textarea"
              rows={3}
              value={question}
              onChange={(event) => onQuestion(event.target.value)}
              placeholder="输入问题…"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface-soft)',
                fontSize: '13px',
                lineHeight: 1.6,
                color: 'var(--text)',
                resize: 'vertical',
              }}
            />
            <div className="ask-box-foot">
              <span className="mono-line">会议内检索</span>
              <Button
                onClick={onAsk}
                disabled={isAsking || !question.trim()}
                iconLeft={isAsking ? <Loader2 className="spin" size={15} /> : <Send size={15} />}
              >
                发送
              </Button>
            </div>
          </div>

          <div className="note-panel mint">
            <strong>引用范围</strong>
            <span>
              当前会议 · {minutes.decisions.length} 项决策 · {minutes.action_items.length} 项待办
              {latestQa ? ` · 最近一次 ${latestQa.source === 'default-api' ? 'API' : '体验'} 来源` : ''}
            </span>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
