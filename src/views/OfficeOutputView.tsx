import { useState } from 'react';
import { Copy, Download, Loader2, Send } from 'lucide-react';
import { Badge, Button, Spinner, Switch, Textarea } from '../freejoy';
import { OfficeOutputPreview } from '../components/OfficeOutputPreview';
import { SectionCard } from '../components/SectionCard';
import { ScorePicker } from '../ui';
import { downloadMarkdown } from '../lib/format';
import { isPrdOutput, isWeeklyOutput, skillName } from '../lib/office';
import type { OfficeFeedbackInput, OfficeOutputRecord } from '../types';

function outputCopyText(output: OfficeOutputRecord) {
  const body = output.output;
  if (isWeeklyOutput(body)) return body.copy_ready_report;
  if (isPrdOutput(body)) return body.prd_draft;
  return output.title;
}

export function OfficeOutputView({
  outputs,
  selectedOutput,
  loading,
  feedbackForm,
  isSubmittingFeedback,
  onSelectOutput,
  onFeedbackForm,
  onSubmitFeedback,
}: {
  outputs: OfficeOutputRecord[];
  selectedOutput: OfficeOutputRecord | null;
  loading: boolean;
  feedbackForm: OfficeFeedbackInput;
  isSubmittingFeedback: boolean;
  onSelectOutput: (id: string) => void;
  onFeedbackForm: (form: OfficeFeedbackInput) => void;
  onSubmitFeedback: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'weekly_report' | 'prd_review'>('all');
  const [copied, setCopied] = useState(false);

  const filtered = outputs.filter((output) => filter === 'all' || output.skill_id === filter);

  async function copyOutput() {
    if (!selectedOutput) return;
    try {
      await navigator.clipboard.writeText(outputCopyText(selectedOutput));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="outputs-columns">
      <SectionCard title="输出记录" caption="跨 Skill 查看、复制和评价">
        <div className="chip-row">
          {(
            [
              ['all', '全部'],
              ['weekly_report', '周报'],
              ['prd_review', 'PRD'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'chip active' : 'chip'}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-row">
            <Spinner size={18} label="正在读取输出记录" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>还没有输出</h3>
            <p>在周报生成或需求评审保存结果后会出现在这里。</p>
          </div>
        ) : (
          <div className="output-list">
            {filtered.map((output) => (
              <button
                type="button"
                key={output.id}
                className={selectedOutput?.id === output.id ? 'output-row active' : 'output-row'}
                onClick={() => onSelectOutput(output.id)}
              >
                <div className="output-row-top">
                  <Badge tone={output.skill_id === 'weekly_report' ? 'sun' : output.skill_id === 'prd_review' ? 'bloom' : 'accent'}>
                    {skillName(output.skill_id)}
                  </Badge>
                </div>
                <strong>{output.title}</strong>
                <time>{new Date(output.updated_at).toLocaleString()}</time>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {selectedOutput ? (
        <SectionCard
          title={selectedOutput.title}
          caption={new Date(selectedOutput.updated_at).toLocaleString()}
          actions={
            <>
              <Badge tone={selectedOutput.skill_id === 'weekly_report' ? 'sun' : 'bloom'}>
                {skillName(selectedOutput.skill_id)}
              </Badge>
              <Badge tone="success">已保存</Badge>
            </>
          }
        >
          <OfficeOutputPreview output={selectedOutput.output} skillId={selectedOutput.skill_id} />

          <div className="quality-card">
            <div className="quality-card-head">
              <strong>质量检查与风险</strong>
              <span className="quality-score">{selectedOutput.quality_check.copy_ready_score || 0}/100</span>
            </div>
            <div className="quality-bar">
              <span style={{ width: `${Math.min(100, selectedOutput.quality_check.copy_ready_score || 0)}%` }} />
            </div>
            <p>
              {selectedOutput.quality_check.has_hallucination ? '存在需复核的疑点' : '无幻觉'}
              {selectedOutput.quality_check.missing_key_points.length > 0
                ? ` · ${selectedOutput.quality_check.missing_key_points.length} 项信息待补充`
                : ''}
            </p>
          </div>

          <div className="agent-plan-row">
            <span className="eyebrow">Agent Plan 与来源</span>
            <div className="chip-row">
              <Badge tone="bloom">
                Plan · {skillName(selectedOutput.agent_plan.selected_skill)} {String(selectedOutput.agent_plan.confidence)}
              </Badge>
              {selectedOutput.rag?.enabled && <Badge tone="success">RAG · {selectedOutput.rag.sources.length} 段</Badge>}
            </div>
          </div>

          <div className="page-card-foot">
            <Button variant="secondary" size="sm" iconLeft={<Copy size={15} />} onClick={copyOutput}>
              {copied ? '已复制' : '复制'}
            </Button>
            <Button
              size="sm"
              iconLeft={<Download size={15} />}
              onClick={() => downloadMarkdown(outputCopyText(selectedOutput), selectedOutput.title || 'office-output')}
            >
              下载 Markdown
            </Button>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="输出预览">
          <div className="empty-state">
            <h3>选择一条输出</h3>
            <p>查看结构化结果并提交评价。</p>
          </div>
        </SectionCard>
      )}

      <SectionCard title="评价输出" caption="帮助下一次生成更准确">
        {selectedOutput ? (
          <div className="score-panel">
            <ScorePicker
              label="准确性"
              value={feedbackForm.accuracy_score}
              onChange={(value) => onFeedbackForm({ ...feedbackForm, accuracy_score: value })}
            />
            <ScorePicker
              label="完整性"
              value={feedbackForm.completeness_score}
              onChange={(value) => onFeedbackForm({ ...feedbackForm, completeness_score: value })}
            />
            <ScorePicker
              label="可用性"
              value={feedbackForm.copyability_score}
              onChange={(value) => onFeedbackForm({ ...feedbackForm, copyability_score: value })}
            />
            <Switch
              checked={feedbackForm.needs_heavy_edit}
              onChange={(checked) => onFeedbackForm({ ...feedbackForm, needs_heavy_edit: checked })}
              label="需要大量人工修改"
            />
            <Textarea
              label="具体反馈"
              rows={4}
              value={feedbackForm.suggestion}
              onChange={(event) => onFeedbackForm({ ...feedbackForm, suggestion: event.target.value })}
              placeholder="例如：整体清晰，但希望待办自动补充责任人和期限。"
            />
            <Textarea
              label="遗漏 / 幻觉（可选）"
              rows={2}
              value={feedbackForm.missing_info}
              onChange={(event) => onFeedbackForm({ ...feedbackForm, missing_info: event.target.value })}
              placeholder="遗漏了什么，或哪里出现了不存在的信息。"
            />
            <div className="note-panel lavender">
              <strong>将进入反馈迭代</strong>
              <span>低分与问题聚合为可追踪的改进项。</span>
            </div>
            <Button
              full
              onClick={onSubmitFeedback}
              disabled={isSubmittingFeedback}
              iconLeft={isSubmittingFeedback ? <Loader2 className="spin" size={15} /> : <Send size={15} />}
            >
              提交评价
            </Button>
            <span className="chip submit-state">尚未提交</span>
          </div>
        ) : (
          <div className="empty-state">
            <p>选择左侧输出后可提交评价。</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
