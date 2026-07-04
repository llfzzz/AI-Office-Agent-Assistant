import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  ListTodo,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { Alert, Tag } from '../freejoy';
import { ListBlock } from './ListBlock';
import type {
  ActionItem,
  AnalysisResult,
  Decision,
  LongTermMemory,
  OpenQuestion,
  Risk,
} from '../types';

export function ResultPanel({ analysis }: { analysis: AnalysisResult | null }) {
  if (!analysis) {
    return (
      <div className="panel result-panel empty-result">
        <Bot size={28} />
        <h2>等待生成</h2>
        <p>结构化纪要、风险、自检和长期记忆会显示在这里。</p>
      </div>
    );
  }

  const minutes = analysis.structured_minutes;

  return (
    <div className="panel result-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">纪要结果</span>
          <h2>{minutes.one_sentence_summary}</h2>
        </div>
      </div>

      {analysis.warnings.length > 0 && (
        <Alert tone="warn" icon={<AlertTriangle size={17} />}>
          {analysis.warnings[0]}
        </Alert>
      )}

      {analysis.rag && (
        <div className="rag-result">
          <Database size={16} />
          {analysis.rag.enabled
            ? `RAG 已启用：引用 ${analysis.rag.sources.length} 段资料库上下文`
            : 'RAG 未启用'}
        </div>
      )}

      <div className="summary-block">
        <p>{minutes.summary}</p>
      </div>

      <div className="result-grid">
        <ListBlock
          title="关键决策"
          icon={<CheckCircle2 size={18} />}
          tone="mint"
          items={minutes.decisions}
          render={(item: Decision) => (
            <>
              <strong>{item.decision}</strong>
              <span>{item.evidence}</span>
            </>
          )}
        />
        <ListBlock
          title="待办事项"
          icon={<ListTodo size={18} />}
          tone="sky"
          items={minutes.action_items}
          render={(item: ActionItem) => (
            <>
              <strong>{item.task}</strong>
              <span>
                {item.owner} / {item.deadline} / {item.priority}
              </span>
            </>
          )}
        />
        <ListBlock
          title="风险点"
          icon={<AlertTriangle size={18} />}
          tone="peach"
          items={minutes.risks}
          render={(item: Risk) => (
            <>
              <strong>{item.risk}</strong>
              <span>{item.suggestion}</span>
            </>
          )}
        />
        <ListBlock
          title="未解决问题"
          icon={<MessageSquare size={18} />}
          tone="rose"
          items={minutes.open_questions}
          render={(item: OpenQuestion) => (
            <>
              <strong>{item.question}</strong>
              <span>{item.why_it_matters}</span>
            </>
          )}
        />
      </div>

      <div className="memory-strip">
        <div>
          <span className="eyebrow">长期记忆</span>
          <div className="chip-row">
            {minutes.long_term_memory.map((item: LongTermMemory) => (
              <Tag accent="bloom" key={`${item.category}-${item.memory}`}>
                {item.category} · {item.memory}
              </Tag>
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow">关键词</span>
          <div className="chip-row">
            {minutes.keywords.map((keyword) => (
              <Tag accent="sun" key={keyword}>
                {keyword}
              </Tag>
            ))}
          </div>
        </div>
      </div>

      <div className="quality-check">
        <ShieldCheck size={18} />
        <span>
          自检：{analysis.quality_check.has_hallucination ? '存在疑点' : '未发现明显幻觉'}
        </span>
      </div>
    </div>
  );
}
