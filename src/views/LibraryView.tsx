import { AlertTriangle, ArrowRight, Plus, Search } from 'lucide-react';
import { Badge, Button, Input, Select, Spinner } from '../freejoy';
import { SectionCard } from '../components/SectionCard';
import { StatTile } from '../components/StatTile';
import { meetingTypes } from '../data/constants';
import type { MeetingRecord } from '../types';

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'sun' | 'bloom';

const TYPE_TONE: Record<string, BadgeTone> = {
  需求评审: 'accent',
  项目进度会: 'success',
  Bug复盘: 'danger',
  竞品讨论: 'bloom',
  技术讨论: 'sun',
};

function typeTone(type: string): BadgeTone {
  return TYPE_TONE[type] ?? 'neutral';
}

function meetingTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function LibraryView({
  meetings,
  search,
  typeFilter,
  loading,
  onSearch,
  onTypeFilter,
  onSelectMeeting,
  onNewMeeting,
}: {
  meetings: MeetingRecord[];
  search: string;
  typeFilter: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onTypeFilter: (value: string) => void;
  onSelectMeeting: (id: string) => void;
  onNewMeeting: () => void;
}) {
  const decisionCount = meetings.reduce((n, m) => n + (m.analysis.structured_minutes.decisions?.length || 0), 0);
  const memoryCount = meetings.reduce((n, m) => n + (m.analysis.structured_minutes.long_term_memory?.length || 0), 0);
  const actionCount = meetings.reduce((n, m) => n + (m.analysis.structured_minutes.action_items?.length || 0), 0);

  const topThemes = Array.from(
    meetings.reduce((counts, meeting) => {
      for (const keyword of meeting.analysis.structured_minutes.keywords || []) {
        counts.set(keyword, (counts.get(keyword) || 0) + 1);
      }
      return counts;
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([keyword]) => keyword);

  return (
    <>
      <div className="library-toolbar">
        <div className="toolbar-search">
          <Input
            iconLeft={<Search size={16} />}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="搜索标题、参会人、决策或待办"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(event) => onTypeFilter(event.target.value)}
          options={['全部', ...meetingTypes.filter((type) => type !== '自动识别')]}
        />
        <Button iconLeft={<Plus size={16} />} onClick={onNewMeeting}>
          新建会议
        </Button>
      </div>

      <div className="overview-grid">
        <StatTile value={meetings.length} label="会议记录" />
        <StatTile value={decisionCount} label="关键决策" />
        <StatTile value={memoryCount} label="长期记忆" />
        <StatTile value={actionCount} label="待办事项" delta="待跟进" deltaTone="sun" />
      </div>

      <div className="library-columns">
        <SectionCard title="会议时间线" caption="按日期整理，保留来源与记忆状态">
          {loading ? (
            <div className="loading-row">
              <Spinner size={18} label="正在读取记忆库" />
            </div>
          ) : meetings.length === 0 ? (
            <div className="empty-state">
              <h3>还没有会议记忆</h3>
              <p>保存会议纪要后会出现在这里。</p>
            </div>
          ) : (
            <div className="timeline-list">
              {meetings.map((meeting) => {
                const minutes = meeting.analysis.structured_minutes;
                return (
                  <button
                    type="button"
                    className="timeline-item"
                    key={meeting.id}
                    onClick={() => onSelectMeeting(meeting.id)}
                  >
                    <div className="timeline-meta">
                      <time>{meetingTime(meeting.updated_at)}</time>
                      <span className="spacer" />
                      <Badge tone={typeTone(minutes.meeting_type || meeting.meeting_type)}>
                        {minutes.meeting_type || meeting.meeting_type}
                      </Badge>
                    </div>
                    <h3>{meeting.title}</h3>
                    <p className="timeline-people">{meeting.participants || '未提及参会人'}</p>
                    <div className="timeline-foot">
                      <span className="counts-pill">
                        {minutes.decisions.length} 决策 · {minutes.action_items.length} 待办 · {minutes.long_term_memory.length} 记忆
                      </span>
                      <span className="row-arrow" aria-hidden="true">
                        <ArrowRight size={15} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="记忆地图" caption="高频主题与待办状态" className="memory-map-card">
          <div className="big-number">
            {memoryCount}
            <small>条长期记忆</small>
          </div>
          <div className="memory-gradient" />
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              高频主题
            </span>
            {topThemes.length === 0 ? (
              <p className="list-empty">保存更多会议后会自动归纳主题。</p>
            ) : (
              <div className="chip-row">
                {topThemes.map((theme) => (
                  <span className="chip" key={theme}>
                    {theme}
                  </span>
                ))}
              </div>
            )}
          </div>
          {actionCount > 0 && (
            <div className="note-panel sun">
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} /> {actionCount} 项待办待跟进
              </strong>
              <span>在会议详情中逐条查看负责人与截止日期。</span>
            </div>
          )}
          <div className="note-panel mint">
            <strong>记忆可用</strong>
            <span>已启用会议追问与周报引用，最近无同步异常。</span>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
