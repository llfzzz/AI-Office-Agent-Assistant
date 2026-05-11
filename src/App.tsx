import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  History,
  Library,
  ListTodo,
  LogOut,
  Loader2,
  Mic,
  MicOff,
  MessageSquare,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tags,
  Upload,
  UserPlus,
  UserRound,
  Wand2,
} from 'lucide-react';
import {
  analyzeMeeting,
  askMeeting,
  clearStoredToken,
  getHealth,
  getCurrentUser,
  getMeeting,
  loginUser,
  listKnowledgeDocuments,
  listMeetings,
  listOfficeFeedback,
  listOfficeOutputs,
  registerUser,
  saveKnowledgeDocument,
  saveMeeting,
  saveOfficeOutput,
  storeToken,
  runOfficeSkill,
  submitOfficeFeedback,
  transcribeAudio,
} from './api';
import './App.css';
import { meetingTypes, sampleMeeting } from './sample';
import type {
  ActionItem,
  AnalysisResult,
  AuthSession,
  Decision,
  HealthResponse,
  KnowledgeDocument,
  LongTermMemory,
  MeetingInput,
  MeetingRecord,
  OpenQuestion,
  OfficeFeedbackInput,
  OfficeFeedbackRecord,
  OfficeOutputRecord,
  OfficeRunResult,
  OfficeTaskInput,
  PrdReviewOutput,
  Risk,
  SkillId,
  StructuredMinutes,
  WeeklyReportOutput,
} from './types';

type View =
  | 'home'
  | 'skills'
  | 'compose'
  | 'weekly'
  | 'prd'
  | 'library'
  | 'detail'
  | 'rag'
  | 'outputs'
  | 'feedback'
  | 'docs';
type AuthMode = 'login' | 'register';

const blankForm: MeetingInput = {
  title: '',
  date: new Date().toISOString().slice(0, 10),
  meeting_type: '自动识别',
  participants: '',
  raw_transcript: '',
};

const blankWeeklyTask: OfficeTaskInput = {
  skill_id: 'weekly_report',
  title: '本周工作周报',
  date: '',
  content: '',
  metadata: {
    period: '',
    next_plan: '',
  },
  rag: { enabled: false },
  linked_meeting_ids: [],
};

const blankPrdTask: OfficeTaskInput = {
  skill_id: 'prd_review',
  title: '新功能需求评审',
  content: '',
  metadata: {
    feature_name: '',
    target_user: '',
    feedback: '',
    business_context: '',
    constraints: '',
  },
  rag: { enabled: false },
  linked_meeting_ids: [],
};

const blankFeedbackForm: OfficeFeedbackInput = {
  accuracy_score: 4,
  copyability_score: 4,
  completeness_score: 4,
  needs_heavy_edit: false,
  missing_info: '',
  hallucination: '',
  suggestion: '',
};

const skillCards: Array<{
  id: SkillId;
  title: string;
  scene: string;
  inputs: string;
  outputs: string;
  users: string;
  risk: string;
  tone: 'meeting' | 'weekly' | 'prd';
  view: View;
}> = [
  {
    id: 'meeting_minutes',
    title: '会议纪要 Skill',
    scene: '把录音、音频或会议转写稿整理为可追踪的会议记忆。',
    inputs: '录音、音频文件、会议转写稿、参会人、会议类型',
    outputs: '摘要、决策、待办、风险、未解决问题、长期记忆',
    users: '产品、项目、研发协作会议记录者',
    risk: '决策和待办必须来自会议原文，不能由 RAG 背景替代。',
    tone: 'meeting',
    view: 'compose',
  },
  {
    id: 'weekly_report',
    title: '周报生成 Skill',
    scene: '把工作记录、会议结论和待办状态整理成结构化周报。',
    inputs: '工作记录、周期、引用会议、下周计划草稿',
    outputs: '本周总结、完成事项、关键进展、风险、下周计划',
    users: '实习生、项目成员、需要复盘进展的协作者',
    risk: '不能把计划写成已完成，缺少结果时需要标记为建议。',
    tone: 'weekly',
    view: 'weekly',
  },
  {
    id: 'prd_review',
    title: '需求评审 Skill',
    scene: '把功能想法、用户反馈和背景资料整理为可评审 PRD 草稿。',
    inputs: '功能想法、目标用户、反馈痛点、业务背景、约束条件',
    outputs: '需求背景、痛点、范围、验收标准、研发/测试关注点',
    users: '产品实习生、业务分析、需求评审准备者',
    risk: '缺少用户反馈时必须提示补充，不能编造痛点和数据。',
    tone: 'prd',
    view: 'prd',
  },
];

function App() {
  const [activeView, setActiveView] = useState<View>('skills');
  const [form, setForm] = useState<MeetingInput>(blankForm);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [question, setQuestion] = useState('');
  const [ragEnabled, setRagEnabled] = useState(false);
  const [knowledgeTitle, setKnowledgeTitle] = useState('默认会议资料库');
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [weeklyTask, setWeeklyTask] = useState<OfficeTaskInput>(blankWeeklyTask);
  const [prdTask, setPrdTask] = useState<OfficeTaskInput>(blankPrdTask);
  const [officeResult, setOfficeResult] = useState<OfficeRunResult | null>(null);
  const [lastOfficeInput, setLastOfficeInput] = useState<OfficeTaskInput | null>(null);
  const [officeOutputs, setOfficeOutputs] = useState<OfficeOutputRecord[]>([]);
  const [officeFeedback, setOfficeFeedback] = useState<OfficeFeedbackRecord[]>([]);
  const [selectedOfficeOutputId, setSelectedOfficeOutputId] = useState('');
  const [feedbackForm, setFeedbackForm] = useState<OfficeFeedbackInput>(blankFeedbackForm);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false);
  const [isRunningOffice, setIsRunningOffice] = useState(false);
  const [isSavingOfficeOutput, setIsSavingOfficeOutput] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [officeListLoading, setOfficeListLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => {
        setHealth(null);
      });

    getCurrentUser()
      .then((payload) => {
        storeToken(payload.token);
        setSession(payload);
      })
      .catch(() => {
        clearStoredToken();
        setSession(null);
      })
      .finally(() => {
        setIsRestoringSession(false);
      });
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    listKnowledgeDocuments()
      .then((payload) => {
        setKnowledgeDocuments(payload.documents);
        const firstDocument = payload.documents[0];
        if (firstDocument) {
          setKnowledgeTitle(firstDocument.title);
          setKnowledgeContent(firstDocument.content);
        }
      })
      .catch((err) => {
        setKnowledgeDocuments([]);
        setError(err instanceof Error ? err.message : '读取 RAG 资料库失败');
      });
  }, [session]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    listMeetings({ search, type: typeFilter })
      .then((payload) => {
        if (cancelled) return;
        setMeetings(payload.meetings);
        setSelectedMeetingId((current) => current || payload.meetings[0]?.id || '');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '读取记忆库失败');
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, session, typeFilter]);

  useEffect(() => {
    if (!session || !['outputs', 'feedback'].includes(activeView)) return;

    let cancelled = false;

    Promise.all([listOfficeOutputs(), listOfficeFeedback()])
      .then(([outputsPayload, feedbackPayload]) => {
        if (cancelled) return;
        setOfficeOutputs(outputsPayload.outputs);
        setOfficeFeedback(feedbackPayload.feedback);
        setSelectedOfficeOutputId((current) => current || outputsPayload.outputs[0]?.id || '');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? `${err.message}。如果是首次升级，请先运行 npm run pb:migrate。` : '读取办公输出失败');
      })
      .finally(() => {
        if (!cancelled) setOfficeListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeView, session]);

  const selectedMeeting = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedMeetingId) || null,
    [meetings, selectedMeetingId],
  );

  const selectedOfficeOutput = useMemo(
    () => officeOutputs.find((output) => output.id === selectedOfficeOutputId) || null,
    [officeOutputs, selectedOfficeOutputId],
  );

  const stats = useMemo(() => {
    const actionCount = meetings.reduce(
      (total, meeting) => total + (meeting.analysis?.structured_minutes?.action_items?.length || 0),
      0,
    );
    const memoryCount = meetings.reduce(
      (total, meeting) => total + (meeting.analysis?.structured_minutes?.long_term_memory?.length || 0),
      0,
    );

    return {
      meetings: meetings.length,
      actions: actionCount,
      memories: memoryCount,
      outputs: officeOutputs.length,
      feedback: officeFeedback.length,
    };
  }, [meetings, officeFeedback.length, officeOutputs.length]);

  async function handleAnalyze() {
    setError('');
    if (activeView === 'home') {
      setActiveView('compose');
    }

    if (!form.raw_transcript.trim()) {
      setError('请先录音、上传音频或输入会议文本。');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await analyzeMeeting({
        ...form,
        rag: { enabled: ragEnabled && knowledgeDocuments.length > 0 },
      });
      setAnalysis(result);
      setActiveView('compose');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleTranscribe(file: Blob, fileName?: string) {
    setError('');
    setActiveView('compose');
    setIsTranscribing(true);

    try {
      const result = await transcribeAudio(file, { fileName });
      setForm((current) => ({
        ...current,
        raw_transcript: [current.raw_transcript.trim(), result.text.trim()].filter(Boolean).join('\n\n'),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '转写失败');
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleSaveKnowledge() {
    setError('');
    setIsSavingKnowledge(true);

    try {
      const payload = await saveKnowledgeDocument({
        id: knowledgeDocuments[0]?.id,
        title: knowledgeTitle,
        content: knowledgeContent,
      });
      setKnowledgeDocuments([payload.document]);
      setKnowledgeTitle(payload.document.title);
      setKnowledgeContent(payload.document.content);
      setRagEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存资料库失败');
    } finally {
      setIsSavingKnowledge(false);
    }
  }

  async function handleSave() {
    if (!analysis) return;

    setError('');
    setIsSaving(true);
    try {
      const payload = await saveMeeting(form, analysis);
      setMeetings((current) => [
        payload.meeting,
        ...current.filter((meeting) => meeting.id !== payload.meeting.id),
      ]);
      setSelectedMeetingId(payload.meeting.id);
      setActiveView('detail');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRunOffice(input: OfficeTaskInput) {
    setError('');

    if (!input.content.trim()) {
      setError(input.skill_id === 'weekly_report' ? '请先输入本周工作记录。' : '请先输入功能想法或需求材料。');
      return;
    }

    const runnableInput = {
      ...input,
      rag: { enabled: ragEnabled && knowledgeDocuments.length > 0 },
    };

    setIsRunningOffice(true);
    try {
      const result = await runOfficeSkill(runnableInput);
      setOfficeResult(result);
      setLastOfficeInput(runnableInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Office Skill 运行失败');
    } finally {
      setIsRunningOffice(false);
    }
  }

  async function handleSaveOfficeOutput() {
    if (!officeResult || !lastOfficeInput) return;

    setError('');
    setIsSavingOfficeOutput(true);
    try {
      const payload = await saveOfficeOutput(lastOfficeInput, officeResult);
      setOfficeOutputs((current) => [
        payload.output,
        ...current.filter((output) => output.id !== payload.output.id),
      ]);
      setSelectedOfficeOutputId(payload.output.id);
      setActiveView('outputs');
    } catch (err) {
      setError(err instanceof Error ? `${err.message}。如果是首次升级，请先运行 npm run pb:migrate。` : '保存办公输出失败');
    } finally {
      setIsSavingOfficeOutput(false);
    }
  }

  async function handleAsk() {
    if (!selectedMeeting || !question.trim()) return;

    setError('');
    setIsAsking(true);
    try {
      await askMeeting(selectedMeeting.id, question);
      const payload = await getMeeting(selectedMeeting.id);
      setMeetings((current) =>
        current.map((meeting) => (meeting.id === payload.meeting.id ? payload.meeting : meeting)),
      );
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '追问失败');
    } finally {
      setIsAsking(false);
    }
  }

  function selectMeeting(id: string) {
    setSelectedMeetingId(id);
    setActiveView('detail');
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsAuthLoading(true);

    try {
      const payload =
        authMode === 'login'
          ? await loginUser({ email: authForm.email, password: authForm.password })
          : await registerUser(authForm);
      storeToken(payload.token);
      setSession(payload);
      setActiveView('skills');
      setAuthForm({ email: '', password: '', name: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setIsAuthLoading(false);
    }
  }

  function handleLogout() {
    clearStoredToken();
    setSession(null);
    setMeetings([]);
    setKnowledgeDocuments([]);
    setOfficeOutputs([]);
    setOfficeFeedback([]);
    setSelectedMeetingId('');
    setSelectedOfficeOutputId('');
    setAnalysis(null);
    setOfficeResult(null);
    setLastOfficeInput(null);
    setActiveView('home');
  }

  async function handleSubmitOfficeFeedback() {
    if (!selectedOfficeOutput) return;

    setError('');
    setIsSubmittingFeedback(true);
    try {
      const payload = await submitOfficeFeedback(selectedOfficeOutput.id, feedbackForm);
      setOfficeFeedback((current) => [payload.feedback, ...current]);
      setFeedbackForm(blankFeedbackForm);
      setActiveView('feedback');
    } catch (err) {
      setError(err instanceof Error ? `${err.message}。如果是首次升级，请先运行 npm run pb:migrate。` : '提交反馈失败');
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  if (isRestoringSession) {
    return (
      <div className="auth-screen">
        <Loader2 className="spin" size={26} />
        <span>正在连接数据库账号</span>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthView
        mode={authMode}
        form={authForm}
        health={health}
        error={error}
        isLoading={isAuthLoading}
        onMode={setAuthMode}
        onForm={setAuthForm}
        onSubmit={handleAuth}
      />
    );
  }

  return (
    <div className={activeView === 'home' ? 'app-shell home-shell' : 'app-shell'}>
      {activeView !== 'home' && (
        <aside className="sidebar" aria-label="应用导航">
          <div className="brand">
            <div className="brand-mark">
              <Brain size={22} strokeWidth={2.2} />
            </div>
            <div>
              <strong>Office Agent</strong>
              <span>{session.user.name || session.user.email}</span>
            </div>
          </div>

          <nav className="nav-stack">
            <button
              type="button"
              className={activeView === 'skills' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('skills')}
            >
              <Sparkles size={18} />
              Skill 工作台
            </button>
            <button
              type="button"
              className={activeView === 'compose' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('compose')}
            >
              <Mic size={18} />
              会议纪要
            </button>
            <button
              type="button"
              className={activeView === 'weekly' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('weekly')}
            >
              <ClipboardList size={18} />
              周报生成
            </button>
            <button
              type="button"
              className={activeView === 'prd' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('prd')}
            >
              <ShieldCheck size={18} />
              需求评审
            </button>
            <button
              type="button"
              className={activeView === 'rag' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('rag')}
            >
              <Settings2 size={18} />
              RAG 资料库
            </button>
            <button
              type="button"
              className={activeView === 'outputs' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('outputs')}
            >
              <History size={18} />
              输出记录
            </button>
            <button
              type="button"
              className={activeView === 'feedback' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('feedback')}
            >
              <MessageSquare size={18} />
              反馈迭代
            </button>
            <button
              type="button"
              className={activeView === 'library' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('library')}
            >
              <Library size={18} />
              会议记忆库
            </button>
            <button
              type="button"
              className={activeView === 'detail' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('detail')}
              disabled={!selectedMeeting}
            >
              <MessageSquare size={18} />
              会议追问
            </button>
            <button
              type="button"
              className={activeView === 'docs' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView('docs')}
            >
              <Tags size={18} />
              产品资料
            </button>
          </nav>

          <div className="sidebar-panel">
            <span className="eyebrow">连接状态</span>
            <SourceBadge configured={Boolean(health?.provider.configured)} />
            <p>{health?.provider.configured ? health.provider.model : '未配置 API_KEY'}</p>
            <p>{health?.database?.ok ? `PocketBase：${health.database.url}` : 'PocketBase 未连接'}</p>
          </div>

          <div className="metric-grid">
            <Metric label="会议" value={stats.meetings} />
            <Metric label="输出" value={stats.outputs} />
            <Metric label="反馈" value={stats.feedback} />
          </div>

          <button type="button" className="nav-item logout-item" onClick={handleLogout}>
            <LogOut size={18} />
            退出登录
          </button>
        </aside>
      )}

      <main className={activeView === 'home' ? 'workspace home-workspace' : 'workspace'}>
        {activeView === 'home' && (
          <HomeView
            onStart={() => setActiveView('compose')}
            onLibrary={() => setActiveView('library')}
          />
        )}

        {activeView === 'skills' && (
          <SkillWorkbenchView
            meetingCount={stats.meetings}
            outputCount={stats.outputs}
            feedbackCount={stats.feedback}
            onOpenView={setActiveView}
          />
        )}

        {error && (
          <div className="notice error" role="alert">
            <AlertTriangle size={18} />
            {error}
          </div>
        )}

        {activeView === 'compose' && (
          <ComposeView
            form={form}
            analysis={analysis}
            isAnalyzing={isAnalyzing}
            isSaving={isSaving}
            isTranscribing={isTranscribing}
            onFormChange={setForm}
            onTranscribe={handleTranscribe}
            onError={setError}
            onAnalyze={handleAnalyze}
            onSave={handleSave}
          />
        )}

        {activeView === 'weekly' && (
          <WeeklyReportView
            task={weeklyTask}
            meetings={meetings}
            canUseRag={ragEnabled && knowledgeDocuments.length > 0}
            result={lastOfficeInput?.skill_id === 'weekly_report' ? officeResult : null}
            isRunning={isRunningOffice}
            isSaving={isSavingOfficeOutput}
            onTask={setWeeklyTask}
            onRun={() => handleRunOffice(weeklyTask)}
            onSave={handleSaveOfficeOutput}
          />
        )}

        {activeView === 'prd' && (
          <PrdReviewView
            task={prdTask}
            canUseRag={ragEnabled && knowledgeDocuments.length > 0}
            result={lastOfficeInput?.skill_id === 'prd_review' ? officeResult : null}
            isRunning={isRunningOffice}
            isSaving={isSavingOfficeOutput}
            onTask={setPrdTask}
            onRun={() => handleRunOffice(prdTask)}
            onSave={handleSaveOfficeOutput}
          />
        )}

        {activeView === 'library' && (
          <LibraryView
            meetings={meetings}
            search={search}
            typeFilter={typeFilter}
            loading={listLoading}
            onSearch={(value) => {
              setListLoading(true);
              setSearch(value);
            }}
            onTypeFilter={(value) => {
              setListLoading(true);
              setTypeFilter(value);
            }}
            onSelectMeeting={selectMeeting}
          />
        )}

        {activeView === 'detail' && (
          <DetailView
            meeting={selectedMeeting}
            question={question}
            isAsking={isAsking}
            onQuestion={setQuestion}
            onAsk={handleAsk}
            onOpenLibrary={() => setActiveView('library')}
          />
        )}

        {activeView === 'rag' && (
          <RagView
            enabled={ragEnabled}
            documents={knowledgeDocuments}
            title={knowledgeTitle}
            content={knowledgeContent}
            isSaving={isSavingKnowledge}
            onEnabled={setRagEnabled}
            onTitle={setKnowledgeTitle}
            onContent={setKnowledgeContent}
            onSave={handleSaveKnowledge}
          />
        )}

        {activeView === 'outputs' && (
          <OfficeOutputView
            outputs={officeOutputs}
            selectedOutput={selectedOfficeOutput}
            loading={officeListLoading}
            feedbackForm={feedbackForm}
            isSubmittingFeedback={isSubmittingFeedback}
            onSelectOutput={setSelectedOfficeOutputId}
            onFeedbackForm={setFeedbackForm}
            onSubmitFeedback={handleSubmitOfficeFeedback}
          />
        )}

        {activeView === 'feedback' && (
          <FeedbackIterationView
            feedback={officeFeedback}
            outputs={officeOutputs}
            loading={officeListLoading}
            onOpenOutputs={() => setActiveView('outputs')}
          />
        )}

        {activeView === 'docs' && <ProductDocsView />}
      </main>
    </div>
  );
}

function AuthView({
  mode,
  form,
  health,
  error,
  isLoading,
  onMode,
  onForm,
  onSubmit,
}: {
  mode: AuthMode;
  form: { email: string; password: string; name: string };
  health: HealthResponse | null;
  error: string;
  isLoading: boolean;
  onMode: (mode: AuthMode) => void;
  onForm: (form: { email: string; password: string; name: string }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="auth-screen">
      <section className="auth-hero">
        <div className="brand">
          <div className="brand-mark">
            <Brain size={22} strokeWidth={2.2} />
          </div>
          <div>
            <strong>Office Agent</strong>
            <span>AI 办公智能体助手</span>
          </div>
        </div>
        <h1>登录后进入办公 Agent 工作台，开始拆解和生成你的办公任务。</h1>
        <MemoryMap />
      </section>

      <form className="auth-card" onSubmit={onSubmit}>
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">{mode === 'login' ? '账号登录' : '创建账号'}</span>
            <h2>{mode === 'login' ? '继续使用' : '新建本地账号'}</h2>
          </div>
        </div>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => onMode('login')}>
            登录
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => onMode('register')}>
            注册
          </button>
        </div>

        {mode === 'register' && (
          <label>
            昵称
            <input
              value={form.name}
              onChange={(event) => onForm({ ...form, name: event.target.value })}
              placeholder="用于侧边栏显示"
            />
          </label>
        )}
        <label>
          邮箱
          <input
            type="text"
            inputMode="email"
            value={form.email}
            onChange={(event) => onForm({ ...form, email: event.target.value })}
            placeholder="you@example.com"
            required
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={form.password}
            onChange={(event) => onForm({ ...form, password: event.target.value })}
            placeholder="至少 8 位"
            minLength={8}
            required
          />
        </label>

        {error && (
          <div className="notice error" role="alert">
            <AlertTriangle size={18} />
            {error}
          </div>
        )}

        <button type="submit" className="button primary auth-submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="spin" size={17} /> : mode === 'login' ? <UserRound size={17} /> : <UserPlus size={17} />}
          {mode === 'login' ? '登录并连接' : '注册并进入'}
        </button>

        <div className="auth-status">
          <span>{health?.database?.ok ? 'PocketBase 已连接' : 'PocketBase 未连接'}</span>
          <span>{health?.database?.url || 'http://127.0.0.1:8090'}</span>
        </div>
      </form>
    </main>
  );
}

function HomeView({ onStart, onLibrary }: { onStart: () => void; onLibrary: () => void }) {
  return (
    <header className="workspace-hero home-hero">
      <div className="hero-copy">
        <h1>AI 办公智能体助手</h1>
        <div className="hero-actions">
          <button type="button" className="button primary" onClick={onStart}>
            <Wand2 size={17} />
            进入会议纪要
          </button>
          <button type="button" className="button on-dark" onClick={onLibrary}>
            <Library size={17} />
            打开会议记忆库
          </button>
        </div>
      </div>
      <MemoryMap />
    </header>
  );
}

function SkillWorkbenchView({
  meetingCount,
  outputCount,
  feedbackCount,
  onOpenView,
}: {
  meetingCount: number;
  outputCount: number;
  feedbackCount: number;
  onOpenView: (view: View) => void;
}) {
  return (
    <section className="office-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">AI Office Agent Assistant</span>
          <h1>Skill 工作台</h1>
          <p>会议助手保留为会议纪要 Skill，并扩展周报生成、需求评审、Agent Plan、输出保存和反馈迭代。</p>
        </div>
        <div className="workspace-stats">
          <Metric label="会议记忆" value={meetingCount} />
          <Metric label="办公输出" value={outputCount} />
          <Metric label="反馈记录" value={feedbackCount} />
        </div>
      </div>

      <div className="skill-grid">
        {skillCards.map((skill) => (
          <article className={`skill-card ${skill.tone}`} key={skill.id}>
            <div className="skill-card-top">
              <span className="skill-icon">
                {skill.id === 'meeting_minutes' && <Mic size={20} />}
                {skill.id === 'weekly_report' && <ClipboardList size={20} />}
                {skill.id === 'prd_review' && <ShieldCheck size={20} />}
              </span>
              <div>
                <h2>{skill.title}</h2>
                <p>{skill.scene}</p>
              </div>
            </div>
            <dl className="skill-meta">
              <div>
                <dt>输入内容</dt>
                <dd>{skill.inputs}</dd>
              </div>
              <div>
                <dt>输出内容</dt>
                <dd>{skill.outputs}</dd>
              </div>
              <div>
                <dt>适合用户</dt>
                <dd>{skill.users}</dd>
              </div>
              <div>
                <dt>风险提示</dt>
                <dd>{skill.risk}</dd>
              </div>
            </dl>
            <button type="button" className="button secondary" onClick={() => onOpenView(skill.view)}>
              进入 Skill
              <ArrowRight size={17} />
            </button>
          </article>
        ))}
      </div>

      <div className="agent-flow-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Agent Plan</span>
            <h2>统一执行链路</h2>
          </div>
        </div>
        <div className="flow-steps">
          {['目标理解', 'Skill 选择', '资料检索', '结构化生成', '质量自检', '结果保存', '反馈迭代'].map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function WeeklyReportView({
  task,
  meetings,
  canUseRag,
  result,
  isRunning,
  isSaving,
  onTask,
  onRun,
  onSave,
}: {
  task: OfficeTaskInput;
  meetings: MeetingRecord[];
  canUseRag: boolean;
  result: OfficeRunResult | null;
  isRunning: boolean;
  isSaving: boolean;
  onTask: (task: OfficeTaskInput) => void;
  onRun: () => void;
  onSave: () => void;
}) {
  const metadata = task.metadata || {};

  function updateMetadata(key: string, value: string) {
    onTask({ ...task, metadata: { ...metadata, [key]: value } });
  }

  function toggleMeeting(id: string) {
    const selected = new Set(task.linked_meeting_ids || []);
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    onTask({ ...task, linked_meeting_ids: [...selected] });
  }

  return (
    <section className="office-skill-layout">
      <div className="panel office-form-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">周报生成 Skill</span>
            <h2>把工作记录整理成可复制周报</h2>
          </div>
          <span className={canUseRag ? 'status ready' : 'status fallback'}>{canUseRag ? 'RAG 可用' : 'RAG 关闭'}</span>
        </div>

        <div className="form-grid">
          <label>
            周报标题
            <input value={task.title} onChange={(event) => onTask({ ...task, title: event.target.value })} />
          </label>
          <label>
            周期
            <input
              value={metadata.period || ''}
              onChange={(event) => updateMetadata('period', event.target.value)}
              placeholder="例如：2026.05.04 - 2026.05.10"
            />
          </label>
        </div>

        <label className="office-textarea">
          工作记录
          <textarea
            value={task.content}
            onChange={(event) => onTask({ ...task, content: event.target.value })}
            placeholder="粘贴本周完成事项、推进进展、阻塞风险、协作信息。"
          />
        </label>

        <label className="office-textarea compact">
          下周计划草稿
          <textarea
            value={metadata.next_plan || ''}
            onChange={(event) => updateMetadata('next_plan', event.target.value)}
            placeholder="可选。没有明确计划时，系统会基于未完成事项给出建议并标记依据。"
          />
        </label>

        <div className="meeting-reference-box">
          <div className="workbench-heading">
            <div>
              <span className="eyebrow">引用会议记录</span>
              <h3>用于补充本周结论和待办状态</h3>
            </div>
            <span>{task.linked_meeting_ids?.length || 0} 已选</span>
          </div>
          {meetings.length === 0 ? (
            <p className="muted-copy">暂无会议记忆，可先使用会议纪要 Skill 保存会议。</p>
          ) : (
            <div className="linked-meeting-list">
              {meetings.slice(0, 4).map((meeting) => (
                <label className="check-row" key={meeting.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(task.linked_meeting_ids?.includes(meeting.id))}
                    onChange={() => toggleMeeting(meeting.id)}
                  />
                  <span>{meeting.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="button-row">
          <button type="button" className="button primary" onClick={onRun} disabled={isRunning}>
            {isRunning ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
            生成周报
          </button>
          <button type="button" className="button dark" onClick={onSave} disabled={!result || isSaving}>
            {isSaving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            保存输出
          </button>
        </div>
      </div>

      <OfficeResultPanel result={result} emptyTitle="等待生成周报" />
    </section>
  );
}

function PrdReviewView({
  task,
  canUseRag,
  result,
  isRunning,
  isSaving,
  onTask,
  onRun,
  onSave,
}: {
  task: OfficeTaskInput;
  canUseRag: boolean;
  result: OfficeRunResult | null;
  isRunning: boolean;
  isSaving: boolean;
  onTask: (task: OfficeTaskInput) => void;
  onRun: () => void;
  onSave: () => void;
}) {
  const metadata = task.metadata || {};

  function updateMetadata(key: string, value: string) {
    onTask({ ...task, metadata: { ...metadata, [key]: value } });
  }

  return (
    <section className="office-skill-layout">
      <div className="panel office-form-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">需求评审 Skill</span>
            <h2>从想法到可评审 PRD 草稿</h2>
          </div>
          <span className={canUseRag ? 'status ready' : 'status fallback'}>{canUseRag ? 'RAG 可用' : 'RAG 关闭'}</span>
        </div>

        <div className="form-grid">
          <label>
            功能名称
            <input
              value={metadata.feature_name || ''}
              onChange={(event) => {
                updateMetadata('feature_name', event.target.value);
                onTask({ ...task, title: event.target.value || task.title, metadata: { ...metadata, feature_name: event.target.value } });
              }}
              placeholder="例如：会议输出反馈迭代"
            />
          </label>
          <label>
            目标用户
            <input
              value={metadata.target_user || ''}
              onChange={(event) => updateMetadata('target_user', event.target.value)}
              placeholder="例如：产品实习生 / 项目负责人"
            />
          </label>
        </div>

        <label className="office-textarea">
          功能想法
          <textarea
            value={task.content}
            onChange={(event) => onTask({ ...task, content: event.target.value })}
            placeholder="描述功能想解决的问题、核心流程、预期输出。"
          />
        </label>

        <div className="form-grid">
          <label>
            用户反馈 / 痛点
            <textarea
              value={metadata.feedback || ''}
              onChange={(event) => updateMetadata('feedback', event.target.value)}
              placeholder="粘贴用户反馈、访谈片段或痛点描述。"
            />
          </label>
          <label>
            业务背景
            <textarea
              value={metadata.business_context || ''}
              onChange={(event) => updateMetadata('business_context', event.target.value)}
              placeholder="补充业务目标、现有流程、约束环境。"
            />
          </label>
        </div>

        <label className="office-textarea compact">
          约束条件
          <textarea
            value={metadata.constraints || ''}
            onChange={(event) => updateMetadata('constraints', event.target.value)}
            placeholder="例如：第一版不做第三方集成；输出必须可复制；用户数据按账号隔离。"
          />
        </label>

        <div className="button-row">
          <button type="button" className="button primary" onClick={onRun} disabled={isRunning}>
            {isRunning ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
            生成评审材料
          </button>
          <button type="button" className="button dark" onClick={onSave} disabled={!result || isSaving}>
            {isSaving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            保存输出
          </button>
        </div>
      </div>

      <OfficeResultPanel result={result} emptyTitle="等待生成需求评审材料" />
    </section>
  );
}

function AgentPlanPanel({ result }: { result: OfficeRunResult }) {
  const plan = result.agent_plan;

  return (
    <section className="agent-plan-card">
      <div className="plan-header">
        <Bot size={18} />
        <div>
          <span className="eyebrow">Agent Plan</span>
          <h3>{plan.user_goal}</h3>
        </div>
        <span className="status ready">{skillName(plan.selected_skill)}</span>
      </div>
      <div className="plan-grid">
        <PlanList title="需要输入" items={plan.required_inputs} />
        <PlanList title="信息缺口" items={plan.missing_information.length ? plan.missing_information : ['暂无明显缺口']} />
        <PlanList title="执行步骤" items={plan.execution_steps} />
        <PlanList title="输出物" items={plan.expected_outputs} />
      </div>
      {plan.risk_notes.length > 0 && (
        <div className="plan-risk">
          <AlertTriangle size={16} />
          <span>{plan.risk_notes[0]}</span>
        </div>
      )}
    </section>
  );
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="plan-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function OfficeResultPanel({ result, emptyTitle }: { result: OfficeRunResult | null; emptyTitle: string }) {
  if (!result) {
    return (
      <div className="panel result-panel empty-result">
        <Bot size={28} />
        <h2>{emptyTitle}</h2>
        <p>Agent Plan、Skill 输出、质量自检和保存入口会显示在这里。</p>
      </div>
    );
  }

  return (
    <div className="office-result-stack">
      <AgentPlanPanel result={result} />
      {result.warnings.length > 0 && (
        <div className="notice warning">
          <AlertTriangle size={17} />
          {result.warnings[0]}
        </div>
      )}
      <OfficeOutputPreview output={result.skill_output} skillId={result.agent_plan.selected_skill} />
      <QualityPanel quality={result.quality_check} />
    </div>
  );
}

function OfficeOutputPreview({
  output,
  skillId,
}: {
  output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes;
  skillId: SkillId;
}) {
  if (skillId === 'weekly_report' && isWeeklyOutput(output)) {
    return (
      <section className="panel office-output-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Skill 输出</span>
            <h2>{output.one_sentence_summary}</h2>
          </div>
        </div>
        <div className="result-grid">
          <SimpleListBlock title="完成事项" tone="mint" items={output.completed_items.map((item) => item.item)} />
          <SimpleListBlock title="关键进展" tone="sky" items={output.key_progress} />
          <SimpleListBlock title="问题与风险" tone="peach" items={output.risks.map((item) => item.risk)} />
          <SimpleListBlock title="下周计划" tone="lavender" items={output.next_week_plan.map((item) => item.plan)} />
        </div>
        <pre className="copy-block">{output.copy_ready_report}</pre>
      </section>
    );
  }

  if (skillId === 'prd_review' && isPrdOutput(output)) {
    return (
      <section className="panel office-output-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">PRD 草稿</span>
            <h2>{output.background}</h2>
          </div>
        </div>
        <div className="result-grid">
          <SimpleListBlock title="用户痛点" tone="rose" items={output.user_pain_points.map((item) => item.pain)} />
          <SimpleListBlock title="功能范围" tone="sky" items={output.scope} />
          <SimpleListBlock title="验收标准" tone="mint" items={output.acceptance_criteria.map((item) => item.criterion)} />
          <SimpleListBlock title="风险点" tone="peach" items={output.risks.map((item) => item.risk)} />
        </div>
        <pre className="copy-block">{output.prd_draft}</pre>
      </section>
    );
  }

  return (
    <section className="panel office-output-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">会议纪要 Skill 输出</span>
          <h2>{isStructuredMinutes(output) ? output.one_sentence_summary : '已生成输出'}</h2>
        </div>
      </div>
      {isStructuredMinutes(output) && (
        <div className="summary-block">
          <p>{output.summary}</p>
        </div>
      )}
    </section>
  );
}

function SimpleListBlock({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'mint' | 'sky' | 'peach' | 'rose' | 'lavender';
  items: string[];
}) {
  return (
    <section className={`list-block ${tone}`}>
      <header>
        <CheckCircle2 size={18} />
        <span>{title}</span>
      </header>
      {items.length === 0 ? (
        <p className="list-empty">未提及</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <strong>{item}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QualityPanel({ quality }: { quality: OfficeRunResult['quality_check'] }) {
  return (
    <section className="quality-card">
      <div>
        <ShieldCheck size={18} />
        <strong>质量自检</strong>
      </div>
      <span className={quality.has_hallucination ? 'status fallback' : 'status ready'}>
        {quality.has_hallucination ? '存在疑点' : '未发现明显幻觉'}
      </span>
      <p>可复制评分：{quality.copy_ready_score || '未评分'} / 5</p>
      {quality.revision_suggestions.length > 0 && <p>{quality.revision_suggestions[0]}</p>}
    </section>
  );
}

function OfficeOutputView({
  outputs,
  selectedOutput,
  loading,
  feedbackForm,
  isSubmittingFeedback,
  onSelectOutput,
  onFeedbackForm,
  onSubmitFeedback,
}: {
  outputs: OfficeOutputRecord[];
  selectedOutput: OfficeOutputRecord | null;
  loading: boolean;
  feedbackForm: OfficeFeedbackInput;
  isSubmittingFeedback: boolean;
  onSelectOutput: (id: string) => void;
  onFeedbackForm: (form: OfficeFeedbackInput) => void;
  onSubmitFeedback: () => void;
}) {
  return (
    <section className="office-record-layout">
      <div className="panel output-list-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">输出记录</span>
            <h2>办公 Skill 历史</h2>
          </div>
        </div>
        {loading ? (
          <div className="loading-row">
            <Loader2 className="spin" size={18} />
            正在读取输出记录
          </div>
        ) : outputs.length === 0 ? (
          <div className="empty-state">
            <History size={28} />
            <h3>还没有办公输出</h3>
            <p>在周报生成或需求评审页面保存结果后会出现在这里。</p>
          </div>
        ) : (
          <div className="office-output-list">
            {outputs.map((output) => (
              <button
                type="button"
                className={selectedOutput?.id === output.id ? 'office-output-row active' : 'office-output-row'}
                key={output.id}
                onClick={() => onSelectOutput(output.id)}
              >
                <span>{skillName(output.skill_id)}</span>
                <strong>{output.title}</strong>
                <small>{new Date(output.updated_at).toLocaleString()}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="office-record-main">
        {selectedOutput ? (
          <>
            <OfficeOutputPreview output={selectedOutput.output} skillId={selectedOutput.skill_id} />
            <FeedbackFormPanel
              form={feedbackForm}
              isSubmitting={isSubmittingFeedback}
              onForm={onFeedbackForm}
              onSubmit={onSubmitFeedback}
            />
          </>
        ) : (
          <div className="panel result-panel empty-result">
            <Database size={28} />
            <h2>选择一条输出</h2>
            <p>查看结构化结果并提交准确性、可复制性和完整性反馈。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function FeedbackFormPanel({
  form,
  isSubmitting,
  onForm,
  onSubmit,
}: {
  form: OfficeFeedbackInput;
  isSubmitting: boolean;
  onForm: (form: OfficeFeedbackInput) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="panel feedback-form-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">反馈与迭代</span>
          <h2>评价这次输出</h2>
        </div>
      </div>
      <div className="score-grid">
        <ScoreInput label="准确性" value={form.accuracy_score} onChange={(value) => onForm({ ...form, accuracy_score: value })} />
        <ScoreInput label="可复制性" value={form.copyability_score} onChange={(value) => onForm({ ...form, copyability_score: value })} />
        <ScoreInput label="完整性" value={form.completeness_score} onChange={(value) => onForm({ ...form, completeness_score: value })} />
      </div>
      <label className="check-row feedback-check">
        <input
          type="checkbox"
          checked={form.needs_heavy_edit}
          onChange={(event) => onForm({ ...form, needs_heavy_edit: event.target.checked })}
        />
        <span>需要大量人工修改</span>
      </label>
      <div className="form-grid">
        <label>
          遗漏了什么
          <textarea value={form.missing_info} onChange={(event) => onForm({ ...form, missing_info: event.target.value })} />
        </label>
        <label>
          哪些内容有幻觉
          <textarea value={form.hallucination} onChange={(event) => onForm({ ...form, hallucination: event.target.value })} />
        </label>
      </div>
      <label className="office-textarea compact">
        下一版建议
        <textarea value={form.suggestion} onChange={(event) => onForm({ ...form, suggestion: event.target.value })} />
      </label>
      <button type="button" className="button primary" onClick={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
        提交反馈
      </button>
    </section>
  );
}

function ScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={1}
        max={5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function FeedbackIterationView({
  feedback,
  outputs,
  loading,
  onOpenOutputs,
}: {
  feedback: OfficeFeedbackRecord[];
  outputs: OfficeOutputRecord[];
  loading: boolean;
  onOpenOutputs: () => void;
}) {
  const lowScoreFeedback = feedback.filter((item) => {
    const average = (item.accuracy_score + item.copyability_score + item.completeness_score) / 3;
    return average < 3.5 || item.needs_heavy_edit;
  });

  return (
    <section className="office-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">反馈迭代</span>
          <h1>下一版优化清单</h1>
          <p>汇总低分输出、遗漏信息、幻觉反馈和用户建议，用于下一轮 Prompt 与产品交互优化。</p>
        </div>
        <button type="button" className="button secondary" onClick={onOpenOutputs}>
          <History size={17} />
          查看输出记录
        </button>
      </div>

      {loading ? (
        <div className="panel loading-row">
          <Loader2 className="spin" size={18} />
          正在读取反馈
        </div>
      ) : (
        <div className="iteration-grid">
          <section className="panel iteration-panel">
            <span className="eyebrow">高频问题</span>
            <h2>待关注反馈</h2>
            {feedback.length === 0 ? (
              <p className="muted-copy">暂无反馈。先在输出记录中提交一次评价。</p>
            ) : (
              <div className="iteration-list">
                {feedback.slice(0, 6).map((item) => (
                  <article key={item.id}>
                    <span className="status fallback">{skillName(item.skill_id || 'weekly_report')}</span>
                    <strong>{item.output_title || '未命名输出'}</strong>
                    <p>{item.feedback_summary?.feedback_summary || item.suggestion || item.missing_info || '用户提交了评分反馈。'}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel iteration-panel">
            <span className="eyebrow">低分输出</span>
            <h2>{lowScoreFeedback.length} 条需要复盘</h2>
            <div className="iteration-list">
              {(lowScoreFeedback.length ? lowScoreFeedback : feedback.slice(0, 3)).map((item) => (
                <article key={item.id}>
                  <strong>{item.output_title || '未命名输出'}</strong>
                  <p>
                    准确性 {item.accuracy_score} / 可复制性 {item.copyability_score} / 完整性 {item.completeness_score}
                  </p>
                </article>
              ))}
              {feedback.length === 0 && <p className="muted-copy">保存并反馈办公输出后会自动归档。</p>}
            </div>
          </section>

          <section className="panel iteration-panel wide">
            <span className="eyebrow">下一版建议</span>
            <h2>Prompt 与页面交互</h2>
            <div className="suggestion-grid">
              <div>
                <strong>Prompt 调整</strong>
                <p>强化“不编造、信息不足明确标记、计划不得写成完成”的质量约束。</p>
              </div>
              <div>
                <strong>产品调整</strong>
                <p>在周报和需求评审表单中继续增加缺口提示，并把 RAG、引用会议和反馈记录串联到输出详情。</p>
              </div>
              <div>
                <strong>当前数据</strong>
                <p>{outputs.length} 条办公输出，{feedback.length} 条反馈记录。</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function ProductDocsView() {
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

function RagView(props: {
  enabled: boolean;
  documents: KnowledgeDocument[];
  title: string;
  content: string;
  isSaving: boolean;
  onEnabled: (enabled: boolean) => void;
  onTitle: (value: string) => void;
  onContent: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="rag-page">
      <RagPanel {...props} />
    </section>
  );
}

function ComposeView({
  form,
  analysis,
  isAnalyzing,
  isSaving,
  isTranscribing,
  onFormChange,
  onTranscribe,
  onError,
  onAnalyze,
  onSave,
}: {
  form: MeetingInput;
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  isSaving: boolean;
  isTranscribing: boolean;
  onFormChange: (form: MeetingInput) => void;
  onTranscribe: (file: Blob, fileName?: string) => void;
  onError: (message: string) => void;
  onAnalyze: () => void;
  onSave: () => void;
}) {
  return (
    <section className="two-column">
      <div className="panel compose-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">新建会议</span>
            <h2>输入转写稿</h2>
          </div>
          <button type="button" className="button secondary" onClick={() => onFormChange(sampleMeeting)}>
            <Sparkles size={16} />
            示例
          </button>
        </div>

        <div className="form-grid">
          <label>
            会议标题
            <input
              value={form.title}
              onChange={(event) => onFormChange({ ...form, title: event.target.value })}
              placeholder="例如：AI 会议助手第一版功能讨论"
            />
          </label>
          <label>
            会议日期
            <input
              type="date"
              value={form.date}
              onChange={(event) => onFormChange({ ...form, date: event.target.value })}
            />
          </label>
          <label>
            会议类型
            <select
              value={form.meeting_type}
              onChange={(event) => onFormChange({ ...form, meeting_type: event.target.value })}
            >
              {meetingTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            参会人
            <input
              value={form.participants}
              onChange={(event) => onFormChange({ ...form, participants: event.target.value })}
              placeholder="姓名用逗号分隔"
            />
          </label>
        </div>

        <div className="transcript-workbench">
          <div className="workbench-heading">
            <div>
              <span className="eyebrow">转写部分</span>
              <h3>语音与文本集合</h3>
            </div>
            <span>{form.raw_transcript.trim() ? `${form.raw_transcript.trim().length} 字` : '未输入文本'}</span>
          </div>

          <AudioTranscriptionPanel
            isTranscribing={isTranscribing}
            onTranscribe={onTranscribe}
            onError={onError}
          />

          <label className="transcript-field">
            原始会议文本
            <textarea
              value={form.raw_transcript}
              onChange={(event) => onFormChange({ ...form, raw_transcript: event.target.value })}
              placeholder="粘贴会议转写内容，或先录音/上传音频后自动追加到这里。"
            />
          </label>
        </div>

        <div className="button-row">
          <button type="button" className="button primary" onClick={onAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
            生成结构化纪要
          </button>
          <button type="button" className="button dark" onClick={onSave} disabled={!analysis || isSaving}>
            {isSaving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            保存到记忆库
          </button>
        </div>
      </div>

      <div className="compose-side">
        <ResultPanel analysis={analysis} />
      </div>
    </section>
  );
}

function AudioTranscriptionPanel({
  isTranscribing,
  onTranscribe,
  onError,
}: {
  isTranscribing: boolean;
  onTranscribe: (file: Blob, fileName?: string) => void;
  onError: (message: string) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('当前浏览器不支持网页录音，请改用上传音频。');
      return;
    }

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError('无法访问麦克风，请检查浏览器权限或改用上传音频。');
      return;
    }

    const preferredType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType: preferredType });

    chunksRef.current = [];
    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: preferredType });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      onTranscribe(blob, 'browser-recording.webm');
    };
    recorder.start();
    setIsRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  }

  return (
    <div className="audio-panel">
      <div>
        <span className="eyebrow">语音转写</span>
        <p>录音或上传音频，文件只经由后端转发到转写 API。</p>
      </div>
      <div className="audio-actions">
        <button
          type="button"
          className={isRecording ? 'button danger' : 'button secondary'}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
        >
          {isRecording ? <MicOff size={17} /> : <Mic size={17} />}
          {isRecording ? '停止并转写' : '开始录音'}
        </button>
        <label className="button secondary upload-button">
          <Upload size={17} />
          上传音频
          <input
            type="file"
            accept="audio/*,video/mp4,video/webm"
            disabled={isTranscribing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onTranscribe(file, file.name);
                event.target.value = '';
              }
            }}
          />
        </label>
        {isTranscribing && (
          <span className="inline-status">
            <Loader2 className="spin" size={16} />
            正在转写
          </span>
        )}
      </div>
    </div>
  );
}

function RagPanel({
  enabled,
  documents,
  title,
  content,
  isSaving,
  onEnabled,
  onTitle,
  onContent,
  onSave,
}: {
  enabled: boolean;
  documents: KnowledgeDocument[];
  title: string;
  content: string;
  isSaving: boolean;
  onEnabled: (enabled: boolean) => void;
  onTitle: (value: string) => void;
  onContent: (value: string) => void;
  onSave: () => void;
}) {
  const canEnable = documents.length > 0;

  return (
    <div className="panel rag-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">RAG 资料库</span>
          <h2>生成时可选增强</h2>
        </div>
        <label className="switch-control">
          <input
            type="checkbox"
            checked={enabled && canEnable}
            disabled={!canEnable}
            onChange={(event) => onEnabled(event.target.checked)}
          />
          <span>{enabled && canEnable ? '已启用' : '关闭'}</span>
        </label>
      </div>

      <div className="form-grid single">
        <label>
          资料库名称
          <input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="例如：产品背景资料" />
        </label>
        <label>
          资料库内容
          <textarea
            value={content}
            onChange={(event) => onContent(event.target.value)}
            placeholder="粘贴项目背景、业务规则、术语表或协作约定。保存后才能启用 RAG。"
          />
        </label>
      </div>

      <div className="button-row tight">
        <button type="button" className="button secondary" onClick={onSave} disabled={isSaving || !content.trim()}>
          {isSaving ? <Loader2 className="spin" size={17} /> : <Settings2 size={17} />}
          保存资料库
        </button>
        <span className="rag-hint">{canEnable ? `${documents.length} 个资料库可用` : '默认关闭，保存资料库后可启用'}</span>
      </div>
    </div>
  );
}

function ResultPanel({ analysis }: { analysis: AnalysisResult | null }) {
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
        <div className="notice warning">
          <AlertTriangle size={17} />
          {analysis.warnings[0]}
        </div>
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
              <span className="memory-chip" key={`${item.category}-${item.memory}`}>
                {item.category} · {item.memory}
              </span>
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow">关键词</span>
          <div className="chip-row">
            {minutes.keywords.map((keyword) => (
              <span className="tag-chip" key={keyword}>
                {keyword}
              </span>
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

function LibraryView({
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
          <label className="search-box">
            <Search size={17} />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="标题、关键词、参会人" />
          </label>
          <select value={typeFilter} onChange={(event) => onTypeFilter(event.target.value)}>
            {['全部', ...meetingTypes.filter((type) => type !== '自动识别')].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-row">
          <Loader2 className="spin" size={18} />
          正在读取记忆库
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
                  <span className="status ready">{minutes.meeting_type || meeting.meeting_type}</span>
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

function DetailView({
  meeting,
  question,
  isAsking,
  onQuestion,
  onAsk,
  onOpenLibrary,
}: {
  meeting: MeetingRecord | null;
  question: string;
  isAsking: boolean;
  onQuestion: (value: string) => void;
  onAsk: () => void;
  onOpenLibrary: () => void;
}) {
  if (!meeting) {
    return (
      <section className="panel detail-panel">
        <EmptyState />
        <button type="button" className="button secondary" onClick={onOpenLibrary}>
          <Library size={17} />
          打开记忆库
        </button>
      </section>
    );
  }

  const minutes = meeting.analysis.structured_minutes;

  return (
    <section className="detail-layout">
      <div className="panel detail-main">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">会议详情</span>
            <h2>{meeting.title}</h2>
          </div>
          <span className="status ready">{minutes.meeting_type}</span>
        </div>

        <div className="detail-meta">
          <span>
            <CalendarDays size={16} />
            {meeting.date}
          </span>
          <span>
            <UserRound size={16} />
            {meeting.participants || '未提及'}
          </span>
          <span>
            <History size={16} />
            {new Date(meeting.updated_at).toLocaleString()}
          </span>
        </div>

        <div className="summary-block elevated">
          <strong>{minutes.one_sentence_summary}</strong>
          <p>{minutes.summary}</p>
        </div>

        <div className="detail-sections">
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
            icon={<ClipboardList size={18} />}
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
            title="长期记忆"
            icon={<Database size={18} />}
            tone="lavender"
            items={minutes.long_term_memory}
            render={(item: LongTermMemory) => (
              <>
                <strong>{item.memory}</strong>
                <span>{item.category}</span>
              </>
            )}
          />
        </div>

        <details className="raw-transcript">
          <summary>原始会议文本</summary>
          <p>{meeting.raw_transcript}</p>
        </details>
      </div>

      <aside className="panel ask-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">追问</span>
            <h2>单条会议问答</h2>
          </div>
        </div>

        <div className="question-box">
          <textarea
            value={question}
            onChange={(event) => onQuestion(event.target.value)}
            placeholder="例如：这次会议谁负责后续跟进？"
          />
          <button type="button" className="button primary" onClick={onAsk} disabled={isAsking || !question.trim()}>
            {isAsking ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
            发送
          </button>
        </div>

        <div className="qa-list">
          {meeting.qa_history.length === 0 ? (
            <div className="qa-empty">暂无追问记录</div>
          ) : (
            meeting.qa_history.map((entry) => (
              <article className="qa-item" key={entry.id}>
                <strong>{entry.question}</strong>
                <p>{entry.answer}</p>
                {entry.evidence && <span>{entry.evidence}</span>}
              </article>
            ))
          )}
        </div>
      </aside>
    </section>
  );
}

function ListBlock<T>({
  title,
  icon,
  tone,
  items,
  render,
}: {
  title: string;
  icon: ReactNode;
  tone: 'mint' | 'sky' | 'peach' | 'rose' | 'lavender';
  items: T[];
  render: (item: T) => ReactNode;
}) {
  return (
    <section className={`list-block ${tone}`}>
      <header>
        {icon}
        <span>{title}</span>
      </header>
      {items.length === 0 ? (
        <p className="list-empty">未提及</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={index}>{render(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SourceBadge({ configured }: { configured: boolean }) {
  return (
    <span className={configured ? 'source-badge configured' : 'source-badge fallback'}>
      {configured ? 'API 已连接' : '演示模式'}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Database size={28} />
      <h3>还没有会议记忆</h3>
      <p>保存分析结果后会出现在这里。</p>
    </div>
  );
}

function MemoryMap() {
  return (
    <div className="memory-map" aria-hidden="true">
      <div className="mock-toolbar">
        <span />
        <span />
        <span />
      </div>
      <div className="mock-title">
        <Tags size={18} />
        办公 Agent 链路
      </div>
      <div className="node-grid">
        <div className="node peach">目标</div>
        <div className="node sky">Skill</div>
        <div className="node lavender">生成</div>
        <div className="node mint">自检</div>
      </div>
      <div className="mock-lines">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function skillName(skillId: SkillId | string) {
  if (skillId === 'meeting_minutes') return '会议纪要';
  if (skillId === 'prd_review') return '需求评审';
  return '周报生成';
}

function isWeeklyOutput(output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes): output is WeeklyReportOutput {
  return 'copy_ready_report' in output;
}

function isPrdOutput(output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes): output is PrdReviewOutput {
  return 'prd_draft' in output;
}

function isStructuredMinutes(output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes): output is StructuredMinutes {
  return 'one_sentence_summary' in output && 'decisions' in output;
}

export default App;
