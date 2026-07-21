import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { Badge, Button, Spinner } from '../freejoy';
import { OfficeOutputPreview } from '../components/OfficeOutputPreview';
import { QualityStatusCard } from '../components/OfficeResultPanel';
import { FeedbackTicketPanel } from '../components/FeedbackTicketPanel';
import { PlanSummary } from '../components/PlanSummary';
import { SectionCard } from '../components/SectionCard';
import { downloadMarkdown } from '../lib/format';
import { isPrdOutput, isStructuredMinutes, isWeeklyOutput, skillName } from '../lib/office';
import type { FeedbackTicketRecord, OfficeOutputRecord } from '../types';

function outputCopyText(output: OfficeOutputRecord) {
  const body = output.output;
  if (isWeeklyOutput(body)) return body.copy_ready_report;
  if (isPrdOutput(body)) return body.prd_draft;
  if (isStructuredMinutes(body)) return body.copy_ready_minutes || body.summary;
  return output.title;
}

export function OfficeOutputView({
  outputs,
  selectedOutput,
  loading,
  onSelectOutput,
  onTicketSubmitted,
}: {
  outputs: OfficeOutputRecord[];
  selectedOutput: OfficeOutputRecord | null;
  loading: boolean;
  onSelectOutput: (id: string) => void;
  onTicketSubmitted: (ticket: FeedbackTicketRecord) => void;
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
      <SectionCard title="输出记录" caption="跨 Skill 查看、复制和反馈">
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
          <PlanSummary plan={selectedOutput.agent_plan} />

          <OfficeOutputPreview output={selectedOutput.output} skillId={selectedOutput.skill_id} />

          <QualityStatusCard check={selectedOutput.quality_check} />

          {selectedOutput.rag?.enabled && (
            <div className="chip-row">
              <Badge tone="success">RAG · {selectedOutput.rag.sources.length} 段</Badge>
            </div>
          )}

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
            <p>查看结构化结果，也可以反馈问题。</p>
          </div>
        </SectionCard>
      )}

      <SectionCard title="问题反馈" caption="遇到问题可以直接提交工单">
        {selectedOutput ? (
          <FeedbackTicketPanel
            key={selectedOutput.id}
            target={{
              target_type: 'saved_output',
              target_id: selectedOutput.id,
              skill_id: selectedOutput.skill_id,
              output_title: selectedOutput.title,
            }}
            onSubmitted={onTicketSubmitted}
          />
        ) : (
          <div className="empty-state">
            <p>选择左侧输出后可以提交反馈工单。</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
