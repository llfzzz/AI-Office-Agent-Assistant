import { useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareWarning, Send } from 'lucide-react';
import { Badge, Button, Input, Select, Textarea } from '../freejoy';
import { submitFeedbackTicket } from '../api';
import type { FeedbackTicketRecord, FeedbackTicketTarget } from '../types';

const FEEDBACK_ISSUE_TYPES = [
  '内容不准确',
  '信息有遗漏',
  '出现了没有依据的内容',
  '格式或表达不合适',
  '结果难以直接使用',
  '页面或操作问题',
  '其他问题',
];

const FEEDBACK_IMPACT_LEVELS = ['轻微', '影响工作', '严重阻塞'];

const BLANK_FORM = {
  issue_type: '',
  subject: '',
  details: '',
  expected_result: '',
  impact: '',
};

type TicketForm = typeof BLANK_FORM;
type TicketErrors = Partial<Record<keyof TicketForm, string>>;

/**
 * Reusable ticket-style feedback block, embedded under every generated result
 * and on saved outputs. Pass a `key` tied to the result identity so the form
 * resets when a new result arrives.
 */
export function FeedbackTicketPanel({
  target,
  onSubmitted,
}: {
  target: FeedbackTicketTarget;
  onSubmitted?: (ticket: FeedbackTicketRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TicketForm>(BLANK_FORM);
  const [errors, setErrors] = useState<TicketErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedTicket, setSubmittedTicket] = useState<FeedbackTicketRecord | null>(null);

  function update<K extends keyof TicketForm>(field: K, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate(): boolean {
    const next: TicketErrors = {};

    if (!form.issue_type) next.issue_type = '请选择问题类型';
    if (!form.subject.trim()) next.subject = '请填写问题标题';
    else if (form.subject.trim().length > 120) next.subject = '问题标题最多 120 字';
    if (!form.details.trim()) next.details = '请描述具体发生了什么';
    else if (form.details.trim().length > 2000) next.details = '问题描述最多 2000 字';
    if (form.expected_result.trim().length > 1000) next.expected_result = '期望结果最多 1000 字';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (isSubmitting || !validate()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const payload = await submitFeedbackTicket({
        ...target,
        issue_type: form.issue_type,
        subject: form.subject.trim(),
        details: form.details.trim(),
        expected_result: form.expected_result.trim(),
        impact: form.impact,
      });
      setSubmittedTicket(payload.feedback);
      setForm(BLANK_FORM);
      setErrors({});
      onSubmitted?.(payload.feedback);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '提交失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submittedTicket) {
    return (
      <div className="feedback-ticket-panel submitted" role="status">
        <div className="feedback-ticket-success">
          <CheckCircle2 size={18} aria-hidden="true" />
          <div>
            <strong>问题已记录</strong>
            <span>
              工单编号 {submittedTicket.ticket_no} · {submittedTicket.status}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSubmittedTicket(null);
            setOpen(true);
          }}
        >
          再反馈一条
        </Button>
      </div>
    );
  }

  return (
    <div className="feedback-ticket-panel">
      <div className="feedback-ticket-intro">
        <MessageSquareWarning size={18} aria-hidden="true" />
        <div>
          <strong>这次结果有问题？</strong>
          <span>如果内容不准确、有遗漏或不方便使用，请告诉我们具体发生了什么。</span>
        </div>
        {!open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-expanded={open}>
            反馈问题
          </Button>
        )}
      </div>

      {open && (
        <div className="feedback-ticket-form">
          <Select
            label="问题类型（必填）"
            value={form.issue_type}
            error={errors.issue_type}
            onChange={(event) => update('issue_type', event.target.value)}
            options={[{ label: '请选择问题类型', value: '' }, ...FEEDBACK_ISSUE_TYPES]}
          />
          <Input
            label="问题标题（必填）"
            value={form.subject}
            error={errors.subject}
            onChange={(event) => update('subject', event.target.value)}
            placeholder="例如：待办事项里出现了会上没提到的负责人"
          />
          <Textarea
            label="具体描述（必填）"
            rows={4}
            value={form.details}
            error={errors.details}
            onChange={(event) => update('details', event.target.value)}
            placeholder="发生了什么？哪一部分内容有问题？"
          />
          <Textarea
            label="期望的结果（可选）"
            rows={2}
            value={form.expected_result}
            error={errors.expected_result}
            onChange={(event) => update('expected_result', event.target.value)}
            placeholder="你期望这里显示什么？"
          />
          <Select
            label="影响程度（可选）"
            value={form.impact}
            onChange={(event) => update('impact', event.target.value)}
            options={[{ label: '不选择', value: '' }, ...FEEDBACK_IMPACT_LEVELS]}
          />

          {submitError && (
            <p className="feedback-ticket-error" role="alert">
              {submitError}
            </p>
          )}

          <div className="feedback-ticket-actions">
            {target.output_title && <Badge tone="neutral">{target.output_title}</Badge>}
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              iconLeft={isSubmitting ? <Loader2 className="spin" size={15} /> : <Send size={15} />}
            >
              {isSubmitting ? '正在提交' : '提交反馈'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isSubmitting}>
              收起
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
