import { attachmentKindLabels } from '../data/constants';
import type { MeetingAttachment, MeetingAttachmentKind, MeetingInput } from '../types';

export function createAttachmentId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function randomProtectionToken(size = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint32Array(size);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  }

  return Array.from({ length: size }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

export function compactTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    '-',
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join('');
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('flac')) return 'flac';
  if (mimeType.includes('m4a')) return 'm4a';
  return 'webm';
}

export function protectedRecordingFileName(mimeType: string) {
  return `录音-${compactTimestamp()}-${randomProtectionToken()}.${extensionFromMimeType(mimeType)}`;
}

export function inferUploadKind(file: File): Extract<MeetingAttachmentKind, 'image' | 'file'> {
  return file.type.startsWith('image/') ? 'image' : 'file';
}

export function buildMeetingTranscript(form: MeetingInput, attachments: MeetingAttachment[]) {
  const manualText = form.raw_transcript.trim();
  const attachmentSections = attachments
    .filter((attachment) => attachment.selected && attachment.status === 'ready' && attachment.extractedText.trim())
    .map((attachment) => {
      const label = attachmentKindLabels[attachment.kind];
      return `【${label}：${attachment.fileName}】\n${attachment.extractedText.trim()}`;
    });

  return [manualText, ...attachmentSections].filter(Boolean).join('\n\n');
}

/** Client-side download of copy-ready text as a Markdown file. */
export function downloadMarkdown(text: string, filename: string) {
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function attachmentMeta(attachment: MeetingAttachment) {
  if (attachment.status === 'processing') {
    return attachment.kind === 'recording' || attachment.kind === 'audio' ? '转写中' : '提取中';
  }

  if (attachment.status === 'error') {
    return attachment.error || '处理失败';
  }

  return `${attachmentKindLabels[attachment.kind]} · ${attachment.extractedText.trim().length} 字`;
}
