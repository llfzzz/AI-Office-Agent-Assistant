import {
  ClipboardList,
  Database,
  History,
  Library,
  MessageSquare,
  Mic,
  ShieldCheck,
  Tags,
} from 'lucide-react';
import type { NavGroupDefinition, NavGroupId, View } from '../types';

export const navigationGroups: NavGroupDefinition[] = [
  {
    id: 'agent',
    label: 'Skills',
    items: [
      { view: 'compose', label: '会议纪要', icon: Mic },
      { view: 'weekly', label: '周报生成', icon: ClipboardList },
      { view: 'prd', label: '需求评审', icon: ShieldCheck },
    ],
  },
  {
    id: 'memory',
    label: '记忆与资料',
    items: [
      { view: 'rag', label: 'RAG 资料库', icon: Database },
      { view: 'library', label: '会议记忆库', icon: Library },
      {
        view: 'detail',
        label: '会议追问',
        icon: MessageSquare,
        disabled: ({ selectedMeeting }) => !selectedMeeting,
      },
    ],
  },
  {
    id: 'records',
    label: '记录与迭代',
    items: [
      { view: 'outputs', label: '输出记录', icon: History },
      { view: 'feedback', label: '反馈迭代', icon: MessageSquare },
      { view: 'docs', label: '产品资料', icon: Tags },
    ],
  },
];

export const initialOpenNavGroups: Record<NavGroupId, boolean> = {
  agent: true,
  memory: true,
  records: true,
};

export function getActiveNavItem(view: View) {
  return navigationGroups.flatMap((group) => group.items).find((item) => item.view === view);
}

export function getNavGroupIdForView(view: View) {
  return navigationGroups.find((group) => group.items.some((item) => item.view === view))?.id;
}

export function onlyOpenNavGroup(groupId: NavGroupId = 'agent'): Record<NavGroupId, boolean> {
  return {
    agent: groupId === 'agent',
    memory: groupId === 'memory',
    records: groupId === 'records',
  };
}

export function isMobileNavViewport() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(max-width: 760px)').matches ||
    window.innerWidth <= 760 ||
    document.documentElement.clientWidth <= 760
  );
}
