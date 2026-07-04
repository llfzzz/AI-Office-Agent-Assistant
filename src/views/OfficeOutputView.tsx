import { Database, History, Loader2, Send } from 'lucide-react';
import { Button, Spinner, Switch, Textarea } from '../freejoy';
import { OfficeOutputPreview } from '../components/OfficeOutputPreview';
import { ScorePicker } from '../ui';
import { skillName } from '../lib/office';
import type { OfficeFeedbackInput, OfficeOutputRecord } from '../types';

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
  return (
    <section className="office-record-layout">
      <div className="panel output-list-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">输出记录</span>
            <h2>办公 Skill 历史</h2>
          </div>
        </div>
        {loading ? (
          <div className="loading-row">
            <Spinner size={18} label="正在读取输出记录" />
          </div>
        ) : outputs.length === 0 ? (
          <div className="empty-state">
            <History size={28} />
            <h3>还没有办公输出</h3>
            <p>在周报生成或需求评审页面保存结果后会出现在这里。</p>
          </div>
        ) : (
          <div className="office-output-list">
            {outputs.map((output) => (
              <button
                type="button"
                className={selectedOutput?.id === output.id ? 'office-output-row active' : 'office-output-row'}
                key={output.id}
                onClick={() => onSelectOutput(output.id)}
              >
                <span>{skillName(output.skill_id)}</span>
                <strong>{output.title}</strong>
                <small>{new Date(output.updated_at).toLocaleString()}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="office-record-main">
        {selectedOutput ? (
          <>
            <OfficeOutputPreview output={selectedOutput.output} skillId={selectedOutput.skill_id} />
            <FeedbackFormPanel
              form={feedbackForm}
              isSubmitting={isSubmittingFeedback}
              onForm={onFeedbackForm}
              onSubmit={onSubmitFeedback}
            />
          </>
        ) : (
          <div className="panel result-panel empty-result">
            <Database size={28} />
            <h2>选择一条输出</h2>
            <p>查看结构化结果并提交准确性、可复制性和完整性反馈。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function FeedbackFormPanel({
  form,
  isSubmitting,
  onForm,
  onSubmit,
}: {
  form: OfficeFeedbackInput;
  isSubmitting: boolean;
  onForm: (form: OfficeFeedbackInput) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="panel feedback-form-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">反馈与迭代</span>
          <h2>评价这次输出</h2>
        </div>
      </div>
      <div className="score-grid">
        <ScorePicker label="准确性" value={form.accuracy_score} onChange={(value) => onForm({ ...form, accuracy_score: value })} />
        <ScorePicker label="可复制性" value={form.copyability_score} onChange={(value) => onForm({ ...form, copyability_score: value })} />
        <ScorePicker label="完整性" value={form.completeness_score} onChange={(value) => onForm({ ...form, completeness_score: value })} />
      </div>
      <Switch
        checked={form.needs_heavy_edit}
        onChange={(checked) => onForm({ ...form, needs_heavy_edit: checked })}
        label="需要大量人工修改"
      />
      <div className="form-grid">
        <Textarea
          label="遗漏了什么"
          rows={3}
          value={form.missing_info}
          onChange={(event) => onForm({ ...form, missing_info: event.target.value })}
        />
        <Textarea
          label="哪些内容有幻觉"
          rows={3}
          value={form.hallucination}
          onChange={(event) => onForm({ ...form, hallucination: event.target.value })}
        />
      </div>
      <Textarea
        label="下一版建议"
        rows={3}
        value={form.suggestion}
        onChange={(event) => onForm({ ...form, suggestion: event.target.value })}
      />
      <Button
        onClick={onSubmit}
        disabled={isSubmitting}
        iconLeft={isSubmitting ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
      >
        提交反馈
      </Button>
    </section>
  );
}
