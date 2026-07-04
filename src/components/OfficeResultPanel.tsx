import { Bot } from 'lucide-react';
import { OfficeOutputPreview } from './OfficeOutputPreview';
import type { OfficeRunResult } from '../types';

export function OfficeResultPanel({ result, emptyTitle }: { result: OfficeRunResult | null; emptyTitle: string }) {
  if (!result) {
    return (
      <div className="panel result-panel empty-result">
        <Bot size={28} />
        <h2>{emptyTitle}</h2>
        <p>生成后的周报或评审材料会显示在这里。</p>
      </div>
    );
  }

  return (
    <div className="office-result-stack">
      <OfficeOutputPreview output={result.skill_output} skillId={result.agent_plan.selected_skill} />
    </div>
  );
}
