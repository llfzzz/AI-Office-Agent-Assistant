import { ArrowRight, ClipboardList, Mic, ShieldCheck } from 'lucide-react';
import { Badge, Button } from '../freejoy';
import { SectionCard } from '../components/SectionCard';
import { StatTile } from '../components/StatTile';
import { skillCards } from '../data/constants';
import { skillName } from '../lib/office';
import type { OfficeOutputRecord, SkillId, View } from '../types';

const SKILL_TONE: Record<SkillId, { dot: string; badge: 'accent' | 'sun' | 'bloom'; tag: string }> = {
  meeting_minutes: { dot: 'coral', badge: 'accent', tag: '会议记忆' },
  weekly_report: { dot: 'sun', badge: 'sun', tag: '本周总结' },
  prd_review: { dot: 'bloom', badge: 'bloom', tag: 'PRD 自检' },
};

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString();
}

export function SkillWorkbenchView({
  meetingCount,
  outputCount,
  feedbackCount,
  actionCount,
  memoryCount,
  knowledgeCount,
  ragEnabled,
  recentOutputs,
  onOpenView,
}: {
  meetingCount: number;
  outputCount: number;
  feedbackCount: number;
  actionCount: number;
  memoryCount: number;
  knowledgeCount: number;
  ragEnabled: boolean;
  recentOutputs: OfficeOutputRecord[];
  onOpenView: (view: View) => void;
}) {
  const visibleOutputs = recentOutputs.slice(0, 4);
  const ragActive = ragEnabled && knowledgeCount > 0;

  return (
    <>
      <div className="hero-dark">
        <div className="hero-dark-copy">
          <span className="hero-pill">今日工作台</span>
          <h2>把散落的办公信息，变成可追踪的记忆。</h2>
          <p>从会议、周报到需求评审，AI 会引用你的会议记忆与资料库。</p>
          <div className="hero-actions">
            <Button variant="primary" onClick={() => onOpenView('compose')}>
              开始新任务
            </Button>
            <Button variant="ghost" onClick={() => onOpenView('library')}>
              查看会议记忆
            </Button>
          </div>
        </div>
        <div className="hero-stat">
          <span className="eyebrow">Memory Pulse</span>
          <strong>
            {memoryCount}
            <small>条可复用记忆</small>
          </strong>
          <div className="hero-stat-badges">
            <Badge tone={ragActive ? 'success' : 'neutral'}>{ragActive ? 'RAG 已启用' : 'RAG 未启用'}</Badge>
            <Badge tone="bloom">{meetingCount} 场会议已引用</Badge>
          </div>
        </div>
      </div>

      <div className="skill-grid">
        {skillCards.map((skill) => {
          const tone = SKILL_TONE[skill.id];
          const title = skill.title.replace(' Skill', '');
          return (
            <article className="skill-card" key={skill.id}>
              <div className="skill-card-head">
                <span className={`tone-dot ${tone.dot}`} />
                <h3>{title}</h3>
              </div>
              <p>{skill.scene}</p>
              <Badge tone={tone.badge} style={{ alignSelf: 'flex-start' }}>
                {tone.tag}
              </Badge>
              <div className="skill-card-foot">
                <span>继续使用</span>
                <button
                  type="button"
                  className="row-arrow"
                  aria-label={`进入${title}`}
                  onClick={() => onOpenView(skill.view)}
                >
                  <ArrowRight size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div>
        <div className="section-label" style={{ marginBottom: 12 }}>
          工作区概览
        </div>
        <div className="overview-grid">
          <StatTile value={outputCount} label="办公输出" onClick={() => onOpenView('outputs')} />
          <StatTile value={meetingCount} label="会议记忆" onClick={() => onOpenView('library')} />
          <StatTile value={knowledgeCount} label="RAG 文档" onClick={() => onOpenView('rag')} />
          <StatTile value={memoryCount} label="长期记忆" onClick={() => onOpenView('library')} />
        </div>
      </div>

      <div className="workbench-columns">
        <SectionCard
          title="最近输出"
          actions={
            <Button variant="ghost" size="sm" iconRight={<ArrowRight size={15} />} onClick={() => onOpenView('outputs')}>
              全部
            </Button>
          }
        >
          {visibleOutputs.length > 0 ? (
            <div className="recent-list">
              {visibleOutputs.map((output) => {
                const tone = SKILL_TONE[output.skill_id];
                return (
                  <button
                    type="button"
                    className="recent-row"
                    key={output.id}
                    onClick={() => onOpenView('outputs')}
                  >
                    <Badge tone={tone?.badge ?? 'neutral'}>{skillName(output.skill_id)}</Badge>
                    <strong>{output.title}</strong>
                    <time>{relativeTime(output.updated_at)}</time>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <h3>还没有办公输出</h3>
              <p>生成并保存周报或评审后会显示在这里。</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="记忆状态" caption="会议信息正在持续沉淀">
          <div className="note-panel mint">
            <strong>{ragActive ? '知识引用正常' : '知识库待启用'}</strong>
            <span>{ragActive ? `已启用 RAG，共 ${knowledgeCount} 份资料可被引用。` : '在 RAG 资料库中新建文档即可启用引用。'}</span>
          </div>
          <div className="pending-feedback">
            <div>
              <strong>{feedbackCount}</strong>
              <span>反馈工单</span>
            </div>
            <Button variant="secondary" size="sm" iconLeft={<ClipboardList size={15} />} onClick={() => onOpenView('feedback')}>
              查看工单
            </Button>
          </div>
          <div className="chip-row">
            <span className="chip" role="presentation">
              <Mic size={14} /> 会议 {meetingCount}
            </span>
            <span className="chip" role="presentation">
              <ShieldCheck size={14} /> 待办 {actionCount}
            </span>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
