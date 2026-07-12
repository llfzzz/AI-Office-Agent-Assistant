import type { LucideIcon } from 'lucide-react';
import type { MeetingAttachmentKind } from './index';

/** Top-level pages the app can route to. */
export type View =
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

export type NavGroupId = 'agent' | 'memory' | 'records' | 'help';

export type NavItemDefinition = {
  view: View;
  label: string;
  icon: LucideIcon;
};

export type NavGroupDefinition = {
  id: NavGroupId;
  label: string;
  items: NavItemDefinition[];
};

/** Per-view topbar copy (title + one-line subtitle). */
export type ViewMeta = {
  title: string;
  subtitle: string;
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
