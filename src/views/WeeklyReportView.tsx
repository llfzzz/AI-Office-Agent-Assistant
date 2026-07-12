import { Check, Loader2, Wand2 } from 'lucide-react';
import { Badge, Button, Input, Textarea } from '../freejoy';
import { OfficeResultPanel } from '../components/OfficeResultPanel';
import { SectionCard } from '../components/SectionCard';
import { skillName } from '../lib/office';
import type { MeetingRecord, OfficeRunResult, OfficeTaskInput } from '../types';

export function WeeklyReportView({
  task,
  meetings,
  canUseRag,
  result,
  isRunning,
  isSaving,
  onTask,
  onRun,
  onSave,
}: {
  task: OfficeTaskInput;
  meetings: MeetingRecord[];
  canUseRag: boolean;
  result: OfficeRunResult | null;
  isRunning: boolean;
  isSaving: boolean;
  onTask: (task: OfficeTaskInput) => void;
  onRun: () => void;
  onSave: () => void;
}) {
  const metadata = task.metadata || {};
  const linkedCount = task.linked_meeting_ids?.length || 0;

  function updateMetadata(key: string, value: string) {
    onTask({ ...task, metadata: { ...metadata, [key]: value } });
  }

  function toggleMeeting(id: string) {
    const selected = new Set(task.linked_meeting_ids || []);
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    onTask({ ...task, linked_meeting_ids: [...selected] });
  }

  return (
    <div className="office-layout">
      <SectionCard title="周报材料" caption="引用会议记忆，减少重复整理">
        <div className="form-grid">
          <Input
            label="周报标题"
            value={task.title}
            onChange={(event) => onTask({ ...task, title: event.target.value })}
          />
          <Input
            label="统计周期"
            value={metadata.period || ''}
            onChange={(event) => updateMetadata('period', event.target.value)}
            placeholder="例如：2026.05.04 - 2026.05.10"
          />
        </div>

        <Textarea
          label="本周工作记录"
          rows={6}
          value={task.content}
          onChange={(event) => onTask({ ...task, content: event.target.value })}
          placeholder="粘贴本周完成事项、推进进展、阻塞风险、协作信息。"
        />

        <Textarea
          label="下周计划"
          rows={3}
          value={metadata.next_plan || ''}
          onChange={(event) => updateMetadata('next_plan', event.target.value)}
          placeholder="可选。没有明确计划时，系统会基于未完成事项给出建议并标记依据。"
        />

        <div>
          <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
            引用会议（{linkedCount}/{meetings.length}）
          </span>
          {meetings.length === 0 ? (
            <p className="form-note">暂无会议记忆，可先使用会议纪要 Skill 保存会议。</p>
          ) : (
            <div className="linked-list">
              {meetings.slice(0, 6).map((meeting) => {
                const checked = Boolean(task.linked_meeting_ids?.includes(meeting.id));
                return (
                  <button
                    type="button"
                    key={meeting.id}
                    className={checked ? 'linked-row checked' : 'linked-row'}
                    onClick={() => toggleMeeting(meeting.id)}
                    aria-pressed={checked}
                  >
                    <span className={checked ? 'tone-dot mint' : 'tone-dot neutral'} />
                    <div className="linked-copy">
                      <strong>{meeting.title}</strong>
                      <span>{meeting.meeting_type}</span>
                    </div>
                    {checked && (
                      <span className="linked-check">
                        <Check size={16} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="page-card-foot">
          <Badge tone={canUseRag ? 'success' : 'neutral'}>{canUseRag ? 'RAG 已启用' : 'RAG 未启用'}</Badge>
          <span className="form-note">已选 {linkedCount}/{meetings.length} · 注入摘要/决策/待办</span>
          <Button
            onClick={onRun}
            disabled={isRunning}
            iconLeft={isRunning ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}
            style={{ marginLeft: 'auto' }}
          >
            生成本周周报
          </Button>
        </div>
      </SectionCard>

      <OfficeResultPanel result={result} emptyTitle={`等待生成${skillName('weekly_report')}`} isSaving={isSaving} onSave={onSave} />
    </div>
  );
}
