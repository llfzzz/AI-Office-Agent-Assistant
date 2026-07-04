import { ArrowRight, CalendarDays, Search, UserRound } from 'lucide-react';
import { Badge, Input, Select, Spinner } from '../freejoy';
import { EmptyState } from '../components/primitives';
import { meetingTypes } from '../data/constants';
import type { MeetingRecord } from '../types';

export function LibraryView({
  meetings,
  search,
  typeFilter,
  loading,
  onSearch,
  onTypeFilter,
  onSelectMeeting,
}: {
  meetings: MeetingRecord[];
  search: string;
  typeFilter: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onTypeFilter: (value: string) => void;
  onSelectMeeting: (id: string) => void;
}) {
  return (
    <section className="panel library-panel">
      <div className="panel-heading library-heading">
        <div>
          <span className="eyebrow">会议记忆库</span>
          <h2>历史会议</h2>
        </div>
        <div className="library-controls">
          <Input
            iconLeft={<Search size={17} />}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="标题、关键词、参会人"
            style={{ minWidth: 220 }}
          />
          <Select
            value={typeFilter}
            onChange={(event) => onTypeFilter(event.target.value)}
            options={['全部', ...meetingTypes.filter((type) => type !== '自动识别')]}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-row">
          <Spinner size={18} label="正在读取记忆库" />
        </div>
      ) : meetings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="meeting-list">
          {meetings.map((meeting) => {
            const minutes = meeting.analysis.structured_minutes;
            return (
              <button type="button" className="meeting-card" key={meeting.id} onClick={() => onSelectMeeting(meeting.id)}>
                <div className="meeting-card-main">
                  <Badge tone="success">{minutes.meeting_type || meeting.meeting_type}</Badge>
                  <h3>{meeting.title}</h3>
                  <p>{minutes.one_sentence_summary}</p>
                  <div className="card-meta">
                    <span>
                      <CalendarDays size={14} />
                      {meeting.date}
                    </span>
                    <span>
                      <UserRound size={14} />
                      {meeting.participants || '未提及'}
                    </span>
                  </div>
                </div>
                <div className="meeting-card-side">
                  <span>{minutes.action_items.length} 待办</span>
                  <span>{minutes.long_term_memory.length} 记忆</span>
                  <ArrowRight size={18} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
