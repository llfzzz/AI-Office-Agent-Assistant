import {
  CircleHelp,
  ClipboardList,
  Database,
  History,
  LayoutGrid,
  Library,
  MessagesSquare,
  Mic,
  ShieldCheck,
} from 'lucide-react';
import type { NavGroupDefinition, NavGroupId, View, ViewMeta } from '../types';

export const navigationGroups: NavGroupDefinition[] = [
  {
    id: 'agent',
    label: 'AI 技能',
    items: [
      { view: 'skills', label: '工作台', icon: LayoutGrid },
      { view: 'compose', label: '会议纪要', icon: Mic },
      { view: 'weekly', label: '周报生成', icon: ClipboardList },
      { view: 'prd', label: '需求评审', icon: ShieldCheck },
    ],
  },
  {
    id: 'memory',
    label: '知识与记忆',
    items: [
      { view: 'library', label: '会议记忆', icon: Library },
      { view: 'rag', label: 'RAG 资料库', icon: Database },
    ],
  },
  {
    id: 'records',
    label: '记录与改进',
    items: [
      { view: 'outputs', label: '输出记录', icon: History },
      { view: 'feedback', label: '反馈迭代', icon: MessagesSquare },
    ],
  },
  {
    id: 'help',
    label: '帮助',
    items: [{ view: 'docs', label: '产品指南', icon: CircleHelp }],
  },
];

/** Topbar copy per view. `detail` falls back to the meeting title in App. */
export const viewMeta: Record<View, ViewMeta> = {
  skills: { title: 'AI 工作台', subtitle: '选择一个 Skill，开始今天的办公任务' },
  compose: { title: '会议纪要', subtitle: '输入会议材料，生成可追踪的结构化结果' },
  weekly: { title: '周报生成', subtitle: '引用会议与资料，一键汇总本周进展' },
  prd: { title: '需求评审', subtitle: '把需求材料整理成可评审、可验收的结构' },
  library: { title: '会议记忆', subtitle: '检索会议、决策、待办与长期记忆' },
  detail: { title: '会议详情', subtitle: '在当前会议上下文内追问与跟进' },
  rag: { title: 'RAG 知识库', subtitle: '管理可被 AI Skill 引用的团队知识' },
  outputs: { title: '输出记录', subtitle: '查看历史输出并提交具体评价' },
  feedback: { title: '反馈迭代', subtitle: '聚合高频问题，把低分反馈变成改进项' },
  docs: { title: '产品指南', subtitle: '快速开始、能力边界与故障恢复' },
};

export const initialOpenNavGroups: Record<NavGroupId, boolean> = {
  agent: true,
  memory: true,
  records: true,
  help: true,
};

export function getActiveNavItem(view: View) {
  return navigationGroups.flatMap((group) => group.items).find((item) => item.view === view);
}

export function getNavGroupIdForView(view: View) {
  if (view === 'detail') {
    // Detail has no nav item of its own — it lives under the memory group.
    return 'memory';
  }
  return navigationGroups.find((group) => group.items.some((item) => item.view === view))?.id;
}

export function onlyOpenNavGroup(groupId: NavGroupId = 'agent'): Record<NavGroupId, boolean> {
  return {
    agent: groupId === 'agent',
    memory: groupId === 'memory',
    records: groupId === 'records',
    help: groupId === 'help',
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
