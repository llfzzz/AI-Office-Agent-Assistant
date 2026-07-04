import {
  ArrowRight,
  Bot,
  ChevronRight,
  ClipboardList,
  Database,
  FilePlus2,
  Library,
  Mic,
  ShieldCheck,
} from 'lucide-react';
import { Badge, Button, Card } from '../freejoy';
import { Metric } from '../components/primitives';
import { skillCards } from '../data/constants';
import { skillName } from '../lib/office';
import type { OfficeOutputRecord, View } from '../types';

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

  return (
    <section className="office-page">
      <div className="workspace-title">
        <div>
          <h1>Skill 工作台</h1>
          <p>选择合适的技能，AI 智能体将为你高效处理办公任务。</p>
        </div>
        <div className="workspace-stats">
          <Metric label="会议记忆" value={meetingCount} />
          <Metric label="办公输出" value={outputCount} />
          <Metric label="反馈记录" value={feedbackCount} />
        </div>
      </div>

      <div className="workbench-layout">
        <div className="workbench-main">
          <div className="section-heading-row">
            <h2>我的技能</h2>
            <Button variant="secondary" size="sm" iconLeft={<FilePlus2 size={16} />} onClick={() => onOpenView('docs')}>
              添加技能
            </Button>
          </div>

          <div className="skill-grid">
            {skillCards.map((skill) => (
              <Card
                interactive
                key={skill.id}
                className={`skill-card ${skill.tone}`}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <div className="skill-card-top">
                  <span className="skill-icon">
                    {skill.id === 'meeting_minutes' && <Mic size={20} />}
                    {skill.id === 'weekly_report' && <ClipboardList size={20} />}
                    {skill.id === 'prd_review' && <ShieldCheck size={20} />}
                  </span>
                  <button
                    type="button"
                    className="skill-card-arrow"
                    aria-label={`进入${skill.title}`}
                    onClick={() => onOpenView(skill.view)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="skill-card-copy">
                  <h2>{skill.title.replace(' Skill', '')}</h2>
                  <p>{skill.scene}</p>
                </div>
                <dl className="skill-meta">
                  <div>
                    <dt>输入</dt>
                    <dd>{skill.inputs}</dd>
                  </div>
                  <div>
                    <dt>输出</dt>
                    <dd>{skill.outputs}</dd>
                  </div>
                </dl>
                <div className="skill-card-footer">
                  <Badge tone={skill.tone === 'meeting' ? 'accent' : skill.tone === 'weekly' ? 'success' : 'bloom'}>
                    使用中
                  </Badge>
                  <span>适合：{skill.users}</span>
                </div>
              </Card>
            ))}
          </div>

          <div className="workbench-metrics">
            <Metric label="待办事项" value={actionCount} />
            <Metric label="长期记忆" value={memoryCount} />
            <Metric label="知识条目" value={knowledgeCount} />
            <Metric label="反馈记录" value={feedbackCount} />
          </div>

          <div className="quick-entry-grid">
            <Button variant="secondary" iconLeft={<Mic size={17} />} onClick={() => onOpenView('compose')}>
              新建会议纪要
            </Button>
            <Button variant="secondary" iconLeft={<ClipboardList size={17} />} onClick={() => onOpenView('weekly')}>
              生成周报
            </Button>
            <Button variant="secondary" iconLeft={<ShieldCheck size={17} />} onClick={() => onOpenView('prd')}>
              需求评审
            </Button>
            <Button variant="secondary" iconLeft={<Database size={17} />} onClick={() => onOpenView('rag')}>
              上传资料
            </Button>
          </div>
        </div>

        <aside className="workbench-side">
          <Card className="recent-output-card" padding="18px">
            <div className="side-card-head">
              <h2>最近输出</h2>
              <button type="button" onClick={() => onOpenView('outputs')}>
                全部 <ChevronRight size={14} />
              </button>
            </div>
            {visibleOutputs.length > 0 ? (
              <div className="recent-output-list">
                {visibleOutputs.map((output) => (
                  <button
                    type="button"
                    className="recent-output-row"
                    key={output.id}
                    onClick={() => onOpenView('outputs')}
                  >
                    <span className="recent-output-icon">
                      {output.skill_id === 'weekly_report' ? <ClipboardList size={16} /> : output.skill_id === 'prd_review' ? <ShieldCheck size={16} /> : <Mic size={16} />}
                    </span>
                    <span>
                      <strong>{output.title}</strong>
                      <small>{skillName(output.skill_id)} · {new Date(output.updated_at).toLocaleString()}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="side-empty-state">
                <Bot size={22} />
                <p>保存办公输出后会在这里显示。</p>
              </div>
            )}
          </Card>

          <Card className="memory-status-card" padding="18px">
            <div className="side-card-head">
              <h2>记忆状态</h2>
              <Badge tone={ragEnabled && knowledgeCount > 0 ? 'success' : 'neutral'}>
                {ragEnabled && knowledgeCount > 0 ? '正常' : '待启用'}
              </Badge>
            </div>
            <button type="button" className="memory-status-row" onClick={() => onOpenView('library')}>
              <Library size={18} />
              <span>会议记忆</span>
              <strong>{meetingCount}</strong>
              <ChevronRight size={14} />
            </button>
            <button type="button" className="memory-status-row" onClick={() => onOpenView('rag')}>
              <Database size={18} />
              <span>知识库（RAG）</span>
              <strong>{knowledgeCount}</strong>
              <ChevronRight size={14} />
            </button>
            <small>更新时间：当前会话</small>
          </Card>

          <Card className="feedback-nudge-card" padding="18px">
            <div>
              <h2>反馈与优化</h2>
              <p>帮助我们改进，让智能体更懂你。</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onOpenView('feedback')}>
              去反馈 <ArrowRight size={15} />
            </Button>
          </Card>
        </aside>
      </div>
    </section>
  );
}
