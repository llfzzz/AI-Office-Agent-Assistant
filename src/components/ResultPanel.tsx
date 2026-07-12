import { AlertTriangle, Database } from 'lucide-react';
import { Alert, Tag } from '../freejoy';
import { SectionCard } from './SectionCard';
import { TintPanel } from '../ui';
import type { AnalysisResult } from '../types';

export function ResultPanel({ analysis }: { analysis: AnalysisResult | null }) {
  if (!analysis) {
    return (
      <SectionCard title="结构化会议纪要">
        <div className="empty-state">
          <h3>等待生成</h3>
          <p>结构化纪要、风险、自检和长期记忆会显示在这里。</p>
        </div>
      </SectionCard>
    );
  }

  const minutes = analysis.structured_minutes;
  const generatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const ragCount = analysis.rag?.enabled ? analysis.rag.sources.length : 0;

  return (
    <SectionCard
      title="结构化会议纪要"
      caption={`生成于今天 ${generatedAt}${ragCount ? ` · AI 已引用 ${ragCount} 份资料` : ''}`}
    >
      {analysis.warnings.length > 0 && (
        <Alert tone="warn" icon={<AlertTriangle size={17} />}>
          {analysis.warnings[0]}
        </Alert>
      )}

      <TintPanel tone="peach" title="会议摘要">
        <p>{minutes.summary || minutes.one_sentence_summary}</p>
      </TintPanel>

      <TintPanel tone="sky" title="关键决策" index={1}>
        {minutes.decisions.length === 0 ? (
          <p className="list-empty">未提及</p>
        ) : (
          minutes.decisions.map((item, index) => (
            <div key={index}>
              <strong>{item.decision}</strong>
              {item.evidence && <div className="mono-line">{item.evidence}</div>}
            </div>
          ))
        )}
      </TintPanel>

      <TintPanel tone="mint" title="待办事项" index={2}>
        {minutes.action_items.length === 0 ? (
          <p className="list-empty">未提及</p>
        ) : (
          minutes.action_items.map((item, index) => (
            <div key={index}>
              <strong>{item.task}</strong>
              <div className="mono-line">
                {[item.owner, item.deadline, item.priority].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))
        )}
      </TintPanel>

      <TintPanel tone="rose" title="风险与问题" index={3}>
        {minutes.risks.length === 0 && minutes.open_questions.length === 0 ? (
          <p className="list-empty">未提及</p>
        ) : (
          <>
            {minutes.risks.map((item, index) => (
              <div key={`risk-${index}`}>
                <strong>{item.risk}</strong>
                {item.suggestion && <div className="mono-line">{item.suggestion}</div>}
              </div>
            ))}
            {minutes.open_questions.map((item, index) => (
              <div key={`q-${index}`}>
                <strong>{item.question}</strong>
                {item.why_it_matters && <div className="mono-line">{item.why_it_matters}</div>}
              </div>
            ))}
          </>
        )}
      </TintPanel>

      <TintPanel tone="lavender" title="长期记忆" index={4}>
        {minutes.long_term_memory.length === 0 ? (
          <p className="list-empty">输出需保留来源、决策、待办与自检信息</p>
        ) : (
          <div className="chip-row">
            {minutes.long_term_memory.map((item) => (
              <Tag accent="bloom" key={`${item.category}-${item.memory}`}>
                {item.category} · {item.memory}
              </Tag>
            ))}
          </div>
        )}
      </TintPanel>

      {minutes.keywords.length > 0 && (
        <div>
          <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
            关键词
          </span>
          <div className="chip-row">
            {minutes.keywords.map((keyword) => (
              <span className="chip" key={keyword}>
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.rag && (
        <div className="mono-line" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Database size={14} />
          {analysis.rag.enabled ? `RAG 已启用：引用 ${ragCount} 段资料库上下文` : 'RAG 未启用'}
        </div>
      )}
    </SectionCard>
  );
}
