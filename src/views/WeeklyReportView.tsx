import { Loader2, Save, Wand2 } from 'lucide-react';
import { Badge, Button, Input, Textarea } from '../freejoy';
import { OfficeResultPanel } from '../components/OfficeResultPanel';
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
    <section className="office-skill-layout">
      <div className="panel office-form-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">周报生成 Skill</span>
            <h2>把工作记录整理成可复制周报</h2>
          </div>
          <Badge tone={canUseRag ? 'success' : 'neutral'}>{canUseRag ? 'RAG 可用' : 'RAG 关闭'}</Badge>
        </div>

        <div className="form-grid">
          <Input
            label="周报标题"
            value={task.title}
            onChange={(event) => onTask({ ...task, title: event.target.value })}
          />
          <Input
            label="周期"
            value={metadata.period || ''}
            onChange={(event) => updateMetadata('period', event.target.value)}
            placeholder="例如：2026.05.04 - 2026.05.10"
          />
        </div>

        <Textarea
          label="工作记录"
          rows={6}
          value={task.content}
          onChange={(event) => onTask({ ...task, content: event.target.value })}
          placeholder="粘贴本周完成事项、推进进展、阻塞风险、协作信息。"
        />

        <Textarea
          label="下周计划草稿"
          rows={3}
          value={metadata.next_plan || ''}
          onChange={(event) => updateMetadata('next_plan', event.target.value)}
          placeholder="可选。没有明确计划时，系统会基于未完成事项给出建议并标记依据。"
        />

        <div className="meeting-reference-box">
          <div className="workbench-heading">
            <div>
              <span className="eyebrow">引用会议记录</span>
              <h3>用于补充本周结论和待办状态</h3>
            </div>
            <span>{task.linked_meeting_ids?.length || 0} 已选</span>
          </div>
          {meetings.length === 0 ? (
            <p className="muted-copy">暂无会议记忆，可先使用会议纪要 Skill 保存会议。</p>
          ) : (
            <div className="linked-meeting-list">
              {meetings.slice(0, 4).map((meeting) => (
                <label className="check-row" key={meeting.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(task.linked_meeting_ids?.includes(meeting.id))}
                    onChange={() => toggleMeeting(meeting.id)}
                  />
                  <span>{meeting.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="button-row">
          <Button
            onClick={onRun}
            disabled={isRunning}
            iconLeft={isRunning ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
          >
            生成周报
          </Button>
          <Button
            variant="secondary"
            onClick={onSave}
            disabled={!result || isSaving}
            iconLeft={isSaving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
          >
            保存输出
          </Button>
        </div>
      </div>

      <OfficeResultPanel result={result} emptyTitle="等待生成周报" />
    </section>
  );
}
