import { useRef, useState } from 'react';
import { Loader2, Save, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Button, Input, Select, Tooltip } from '../freejoy';
import { ResultPanel } from '../components/ResultPanel';
import { MeetingAssetIcon } from '../components/primitives';
import { attachmentMeta, buildMeetingTranscript, protectedRecordingFileName } from '../lib/format';
import { meetingFileAccept, meetingTypes, sampleMeeting } from '../data/constants';
import type { AnalysisResult, MeetingAttachment, MeetingAttachmentKind, MeetingInput } from '../types';

export function ComposeView({
  form,
  attachments,
  analysis,
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
}: {
  form: MeetingInput;
  attachments: MeetingAttachment[];
  analysis: AnalysisResult | null;
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
}) {
  const analyzableTextLength = buildMeetingTranscript(form, attachments).trim().length;

  return (
    <section className="two-column">
      <div className="panel compose-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">新建会议</span>
            <h2>输入转写稿</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onFormChange(sampleMeeting)} iconLeft={<Sparkles size={16} />}>
            示例
          </Button>
        </div>

        <div className="form-grid">
          <Input
            label="会议标题"
            value={form.title}
            onChange={(event) => onFormChange({ ...form, title: event.target.value })}
            placeholder="例如：AI 会议助手第一版功能讨论"
          />
          <Input
            label="会议日期"
            type="date"
            value={form.date}
            onChange={(event) => onFormChange({ ...form, date: event.target.value })}
          />
          <Select
            label="会议类型"
            value={form.meeting_type}
            onChange={(event) => onFormChange({ ...form, meeting_type: event.target.value })}
            options={[...meetingTypes]}
          />
          <Input
            label="参会人"
            value={form.participants}
            onChange={(event) => onFormChange({ ...form, participants: event.target.value })}
            placeholder="姓名用逗号分隔"
          />
        </div>

        <div className="transcript-workbench">
          <div className="workbench-heading">
            <div>
              <span className="eyebrow">转写部分</span>
              <h3>语音与文本集合</h3>
            </div>
            <span>{analyzableTextLength ? `${analyzableTextLength} 字可分析` : '未输入内容'}</span>
          </div>

          <div className="transcript-field">
            <label className="field-label" htmlFor="meeting-raw-transcript">
              原始会议文本
            </label>
            <div className="transcript-input-wrap">
              <textarea
                id="meeting-raw-transcript"
                value={form.raw_transcript}
                onChange={(event) => onFormChange({ ...form, raw_transcript: event.target.value })}
                placeholder="粘贴或输入会议文本"
              />
              <MeetingContentToolbar
                isTranscribing={isTranscribing}
                onTranscribe={onTranscribe}
                onExtractAttachment={onExtractAttachment}
                onError={onError}
              />
            </div>
            <MeetingAttachmentList
              attachments={attachments}
              onToggleAttachment={onToggleAttachment}
              onDeleteAttachment={onDeleteAttachment}
            />
          </div>
        </div>

        <div className="button-row">
          <Button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            iconLeft={isAnalyzing ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
          >
            生成结构化纪要
          </Button>
          <Button
            variant="secondary"
            onClick={onSave}
            disabled={!analysis || isSaving}
            iconLeft={isSaving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
          >
            保存到记忆库
          </Button>
        </div>
      </div>

      <div className="compose-side">
        <ResultPanel analysis={analysis} />
      </div>
    </section>
  );
}

function MeetingContentToolbar({
  isTranscribing,
  onTranscribe,
  onExtractAttachment,
  onError,
}: {
  isTranscribing: boolean;
  onTranscribe: (file: Blob, fileName?: string, kind?: Extract<MeetingAttachmentKind, 'recording' | 'audio'>) => void;
  onExtractAttachment: (file: File) => void;
  onError: (message: string) => void;
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
    <div className="attachment-toolbar" aria-label="会议内容附件操作">
      <Tooltip content={isRecording ? '停止录音' : '开始录音'} placement="top">
        <button
          type="button"
          className={isRecording ? 'attachment-tool-button active' : 'attachment-tool-button'}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          aria-label={isRecording ? '停止录音' : '开始录音'}
        >
          <MeetingAssetIcon kind="recording" />
        </button>
      </Tooltip>
      <Tooltip content={isTranscribing ? '正在转写' : '上传音频'} placement="top">
        <label
          className={isTranscribing ? 'attachment-tool-button attachment-tool-label disabled' : 'attachment-tool-button attachment-tool-label'}
          aria-label="上传音频"
        >
          <MeetingAssetIcon kind="audio" />
          <input
            type="file"
            accept="audio/*,video/mp4,video/webm"
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
      </Tooltip>
      <Tooltip content="上传图片" placement="top">
        <label className="attachment-tool-button attachment-tool-label" aria-label="上传图片">
          <MeetingAssetIcon kind="image" />
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onExtractAttachment(file);
                event.target.value = '';
              }
            }}
          />
        </label>
      </Tooltip>
      <Tooltip content="上传文件" placement="top">
        <label className="attachment-tool-button attachment-tool-label" aria-label="上传文件">
          <MeetingAssetIcon kind="file" />
          <input
            type="file"
            accept={meetingFileAccept}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onExtractAttachment(file);
                event.target.value = '';
              }
            }}
          />
        </label>
      </Tooltip>
      {isTranscribing && (
        <span className="attachment-tool-status" aria-label="正在转写">
          <Loader2 className="spin" size={15} />
        </span>
      )}
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
    <div className="meeting-attachment-list" aria-label="会议内容附件">
      {attachments.map((attachment) => (
        <div
          className={[
            'meeting-attachment-item',
            attachment.selected ? 'selected' : '',
            attachment.status,
          ]
            .filter(Boolean)
            .join(' ')}
          key={attachment.id}
        >
          <Tooltip content={attachment.selected ? '已选择，点击取消' : '未选择，点击选择'} placement="top" style={{ width: '100%' }}>
            <button
              type="button"
              className="meeting-attachment-select"
              onClick={() => onToggleAttachment(attachment.id)}
              aria-pressed={attachment.selected}
            >
              <MeetingAssetIcon kind={attachment.kind} />
              <span className="meeting-attachment-copy">
                <strong>{attachment.fileName}</strong>
                <span>{attachmentMeta(attachment)}</span>
              </span>
            </button>
          </Tooltip>
          <Tooltip content="删除" placement="top">
            <button
              type="button"
              className="meeting-attachment-delete"
              onClick={() => onDeleteAttachment(attachment.id)}
              aria-label={`删除 ${attachment.fileName}`}
            >
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}
