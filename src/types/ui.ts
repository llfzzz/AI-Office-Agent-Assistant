import type { LucideIcon } from 'lucide-react';
import type { MeetingAttachmentKind, MeetingRecord } from './index';

/** Top-level pages the app can route to. */
export type View =
  | 'home'
  | 'skills'
  | 'compose'
  | 'weekly'
  | 'prd'
  | 'library'
  | 'detail'
  | 'rag'
  | 'outputs'
  | 'feedback'
  | 'docs';

export type AuthMode = 'login' | 'register';

export type NavGroupId = 'agent' | 'memory' | 'records';

export type NavItemDefinition = {
  view: View;
  label: string;
  icon: LucideIcon;
  disabled?: (context: { selectedMeeting: MeetingRecord | null }) => boolean;
};

export type NavGroupDefinition = {
  id: NavGroupId;
  label: string;
  items: NavItemDefinition[];
};

export type MeetingAttachmentStatus = 'processing' | 'ready' | 'error';

export type MeetingAttachment = {
  id: string;
  kind: MeetingAttachmentKind;
  fileName: string;
  mimeType: string;
  size: number;
  extractedText: string;
  selected: boolean;
  status: MeetingAttachmentStatus;
  error?: string;
  createdAt: string;
};
