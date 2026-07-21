import { Loader2, Wand2 } from 'lucide-react';
import { Badge, Button, Input, Textarea } from '../freejoy';
import { OfficeResultPanel } from '../components/OfficeResultPanel';
import { SectionCard } from '../components/SectionCard';
import type { FeedbackTicketRecord, OfficeRunResult, OfficeTaskInput } from '../types';

const REVIEW_FOCUS = ['范围', '验收', '风险', '数据闭环'];

export function PrdReviewView({
  task,
  canUseRag,
  result,
  onTicketSubmitted,
  isRunning,
  isSaving,
  onTask,
  onRun,
  onSave,
}: {
  task: OfficeTaskInput;
  canUseRag: boolean;
  result: OfficeRunResult | null;
  onTicketSubmitted: (ticket: FeedbackTicketRecord) => void;
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

  return (
    <div className="office-layout">
      <SectionCard title="需求材料" caption="把模糊想法整理为可评审的 PRD">
        <div className="form-grid two">
          <Input
            label="功能名称"
            value={metadata.feature_name || ''}
            onChange={(event) =>
              onTask({
                ...task,
                title: event.target.value || task.title,
                metadata: { ...metadata, feature_name: event.target.value },
              })
            }
            placeholder="例如：会议输出反馈迭代"
          />
          <Input
            label="目标用户"
            value={metadata.target_user || ''}
            onChange={(event) => updateMetadata('target_user', event.target.value)}
            placeholder="例如：产品实习生 / 项目负责人"
          />
        </div>

        <Textarea
          label="功能想法"
          rows={4}
          value={task.content}
          onChange={(event) => onTask({ ...task, content: event.target.value })}
          placeholder="描述功能想解决的问题、核心流程、预期输出。"
        />

        <Textarea
          label="用户反馈"
          rows={3}
          value={metadata.feedback || ''}
          onChange={(event) => updateMetadata('feedback', event.target.value)}
          placeholder="粘贴用户反馈、访谈片段或痛点描述。"
        />

        <div className="form-grid two">
          <Textarea
            label="业务背景"
            rows={3}
            value={metadata.business_context || ''}
            onChange={(event) => updateMetadata('business_context', event.target.value)}
            placeholder="补充业务目标、现有流程。"
          />
          <Textarea
            label="约束条件"
            rows={3}
            value={metadata.constraints || ''}
            onChange={(event) => updateMetadata('constraints', event.target.value)}
            placeholder="例如：不改变现有技能流程。"
          />
        </div>

        <div className="review-focus">
          <strong>评审重点</strong>
          <div className="chip-row">
            {REVIEW_FOCUS.map((item) => (
              <span className="chip" key={item}>
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="page-card-foot">
          <Badge tone={canUseRag ? 'success' : 'neutral'}>{canUseRag ? 'RAG 已启用' : 'RAG 未启用'}</Badge>
          <Button
            onClick={onRun}
            disabled={isRunning}
            iconLeft={isRunning ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}
            style={{ marginLeft: 'auto' }}
          >
            生成评审稿
          </Button>
        </div>
      </SectionCard>

      <OfficeResultPanel result={result} emptyTitle="等待生成需求评审材料" isSaving={isSaving} onSave={onSave} onTicketSubmitted={onTicketSubmitted} />
    </div>
  );
}
