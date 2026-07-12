import { Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Switch, Textarea } from '../freejoy';
import { SectionCard } from '../components/SectionCard';
import type { KnowledgeDocument } from '../types';

type RagPanelProps = {
  enabled: boolean;
  documents: KnowledgeDocument[];
  selectedDocumentId: string;
  title: string;
  content: string;
  isSaving: boolean;
  isDeleting: boolean;
  onEnabled: (enabled: boolean) => void;
  onSelectDocument: (document: KnowledgeDocument) => void;
  onNewDocument: () => void;
  onTitle: (value: string) => void;
  onContent: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
};

function estimateChunks(content: string) {
  return Math.max(1, Math.ceil(content.trim().length / 220));
}

export function RagView({
  enabled,
  documents,
  selectedDocumentId,
  title,
  content,
  isSaving,
  isDeleting,
  onEnabled,
  onSelectDocument,
  onNewDocument,
  onTitle,
  onContent,
  onSave,
  onDelete,
}: RagPanelProps) {
  const canEnable = documents.length > 0;
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId);
  const active = enabled && canEnable;

  return (
    <>
      <div className="rag-status-bar">
        <span className={active ? 'tone-dot mint' : 'tone-dot neutral'} />
        <strong>{active ? '知识库已启用' : '知识库未启用'}</strong>
        <Badge tone={canEnable ? 'success' : 'neutral'}>{documents.length} 份资料</Badge>
        <span className="spacer" />
        <span className="switch-label">所有 Skill 默认可引用</span>
        <Switch checked={active} disabled={!canEnable} onChange={(checked) => onEnabled(checked)} />
      </div>

      <div className="rag-columns">
        <SectionCard title="知识文档" caption="搜索、筛选并管理可引用内容">
          <Input iconLeft={<Search size={16} />} placeholder="搜索资料" readOnly value="" onChange={() => {}} />
          <Button full iconLeft={<Plus size={16} />} onClick={onNewDocument}>
            新建文档
          </Button>
          {documents.length === 0 ? (
            <div className="empty-state">
              <h3>还没有资料</h3>
              <p>新建文档后即可被 Skill 引用。</p>
            </div>
          ) : (
            <div className="doc-list">
              {documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  className={document.id === selectedDocumentId ? 'doc-row active' : 'doc-row'}
                  onClick={() => onSelectDocument(document)}
                >
                  <span className={document.id === selectedDocumentId ? 'tone-dot coral' : 'tone-dot sky'} />
                  <div className="doc-copy">
                    <strong>{document.title}</strong>
                    <span>{estimateChunks(document.content)} 个片段</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="编辑文档"
          caption={selectedDocument ? '正在编辑已保存资料 · 已启用' : '正在新建资料'}
        >
          <Input
            label="标题"
            value={title}
            onChange={(event) => onTitle(event.target.value)}
            placeholder="例如：产品定位与用户场景"
          />
          <Textarea
            label="内容"
            rows={9}
            value={content}
            onChange={(event) => onContent(event.target.value)}
            placeholder="粘贴项目背景、业务规则、术语表或协作约定。保存后才能启用 RAG。"
          />
          <div className="editor-meta-row">
            <Badge tone="bloom">自动分段 · {estimateChunks(content)}</Badge>
            {selectedDocument && (
              <span className="chip">最近更新 · {new Date(selectedDocument.updated_at).toLocaleDateString()}</span>
            )}
          </div>

          <div className="page-card-foot">
            <Button
              variant="ghost"
              onClick={onDelete}
              disabled={!selectedDocumentId || isDeleting}
              iconLeft={isDeleting ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
            >
              删除文档
            </Button>
            <Button
              onClick={onSave}
              disabled={isSaving || !content.trim()}
              iconLeft={isSaving ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
              style={{ marginLeft: 'auto' }}
            >
              {selectedDocumentId ? '更新并启用' : '保存并启用'}
            </Button>
          </div>

          <div className="note-panel mint">
            <span>保存后将自动进入会议、周报和 PRD 的引用范围。</span>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
