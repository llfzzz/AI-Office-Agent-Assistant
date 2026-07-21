import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Loader2, Save, XCircle } from 'lucide-react';
import { Badge, Button } from '../freejoy';
import { SectionCard } from './SectionCard';
import { OfficeOutputPreview } from './OfficeOutputPreview';
import { FeedbackTicketPanel } from './FeedbackTicketPanel';
import { PlanSummary } from './PlanSummary';
import { useIdentityKey } from '../hooks/useIdentityKey';
import { isPrdOutput, isStructuredMinutes, isWeeklyOutput, qualityStatus, skillName } from '../lib/office';
import type { FeedbackTicketRecord, OfficeRunResult, QualityCheck } from '../types';

function copyText(result: OfficeRunResult) {
  const output = result.skill_output;
  if (isWeeklyOutput(output)) return output.copy_ready_report;
  if (isPrdOutput(output)) return output.prd_draft;
  if (isStructuredMinutes(output)) return output.copy_ready_minutes || output.summary;
  return '';
}

/** Icon + text quality verdict (never color-only). */
export function QualityStatusCard({
  check,
  revisionApplied,
}: {
  check: QualityCheck | null | undefined;
  revisionApplied?: boolean;
}) {
  const status = qualityStatus(check, revisionApplied);
  const Icon = status.verdict === 'pass' ? CheckCircle2 : status.verdict === 'revise' ? AlertTriangle : XCircle;

  return (
    <div className={`quality-status ${status.verdict}`}>
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{status.label}</strong>
        {status.detail}
      </div>
    </div>
  );
}

export function OfficeResultPanel({
  result,
  emptyTitle,
  isSaving,
  onSave,
  onTicketSubmitted,
}: {
  result: OfficeRunResult | null;
  emptyTitle: string;
  isSaving: boolean;
  onSave: () => void;
  onTicketSubmitted?: (ticket: FeedbackTicketRecord) => void;
}) {
  const [copied, setCopied] = useState(false);
  const ticketKey = useIdentityKey(result);

  if (!result) {
    return (
      <SectionCard title="输出预览" caption="生成后在这里显示结构化结果">
        <div className="empty-state">
          <h3>{emptyTitle}</h3>
          <p>生成后的周报或评审材料会显示在这里。</p>
        </div>
      </SectionCard>
    );
  }

  const plan = result.agent_plan;
  const configured = result.source === 'default-api';
  const ragCount = result.rag?.enabled ? result.rag.sources.length : 0;

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(copyText(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <SectionCard
      title="输出预览"
      caption="可复制、保存，也可以直接反馈问题"
      actions={<Badge tone={configured ? 'success' : 'sun'}>{configured ? 'API 生成' : '体验生成'}</Badge>}
    >
      <div className="chip-row">
        {result.provider && <span className="chip">{result.provider.model}</span>}
        {ragCount > 0 && <Badge tone="success">RAG · {ragCount} 段</Badge>}
        {result.revision_applied && <Badge tone="sun">已自动修订</Badge>}
      </div>

      <PlanSummary plan={plan} />

      <OfficeOutputPreview output={result.skill_output} skillId={plan.selected_skill} />

      <QualityStatusCard check={result.quality_check} revisionApplied={result.revision_applied} />

      <div className="page-card-foot">
        <Button variant="secondary" size="sm" iconLeft={<Copy size={15} />} onClick={handleCopy}>
          {copied ? '已复制' : '复制全文'}
        </Button>
        <Button
          size="sm"
          iconLeft={isSaving ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
          onClick={onSave}
          disabled={isSaving}
        >
          保存输出
        </Button>
      </div>

      <FeedbackTicketPanel
        key={ticketKey}
        target={{
          target_type: 'generation',
          skill_id: plan.selected_skill,
          output_title: plan.user_goal || skillName(plan.selected_skill),
        }}
        onSubmitted={onTicketSubmitted}
      />
    </SectionCard>
  );
}
