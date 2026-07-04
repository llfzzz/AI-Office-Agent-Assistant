export function ProductDocsView() {
  return (
    <section className="office-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">产品资料</span>
          <h1>AI Office Agent Assistant 说明书</h1>
          <p>把原 AI Meeting Memory Assistant 升级为多 Skill 办公 Agent 原型，保留会议能力并增加周报、需求评审和反馈迭代闭环。</p>
        </div>
      </div>
      <div className="docs-grid">
        <section className="panel docs-panel">
          <h2>Skill 产品说明</h2>
          <p>会议纪要 Skill 复用原会议分析链路；周报生成 Skill 面向工作记录归纳；需求评审 Skill 面向 PRD 草稿和验收标准准备。</p>
        </section>
        <section className="panel docs-panel">
          <h2>用户操作教程</h2>
          <ol>
            <li>在 Skill 工作台选择任务。</li>
            <li>输入材料，可选启用 RAG 资料库或引用会议记录。</li>
            <li>运行后检查 Agent Plan、结构化输出和质量自检。</li>
            <li>保存输出，并在输出记录中提交反馈。</li>
          </ol>
        </section>
        <section className="panel docs-panel">
          <h2>演示素材</h2>
          <p>演示时可按“会议纪要到周报生成、需求评审、输出反馈、迭代清单”展示办公 Agent 的任务拆解与闭环能力。</p>
        </section>
      </div>
    </section>
  );
}
