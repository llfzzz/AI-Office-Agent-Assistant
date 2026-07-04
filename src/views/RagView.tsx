import { Database, FilePlus2, Loader2, Settings2, Trash2 } from 'lucide-react';
import { Button, Input, Switch, Textarea } from '../freejoy';
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

export function RagView(props: RagPanelProps) {
  return (
    <section className="rag-page">
      <RagPanel {...props} />
    </section>
  );
}

function RagPanel({
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
  const selectedLabel = selectedDocument ? '正在编辑已保存资料库' : '正在新建资料库';

  return (
    <div className="panel rag-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">RAG 资料库</span>
          <h2>生成时可选增强</h2>
        </div>
        <Switch
          checked={enabled && canEnable}
          disabled={!canEnable}
          onChange={(checked) => onEnabled(checked)}
          label={enabled && canEnable ? '已启用' : '关闭'}
        />
      </div>

      <div className="rag-management">
        <aside className="rag-document-list" aria-label="已保存资料库">
          <div className="rag-list-header">
            <span>已保存资料</span>
            <button type="button" className="rag-new-button" onClick={onNewDocument}>
              <FilePlus2 size={16} />
              新建
            </button>
          </div>

          {documents.length > 0 ? (
            <div className="rag-doc-items">
              {documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  className={document.id === selectedDocumentId ? 'rag-doc-button active' : 'rag-doc-button'}
                  onClick={() => onSelectDocument(document)}
                >
                  <strong>{document.title}</strong>
                  <span>
                    {document.content.length} 字 · {new Date(document.updated_at).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rag-empty-state">
              <Database size={22} />
              <span>还没有保存的资料库</span>
            </div>
          )}
        </aside>

        <div className="rag-editor">
          <span className="rag-edit-state">{selectedLabel}</span>
          <div className="form-grid single">
            <Input
              label="资料库名称"
              value={title}
              onChange={(event) => onTitle(event.target.value)}
              placeholder="例如：产品背景资料"
            />
            <Textarea
              label="资料库内容"
              rows={6}
              value={content}
              onChange={(event) => onContent(event.target.value)}
              placeholder="粘贴项目背景、业务规则、术语表或协作约定。保存后才能启用 RAG。"
            />
          </div>

          <div className="button-row tight rag-editor-actions">
            <div className="rag-primary-actions">
              <Button
                variant="secondary"
                onClick={onSave}
                disabled={isSaving || !content.trim()}
                iconLeft={isSaving ? <Loader2 className="spin" size={17} /> : <Settings2 size={17} />}
              >
                {selectedDocumentId ? '更新资料库' : '保存资料库'}
              </Button>
              <Button
                variant="danger"
                onClick={onDelete}
                disabled={!selectedDocumentId || isDeleting}
                iconLeft={isDeleting ? <Loader2 className="spin" size={17} /> : <Trash2 size={17} />}
              >
                删除
              </Button>
            </div>
            <span className="rag-hint">{canEnable ? `${documents.length} 个资料库可用` : '默认关闭，保存资料库后可启用'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
