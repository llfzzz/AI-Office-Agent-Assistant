import { useState } from 'react';
import { Copy, Loader2, Save } from 'lucide-react';
import { Badge, Button } from '../freejoy';
import { SectionCard } from './SectionCard';
import { OfficeOutputPreview } from './OfficeOutputPreview';
import { isPrdOutput, isWeeklyOutput } from '../lib/office';
import type { OfficeRunResult } from '../types';

function copyText(result: OfficeRunResult) {
  const output = result.skill_output;
  if (isWeeklyOutput(output)) return output.copy_ready_report;
  if (isPrdOutput(output)) return output.prd_draft;
  return '';
}

export function OfficeResultPanel({
  result,
  emptyTitle,
  isSaving,
  onSave,
}: {
  result: OfficeRunResult | null;
  emptyTitle: string;
  isSaving: boolean;
  onSave: () => void;
}) {
  const [copied, setCopied] = useState(false);

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
  const quality = result.quality_check;
  const score = quality.copy_ready_score || 0;
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
      caption="可复制、保存并进入反馈迭代"
      actions={<Badge tone={configured ? 'success' : 'sun'}>{configured ? 'API 生成' : '体验生成'}</Badge>}
    >
      <div className="chip-row">
        <Badge tone="bloom">
          Plan · {plan.selected_skill === 'weekly_report' ? '周报' : plan.selected_skill === 'prd_review' ? 'PRD' : '纪要'}{' '}
          {typeof plan.confidence === 'string' ? plan.confidence : ''}
        </Badge>
        {result.provider && <span className="chip">{result.provider.model}</span>}
        {ragCount > 0 && <Badge tone="success">RAG · {ragCount} 段</Badge>}
      </div>

      <OfficeOutputPreview output={result.skill_output} skillId={plan.selected_skill} />

      <div className="quality-card">
        <div className="quality-card-head">
          <strong>质量检查与风险</strong>
          <span className="quality-score">{score}/100</span>
        </div>
        <div className="quality-bar">
          <span style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
        </div>
        <p>
          {quality.has_hallucination ? '存在需复核的疑点' : '无幻觉'}
          {quality.missing_key_points.length > 0 ? ` · ${quality.missing_key_points.length} 项信息待补充` : ''}
        </p>
      </div>

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
    </SectionCard>
  );
}
