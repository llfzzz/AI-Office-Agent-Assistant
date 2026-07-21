import { useRef, useState } from 'react';
import {
  Copy,
  FileText,
  Loader2,
  Mic,
  Music,
  Save,
  Sparkles,
  StickyNote,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Badge, Button, Input, Select, Tooltip } from '../freejoy';
import { FeedbackTicketPanel } from '../components/FeedbackTicketPanel';
import { QualityStatusCard } from '../components/OfficeResultPanel';
import { ResultPanel } from '../components/ResultPanel';
import { SectionCard } from '../components/SectionCard';
import { StepperPill } from '../components/StepperPill';
import { MeetingAssetIcon } from '../components/primitives';
import { useIdentityKey } from '../hooks/useIdentityKey';
import { attachmentMeta, buildMeetingTranscript, protectedRecordingFileName } from '../lib/format';
import { meetingFileAccept, meetingTypes, sampleMeeting } from '../data/constants';
import type {
  AnalysisResult,
  FeedbackTicketRecord,
  MeetingAttachment,
  MeetingAttachmentKind,
  MeetingInput,
} from '../types';

export function ComposeView({
  form,
  attachments,
  analysis,
  canUseRag,
  isAnalyzing,
  isSaving,
  isTranscribing,
  onFormChange,
  onTranscribe,
  onExtractAttachment,
  onToggleAttachment,
  onDeleteAttachment,
  onError,
  onAnalyze,
  onSave,
  onTicketSubmitted,
}: {
  form: MeetingInput;
  attachments: MeetingAttachment[];
  analysis: AnalysisResult | null;
  canUseRag: boolean;
  isAnalyzing: boolean;
  isSaving: boolean;
  isTranscribing: boolean;
  onFormChange: (form: MeetingInput) => void;
  onTranscribe: (file: Blob, fileName?: string, kind?: Extract<MeetingAttachmentKind, 'recording' | 'audio'>) => void;
  onExtractAttachment: (file: File) => void;
  onToggleAttachment: (id: string) => void;
  onDeleteAttachment: (id: string) => void;
  onError: (message: string) => void;
  onAnalyze: () => void;
  onSave: () => void;
  onTicketSubmitted: (ticket: FeedbackTicketRecord) => void;
}) {
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  const analyzableTextLength = buildMeetingTranscript(form, attachments).trim().length;
  const participantCount = form.participants
    .split(/[,，、]/)
    .map((name) => name.trim())
    .filter(Boolean).length;

  if (analysis) {
    return (
      <ComposeResult
        form={form}
        analysis={analysis}
        isSaving={isSaving}
        onSave={onSave}
        onReanalyze={onAnalyze}
        isAnalyzing={isAnalyzing}
        onTicketSubmitted={onTicketSubmitted}
      />
    );
  }

  return (
    <>
      <StepperPill
        step={1}
        total={2}
        heading="准备会议材料"
        actions={
          <Button variant="ghost" size="sm" iconLeft={<Sparkles size={15} />} onClick={() => onFormChange(sampleMeeting)}>
            填充示例
          </Button>
        }
      />

      <div className="compose-layout">
        <SectionCard title="会议信息" caption="支持文字、音频、图片与文档输入">
          <div className="form-grid two">
            <Input
              label="会议标题"
              value={form.title}
              onChange={(event) => onFormChange({ ...form, title: event.target.value })}
              placeholder="例如：AI 会议助手第一版功能讨论"
            />
            <Select
              label="会议类型"
              value={form.meeting_type}
              onChange={(event) => onFormChange({ ...form, meeting_type: event.target.value })}
              options={[...meetingTypes]}
            />
          </div>
          <Input
            label="参会人"
            value={form.participants}
            onChange={(event) => onFormChange({ ...form, participants: event.target.value })}
            placeholder="姓名用逗号分隔"
          />

          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              转写与材料
            </span>
            <UploadTiles
              isTranscribing={isTranscribing}
              onTranscribe={onTranscribe}
              onExtractAttachment={onExtractAttachment}
              onError={onError}
              onPaste={() => transcriptRef.current?.focus()}
            />
            <span className="upload-hint" style={{ display: 'block', marginTop: 8 }}>
              DOCX / PPTX / XLSX / 图片
            </span>
          </div>

          <div>
            <label className="eyebrow" htmlFor="meeting-raw-transcript" style={{ display: 'block', marginBottom: 8 }}>
              会议转写稿
            </label>
            <textarea
              ref={transcriptRef}
              id="meeting-raw-transcript"
              className="fj-textarea"
              rows={7}
              value={form.raw_transcript}
              onChange={(event) => onFormChange({ ...form, raw_transcript: event.target.value })}
              placeholder="粘贴或输入会议文本，AI 会提取材料再生成结构化纪要"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface-soft)',
                fontSize: '13px',
                lineHeight: 1.7,
                color: 'var(--text)',
                resize: 'vertical',
              }}
            />
            <MeetingAttachmentList
              attachments={attachments}
              onToggleAttachment={onToggleAttachment}
              onDeleteAttachment={onDeleteAttachment}
            />
          </div>

          <div className="page-card-foot">
            <Badge tone={canUseRag ? 'success' : 'neutral'}>{canUseRag ? 'RAG 已启用' : 'RAG 未启用'}</Badge>
            <span className="form-note">{canUseRag ? '将引用资料库中的产品资料' : '可在 RAG 资料库启用引用'}</span>
            <Button
              onClick={onAnalyze}
              disabled={isAnalyzing}
              iconLeft={isAnalyzing ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}
              style={{ marginLeft: 'auto' }}
            >
              生成会议纪要
            </Button>
          </div>
        </SectionCard>

        <div className="compose-rail">
          <SectionCard title="输出预览" caption="生成后在这里显示结构化结果">
            <div className="preview-empty">
              <span className="preview-dot" aria-hidden="true" />
              <div>
                <h3>等待生成</h3>
                <p>填完左侧材料后开始</p>
              </div>
              <div className="mini-steps">
                <div className="mini-step active">
                  <span className="mini-step-num">01</span>
                  材料提取
                </div>
                <div className="mini-step">
                  <span className="mini-step-num">02</span>
                  结构化分析
                </div>
                <div className="mini-step">
                  <span className="mini-step-num">03</span>
                  记忆归档
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="输入质量检查" caption="生成前快速确认">
            <div className="quality-checklist">
              <Badge tone={form.title.trim() ? 'success' : 'neutral'}>
                {form.title.trim() ? '标题已填写' : '标题待填写'}
              </Badge>
              <Badge tone={participantCount > 0 ? 'success' : 'neutral'}>参会人 {participantCount} 位</Badge>
              <Badge tone={analyzableTextLength > 0 ? 'success' : 'neutral'}>材料 {analyzableTextLength} 字</Badge>
            </div>
            <span className="form-note">建议补充会议时间与参会人，便于后续检索。</span>
            <Button variant="secondary" size="sm" full onClick={() => transcriptRef.current?.focus()}>
              补充会议信息
            </Button>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function ComposeResult({
  form,
  analysis,
  isSaving,
  isAnalyzing,
  onSave,
  onReanalyze,
  onTicketSubmitted,
}: {
  form: MeetingInput;
  analysis: AnalysisResult;
  isSaving: boolean;
  isAnalyzing: boolean;
  onSave: () => void;
  onReanalyze: () => void;
  onTicketSubmitted: (ticket: FeedbackTicketRecord) => void;
}) {
  const [copied, setCopied] = useState(false);
  const minutes = analysis.structured_minutes;
  const provider = analysis.provider;
  const ticketKey = useIdentityKey(analysis);

  async function copyAll() {
    const text =
      minutes.copy_ready_minutes ||
      [
        minutes.one_sentence_summary,
        '',
        minutes.summary,
        '',
        '决策：',
        ...minutes.decisions.map((d) => `- ${d.decision}`),
        '',
        '待办：',
        ...minutes.action_items.map((a) => `- ${a.task}（${a.owner || '未提及'}）`),
      ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <StepperPill
        step={2}
        total={2}
        heading="纪要已生成"
        actions={
          <>
            <Button variant="secondary" size="sm" iconLeft={<Copy size={15} />} onClick={copyAll}>
              {copied ? '已复制' : '复制全文'}
            </Button>
            <Button
              size="sm"
              iconLeft={isSaving ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
              onClick={onSave}
              disabled={isSaving}
            >
              保存记忆
            </Button>
          </>
        }
      />

      <div className="result-layout">
        <SectionCard title="原始材料" caption={form.title || '未命名会议'}>
          <div className="chip-row">
            {form.meeting_type && form.meeting_type !== '自动识别' && (
              <span className="chip">{form.meeting_type}</span>
            )}
            {form.participants.trim() && (
              <span className="chip">{form.participants.split(/[,，、]/).filter((p) => p.trim()).length} 位参会人</span>
            )}
          </div>
          <div className="transcript-panel">{form.raw_transcript || '（无原始文本，来自附件提取）'}</div>
          <div className="mono-line">
            来源：{provider ? `${analysis.source === 'default-api' ? 'API' : '体验'} · ${provider.model}` : '体验模式'}
            {` · ${form.raw_transcript.trim().length} 字`}
          </div>
          <QualityStatusCard check={analysis.quality_check} revisionApplied={analysis.revision_applied} />
          <p className="form-note">
            已识别 {minutes.decisions.length} 项决策、{minutes.action_items.length} 项待办。
          </p>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={isAnalyzing ? <Loader2 className="spin" size={15} /> : <Wand2 size={15} />}
            onClick={onReanalyze}
            disabled={isAnalyzing}
          >
            重新生成
          </Button>
          <FeedbackTicketPanel
            key={ticketKey}
            target={{
              target_type: 'generation',
              skill_id: 'meeting_minutes',
              output_title: form.title || '会议纪要',
            }}
            onSubmitted={onTicketSubmitted}
          />
        </SectionCard>

        <ResultPanel analysis={analysis} />
      </div>
    </>
  );
}

function UploadTiles({
  isTranscribing,
  onTranscribe,
  onExtractAttachment,
  onError,
  onPaste,
}: {
  isTranscribing: boolean;
  onTranscribe: (file: Blob, fileName?: string, kind?: Extract<MeetingAttachmentKind, 'recording' | 'audio'>) => void;
  onExtractAttachment: (file: File) => void;
  onError: (message: string) => void;
  onPaste: () => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('当前浏览器不支持网页录音，请改用上传音频。');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError('无法访问麦克风，请检查浏览器权限或改用上传音频。');
      return;
    }

    const preferredType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType: preferredType });

    chunksRef.current = [];
    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: preferredType });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      onTranscribe(blob, protectedRecordingFileName(preferredType), 'recording');
    };
    recorder.start();
    setIsRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  }

  return (
    <div className="upload-tiles">
      <label className={isTranscribing ? 'upload-tile' : 'upload-tile'} aria-label="上传文件">
        <FileText size={18} />
        上传文件
        <input
          type="file"
          accept={`${meetingFileAccept},image/*`}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onExtractAttachment(file);
              event.target.value = '';
            }
          }}
        />
      </label>

      <label className={isTranscribing ? 'upload-tile' : 'upload-tile'} aria-label="上传音频">
        <Music size={18} />
        上传音频
        <input
          type="file"
          accept="audio/*,video/mp4,video/webm"
          hidden
          disabled={isTranscribing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onTranscribe(file, file.name, 'audio');
              event.target.value = '';
            }
          }}
        />
      </label>

      <button
        type="button"
        className={isRecording ? 'upload-tile recording' : 'upload-tile'}
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isTranscribing}
      >
        {isRecording ? <span className="tone-dot rose" /> : <Mic size={18} />}
        {isRecording ? '停止录音' : '开始录音'}
      </button>

      <button type="button" className="upload-tile" onClick={onPaste}>
        <StickyNote size={18} />
        粘贴内容
      </button>
    </div>
  );
}

function MeetingAttachmentList({
  attachments,
  onToggleAttachment,
  onDeleteAttachment,
}: {
  attachments: MeetingAttachment[];
  onToggleAttachment: (id: string) => void;
  onDeleteAttachment: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="attachment-list" aria-label="会议内容附件" style={{ marginTop: 10 }}>
      {attachments.map((attachment) => (
        <div
          className={attachment.status === 'error' ? 'attachment-row error' : 'attachment-row'}
          key={attachment.id}
        >
          <MeetingAssetIcon kind={attachment.kind} />
          <div className="attachment-copy">
            <strong>{attachment.fileName}</strong>
            <span>{attachmentMeta(attachment)}</span>
          </div>
          <div className="attachment-actions">
            <Tooltip content={attachment.selected ? '已选择，点击取消' : '未选择，点击选择'} placement="top">
              <button
                type="button"
                className="icon-button"
                onClick={() => onToggleAttachment(attachment.id)}
                aria-pressed={attachment.selected}
                aria-label={attachment.selected ? '取消选择' : '选择'}
                style={attachment.selected ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              >
                {attachment.status === 'processing' ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <span className={attachment.selected ? 'tone-dot coral' : 'tone-dot neutral'} />
                )}
              </button>
            </Tooltip>
            <Tooltip content="删除" placement="top">
              <button
                type="button"
                className="icon-button"
                onClick={() => onDeleteAttachment(attachment.id)}
                aria-label={`删除 ${attachment.fileName}`}
              >
                <Trash2 size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
      ))}
    </div>
  );
}
