import { ArrowRight } from 'lucide-react';
import { Button } from '../freejoy';
import { SectionCard } from '../components/SectionCard';
import { AppLogo } from '../components/primitives';
import { skillCards } from '../data/constants';
import type { SkillId, View } from '../types';

const SKILL_DOT: Record<SkillId, string> = {
  meeting_minutes: 'coral',
  weekly_report: 'sun',
  prd_review: 'bloom',
};

const WORKFLOW = [
  { title: '准备材料', desc: '标题、人员、正文与附件' },
  { title: '生成结果', desc: 'AI 结构化并显示引用来源' },
  { title: '检查保存', desc: '确认自检与风险后入库' },
  { title: '问题反馈', desc: '结果下方可直接提交反馈工单' },
];

const STATUS = [
  { dot: 'sky', title: '体验模式', desc: '未配置 Key 时使用内置示例结果' },
  { dot: 'sun', title: '附件受限', desc: '图片与音频转写依赖服务商能力' },
  { dot: 'bloom', title: 'RAG 未命中', desc: '补充更明确的资料标题与内容' },
  { dot: 'rose', title: 'AI 验证失败', desc: '检查服务商、模型和 API Key' },
];

export function ProductDocsView({ onOpenView }: { onOpenView: (view: View) => void }) {
  return (
    <>
      <div className="hero-soft">
        <div className="hero-soft-copy">
          <span className="eyebrow">Product Guide</span>
          <h2>从第一次生成，到建立可复用的办公记忆。</h2>
          <p>按任务选择 Skill，检查引用来源，然后把结果保存到记录与记忆中。</p>
          <Button onClick={() => onOpenView('compose')}>查看快速开始</Button>
        </div>
        <div className="hero-soft-side">
          <div className="brand-mark">
            <AppLogo size={22} strokeWidth={2.1} />
          </div>
          <div className="hero-soft-side-copy">
            <strong>4 步完成</strong>
            <span>输入 → 生成</span>
            <span>检查 → 保存</span>
          </div>
        </div>
      </div>

      <div>
        <div className="section-label" style={{ marginBottom: 12 }}>
          选择你的工作场景
        </div>
        <div className="scenario-grid">
          {skillCards.map((skill) => (
            <article className="skill-card" key={skill.id}>
              <div className="skill-card-head">
                <span className={`tone-dot ${SKILL_DOT[skill.id]}`} />
                <h3>{skill.title.replace(' Skill', '')}</h3>
              </div>
              <p>{skill.scene}</p>
              <div className="skill-card-foot">
                <span>查看操作说明</span>
                <button
                  type="button"
                  className="row-arrow"
                  aria-label={`进入${skill.title.replace(' Skill', '')}`}
                  onClick={() => onOpenView(skill.view)}
                >
                  <ArrowRight size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="docs-columns">
        <SectionCard title="推荐工作流">
          <div className="workflow-steps">
            {WORKFLOW.map((step, index) => (
              <div className="workflow-step" key={step.title}>
                <span className="step-num">{String(index + 1).padStart(2, '0')}</span>
                <div className="workflow-step-copy">
                  <strong>{step.title}</strong>
                  <span>{step.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="帮助与状态">
          <div className="status-list">
            {STATUS.map((status) => (
              <div className="status-row" key={status.title}>
                <span className={`tone-dot ${status.dot}`} />
                <div className="status-row-copy">
                  <strong>{status.title}</strong>
                  <span>{status.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="note-panel mint">
            <span>遇到 AI 验证失败时，先在 AI 连接设置中重新验证默认配置。</span>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
