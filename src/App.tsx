import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Menu,
  PanelLeftClose,
} from 'lucide-react';
import {
  analyzeMeeting,
  askMeeting,
  clearStoredToken,
  deleteKnowledgeDocument,
  extractMeetingFile,
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
import { Alert, Spinner, Tooltip } from './freejoy';
import {
  getStoredAiProviderSettings,
  normalizeAiProviderSettings,
  storeAiProviderSettings,
  type AiProviderSettings,
} from './aiProvider';
import { blankForm, blankFeedbackForm, blankPrdTask, blankWeeklyTask } from './data/constants';
import { buildMeetingTranscript, createAttachmentId, inferUploadKind, protectedRecordingFileName } from './lib/format';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useDismiss } from './hooks/useDismiss';
import {
  getActiveNavItem,
  getNavGroupIdForView,
  initialOpenNavGroups,
  isMobileNavViewport,
  navigationGroups,
  onlyOpenNavGroup,
} from './app/navigation';
import { AiSettingsModal } from './components/AiSettingsModal';
import { AppLogo, Metric } from './components/primitives';
import { UtilityMenu } from './components/UtilityMenu';
import { AuthView } from './views/AuthView';
import { ComposeView } from './views/ComposeView';
import { DetailView } from './views/DetailView';
import { FeedbackIterationView } from './views/FeedbackIterationView';
import { HomeView } from './views/HomeView';
import { LibraryView } from './views/LibraryView';
import { OfficeOutputView } from './views/OfficeOutputView';
import { PrdReviewView } from './views/PrdReviewView';
import { ProductDocsView } from './views/ProductDocsView';
import { RagView } from './views/RagView';
import { SkillWorkbenchView } from './views/SkillWorkbenchView';
import { WeeklyReportView } from './views/WeeklyReportView';
import type {
  AnalysisResult,
  AuthMode,
  AuthSession,
  HealthResponse,
  KnowledgeDocument,
  MeetingAttachment,
  MeetingAttachmentKind,
  MeetingInput,
  MeetingRecord,
  NavGroupId,
  OfficeFeedbackInput,
  OfficeFeedbackRecord,
  OfficeOutputRecord,
  OfficeRunResult,
  OfficeTaskInput,
  View,
} from './types';

function App() {
  const [activeView, setActiveView] = useState<View>('skills');
  const [isMobileViewport, setIsMobileViewport] = useState(isMobileNavViewport);
  const [isNavCollapsed, setIsNavCollapsed] = useState(isMobileNavViewport);
  const [openNavGroups, setOpenNavGroups] = useState<Record<NavGroupId, boolean>>(() =>
    isMobileNavViewport()
      ? onlyOpenNavGroup()
      : initialOpenNavGroups,
  );
  const [utilityMenuOpen, setUtilityMenuOpen] = useState(false);
  const [form, setForm] = useState<MeetingInput>(blankForm);
  const [meetingAttachments, setMeetingAttachments] = useState<MeetingAttachment[]>([]);
  const [lastAnalyzedMeetingInput, setLastAnalyzedMeetingInput] = useState<MeetingInput | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [aiSettings, setAiSettings] = useState<AiProviderSettings>(() =>
    getStoredAiProviderSettings(),
  );
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
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
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState('');
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
  const [isDeletingKnowledge, setIsDeletingKnowledge] = useState(false);
  const [isRunningOffice, setIsRunningOffice] = useState(false);
  const [isSavingOfficeOutput, setIsSavingOfficeOutput] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [officeListLoading, setOfficeListLoading] = useState(false);
  const [error, setError] = useState('');
  const utilityMenuRef = useRef<HTMLDivElement | null>(null);
  const activeNavItem = getActiveNavItem(activeView);

  useEffect(() => {
    getHealth()
      .then((payload) => {
        setHealth(payload);
      })
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
    const mediaQuery = window.matchMedia('(max-width: 760px)');
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
      setIsNavCollapsed(event.matches);
      setOpenNavGroups(event.matches ? onlyOpenNavGroup(getNavGroupIdForView(activeView)) : initialOpenNavGroups);
    };

    mediaQuery.addEventListener('change', handleViewportChange);
    return () => {
      mediaQuery.removeEventListener('change', handleViewportChange);
    };
  }, [activeView]);

  useDismiss(utilityMenuRef, utilityMenuOpen, () => setUtilityMenuOpen(false));

  useEffect(() => {
    if (!session) {
      return;
    }

    listKnowledgeDocuments()
      .then((payload) => {
        setKnowledgeDocuments(payload.documents);
        const firstDocument = payload.documents[0];
        if (firstDocument) {
          setSelectedKnowledgeId(firstDocument.id);
          setKnowledgeTitle(firstDocument.title);
          setKnowledgeContent(firstDocument.content);
        } else {
          setSelectedKnowledgeId('');
          setKnowledgeTitle('默认会议资料库');
          setKnowledgeContent('');
        }
      })
      .catch((err) => {
        setKnowledgeDocuments([]);
        setSelectedKnowledgeId('');
        setError(err instanceof Error ? err.message : '读取 RAG 资料库失败');
      });
  }, [session]);

  // Debounce the search box so typing doesn't refetch the whole library per keystroke.
  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    listMeetings({ search: debouncedSearch, type: typeFilter })
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
  }, [debouncedSearch, session, typeFilter]);

  useEffect(() => {
    if (!session || !['skills', 'outputs', 'feedback'].includes(activeView)) return;

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

  function updateAiSettings(nextSettings: AiProviderSettings) {
    const normalized = normalizeAiProviderSettings(nextSettings);
    setAiSettings(normalized);
    storeAiProviderSettings(normalized);
  }

  function showView(view: View) {
    setActiveView(view);
    // Show the list loading state while the outputs/feedback effect fetches.
    // (Set here in the handler rather than inside the effect, which would trip
    // react-hooks/set-state-in-effect.)
    if (view === 'outputs' || view === 'feedback') {
      setOfficeListLoading(true);
    }
    if (isMobileViewport || isMobileNavViewport()) {
      setOpenNavGroups(onlyOpenNavGroup(getNavGroupIdForView(view)));
    }
  }

  function handleNavSelect(view: View) {
    showView(view);
    setUtilityMenuOpen(false);

    if (isMobileViewport || isMobileNavViewport()) {
      setIsNavCollapsed(true);
    }
  }

  function toggleNavGroup(groupId: NavGroupId) {
    setOpenNavGroups((current) => ({
      ...(isMobileViewport ? onlyOpenNavGroup(groupId) : current),
      [groupId]: !current[groupId],
    }));
  }

  async function handleAnalyze() {
    setError('');
    if (activeView === 'home') {
      showView('compose');
    }

    const hasProcessingSelectedAttachment = meetingAttachments.some(
      (attachment) => attachment.selected && attachment.status === 'processing',
    );
    const transcriptForAnalysis = buildMeetingTranscript(form, meetingAttachments);

    if (hasProcessingSelectedAttachment) {
      setError('会议附件还在后台提取或转写，请完成后再生成纪要。');
      return;
    }

    if (!transcriptForAnalysis.trim()) {
      setError('请先输入会议文本，或上传/录音生成可分析的会议内容。');
      return;
    }

    setIsAnalyzing(true);
    try {
      const analysisInput = {
        ...form,
        raw_transcript: transcriptForAnalysis,
        rag: { enabled: ragEnabled && knowledgeDocuments.length > 0 },
      };
      const result = await analyzeMeeting(analysisInput);
      setLastAnalyzedMeetingInput(analysisInput);
      setAnalysis(result);
      showView('compose');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleTranscribe(file: Blob, fileName?: string, kind: Extract<MeetingAttachmentKind, 'recording' | 'audio'> = 'audio') {
    setError('');
    showView('compose');
    setIsTranscribing(true);
    const attachmentId = createAttachmentId();
    const attachmentName =
      fileName || (kind === 'recording' ? protectedRecordingFileName(file.type || 'audio/webm') : 'meeting-audio.webm');

    setMeetingAttachments((current) => [
      ...current,
      {
        id: attachmentId,
        kind,
        fileName: attachmentName,
        mimeType: file.type || 'application/octet-stream',
        size: file.size || 0,
        extractedText: '',
        selected: true,
        status: 'processing',
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const result = await transcribeAudio(file, { fileName: attachmentName });
      const extractedText = result.text.trim();
      setMeetingAttachments((current) =>
        current.map((attachment) =>
          attachment.id === attachmentId
            ? {
                ...attachment,
                extractedText,
                status: extractedText ? 'ready' : 'error',
                error: extractedText ? undefined : '转写结果为空',
              }
            : attachment,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '转写失败';
      setError(message);
      setMeetingAttachments((current) =>
        current.map((attachment) =>
          attachment.id === attachmentId
            ? {
                ...attachment,
                status: 'error',
                error: message,
              }
            : attachment,
        ),
      );
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleExtractAttachment(file: File) {
    setError('');
    showView('compose');
    const attachmentId = createAttachmentId();
    const kind = inferUploadKind(file);

    setMeetingAttachments((current) => [
      ...current,
      {
        id: attachmentId,
        kind,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        extractedText: '',
        selected: true,
        status: 'processing',
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const result = await extractMeetingFile(file, { fileName: file.name });
      const extractedText = result.text.trim();
      const warning = result.warnings[0];
      setMeetingAttachments((current) =>
        current.map((attachment) =>
          attachment.id === attachmentId
            ? {
                ...attachment,
                extractedText,
                status: extractedText ? 'ready' : 'error',
                error: extractedText ? warning : warning || '没有提取到可用于会议纪要的内容',
              }
            : attachment,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '文件提取失败';
      setError(message);
      setMeetingAttachments((current) =>
        current.map((attachment) =>
          attachment.id === attachmentId
            ? {
                ...attachment,
                status: 'error',
                error: message,
              }
            : attachment,
        ),
      );
    }
  }

  function handleToggleMeetingAttachment(id: string) {
    setMeetingAttachments((current) =>
      current.map((attachment) =>
        attachment.id === id ? { ...attachment, selected: !attachment.selected } : attachment,
      ),
    );
  }

  function handleDeleteMeetingAttachment(id: string) {
    setMeetingAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function handleSaveKnowledge() {
    setError('');
    setIsSavingKnowledge(true);

    try {
      const payload = await saveKnowledgeDocument({
        id: selectedKnowledgeId || undefined,
        title: knowledgeTitle,
        content: knowledgeContent,
      });
      setKnowledgeDocuments((current) => [
        payload.document,
        ...current.filter((document) => document.id !== payload.document.id),
      ]);
      setSelectedKnowledgeId(payload.document.id);
      setKnowledgeTitle(payload.document.title);
      setKnowledgeContent(payload.document.content);
      setRagEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存资料库失败');
    } finally {
      setIsSavingKnowledge(false);
    }
  }

  function handleSelectKnowledge(document: KnowledgeDocument) {
    setSelectedKnowledgeId(document.id);
    setKnowledgeTitle(document.title);
    setKnowledgeContent(document.content);
  }

  function handleNewKnowledge() {
    setSelectedKnowledgeId('');
    setKnowledgeTitle('新资料库');
    setKnowledgeContent('');
  }

  async function handleDeleteKnowledge() {
    if (!selectedKnowledgeId) return;

    if (!window.confirm('确定删除这个资料库吗？删除后无法恢复。')) {
      return;
    }

    setError('');
    setIsDeletingKnowledge(true);

    try {
      await deleteKnowledgeDocument(selectedKnowledgeId);
      const nextDocuments = knowledgeDocuments.filter(
        (document) => document.id !== selectedKnowledgeId,
      );
      const nextSelected = nextDocuments[0];

      setKnowledgeDocuments(nextDocuments);
      setSelectedKnowledgeId(nextSelected?.id || '');
      setKnowledgeTitle(nextSelected?.title || '默认会议资料库');
      setKnowledgeContent(nextSelected?.content || '');
      setRagEnabled((enabled) => enabled && nextDocuments.length > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除资料库失败');
    } finally {
      setIsDeletingKnowledge(false);
    }
  }

  async function handleSave() {
    if (!analysis) return;

    setError('');
    setIsSaving(true);
    try {
      const payload = await saveMeeting(lastAnalyzedMeetingInput || form, analysis);
      setMeetings((current) => [
        payload.meeting,
        ...current.filter((meeting) => meeting.id !== payload.meeting.id),
      ]);
      setSelectedMeetingId(payload.meeting.id);
      showView('detail');
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
      showView('outputs');
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
    showView('detail');
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
      showView('skills');
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
    setSelectedKnowledgeId('');
    setKnowledgeTitle('默认会议资料库');
    setKnowledgeContent('');
    setRagEnabled(false);
    setOfficeOutputs([]);
    setOfficeFeedback([]);
    setSelectedMeetingId('');
    setSelectedOfficeOutputId('');
    setAnalysis(null);
    setMeetingAttachments([]);
    setLastAnalyzedMeetingInput(null);
    setOfficeResult(null);
    setLastOfficeInput(null);
    showView('home');
  }

  async function handleSubmitOfficeFeedback() {
    if (!selectedOfficeOutput) return;

    setError('');
    setIsSubmittingFeedback(true);
    try {
      const payload = await submitOfficeFeedback(selectedOfficeOutput.id, feedbackForm);
      setOfficeFeedback((current) => [payload.feedback, ...current]);
      setFeedbackForm(blankFeedbackForm);
      showView('feedback');
    } catch (err) {
      setError(err instanceof Error ? `${err.message}。如果是首次升级，请先运行 npm run pb:migrate。` : '提交反馈失败');
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  if (isRestoringSession) {
    return (
      <div className="auth-screen">
        <Spinner size={26} label="正在连接数据库账号" />
      </div>
    );
  }

  if (!session) {
    return (
      <AuthView
        mode={authMode}
        form={authForm}
        error={error}
        isLoading={isAuthLoading}
        onMode={setAuthMode}
        onForm={setAuthForm}
        onSubmit={handleAuth}
      />
    );
  }

  return (
    <div
      className={[
        activeView === 'home' ? 'app-shell home-shell' : 'app-shell',
        activeView !== 'home' && isNavCollapsed ? 'nav-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {activeView !== 'home' && (
        <aside
          className={isNavCollapsed ? 'sidebar collapsed' : 'sidebar'}
          aria-label="应用导航"
        >
          <div className="sidebar-top">
            <button
              type="button"
              className="brand"
              onClick={() => showView('skills')}
              aria-label="返回工作台"
              title="返回工作台"
            >
              <div className="brand-mark">
                <AppLogo size={22} strokeWidth={2.1} />
              </div>
              <div className="brand-copy">
                <strong>Office Agent</strong>
                <span>{session.user.name || session.user.email}</span>
              </div>
            </button>
            <span className="active-view-label">{activeNavItem?.label || '工作台'}</span>
            <div className="sidebar-actions">
              <UtilityMenu
                refEl={utilityMenuRef}
                health={health}
                isOpen={utilityMenuOpen}
                settings={aiSettings}
                userLabel={session.user.name || session.user.email}
                onOpenChange={setUtilityMenuOpen}
                onOpenSettings={() => setAiSettingsOpen(true)}
                onLogout={handleLogout}
              />
              <Tooltip content={isNavCollapsed ? '展开导航' : '收起导航'} placement="right">
                <button
                  type="button"
                  className="icon-button nav-collapse-toggle"
                  aria-label={isNavCollapsed ? '展开导航' : '收起导航'}
                  aria-expanded={!isNavCollapsed}
                  onClick={() => setIsNavCollapsed((collapsed) => !collapsed)}
                >
                  {isMobileViewport ? (
                    isNavCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />
                  ) : isNavCollapsed ? (
                    <Menu size={18} />
                  ) : (
                    <PanelLeftClose size={18} />
                  )}
                </button>
              </Tooltip>
            </div>
          </div>

          <nav className="nav-stack" aria-label="主导航">
            {navigationGroups.map((group) => {
              const hasActiveItem = group.items.some((item) => item.view === activeView);
              const isOpen = openNavGroups[group.id];

              return (
                <div
                  key={group.id}
                  className={hasActiveItem ? 'nav-group active' : 'nav-group'}
                >
                  <button
                    type="button"
                    className="nav-group-toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleNavGroup(group.id)}
                  >
                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span>{group.label}</span>
                  </button>
                  <div className="nav-group-items" hidden={!isNavCollapsed && !isOpen}>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const disabled = item.disabled?.({ selectedMeeting }) || false;

                      return (
                        <Tooltip
                          key={item.view}
                          content={isNavCollapsed ? (disabled ? '请先选择会议' : item.label) : undefined}
                          placement="right"
                          style={{ width: '100%' }}
                        >
                          <button
                            type="button"
                            aria-label={item.label}
                            className={activeView === item.view ? 'nav-item active' : 'nav-item'}
                            onClick={() => handleNavSelect(item.view)}
                            disabled={disabled}
                          >
                            <Icon size={18} />
                            <span>{item.label}</span>
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="metric-grid">
            <Metric label="会议" value={stats.meetings} />
            <Metric label="输出" value={stats.outputs} />
            <Metric label="反馈" value={stats.feedback} />
          </div>
        </aside>
      )}

      <main className={activeView === 'home' ? 'workspace home-workspace' : 'workspace'}>
        {activeView === 'home' && (
          <HomeView
            onStart={() => showView('compose')}
            onLibrary={() => showView('library')}
          />
        )}

        {activeView === 'skills' && (
          <SkillWorkbenchView
            meetingCount={stats.meetings}
            outputCount={stats.outputs}
            feedbackCount={stats.feedback}
            actionCount={stats.actions}
            memoryCount={stats.memories}
            knowledgeCount={knowledgeDocuments.length}
            ragEnabled={ragEnabled}
            recentOutputs={officeOutputs.slice(0, 5)}
            onOpenView={showView}
          />
        )}

        {error && (
          <Alert tone="danger" icon={<AlertTriangle size={18} />} style={{ marginBottom: 4 }}>
            {error}
          </Alert>
        )}

        {activeView === 'compose' && (
          <ComposeView
            form={form}
            attachments={meetingAttachments}
            analysis={analysis}
            isAnalyzing={isAnalyzing}
            isSaving={isSaving}
            isTranscribing={isTranscribing}
            onFormChange={setForm}
            onTranscribe={handleTranscribe}
            onExtractAttachment={handleExtractAttachment}
            onToggleAttachment={handleToggleMeetingAttachment}
            onDeleteAttachment={handleDeleteMeetingAttachment}
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
            onOpenLibrary={() => showView('library')}
          />
        )}

        {activeView === 'rag' && (
          <RagView
            enabled={ragEnabled}
            documents={knowledgeDocuments}
            selectedDocumentId={selectedKnowledgeId}
            title={knowledgeTitle}
            content={knowledgeContent}
            isSaving={isSavingKnowledge}
            isDeleting={isDeletingKnowledge}
            onEnabled={setRagEnabled}
            onSelectDocument={handleSelectKnowledge}
            onNewDocument={handleNewKnowledge}
            onTitle={setKnowledgeTitle}
            onContent={setKnowledgeContent}
            onSave={handleSaveKnowledge}
            onDelete={handleDeleteKnowledge}
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
            loading={officeListLoading}
            onOpenOutputs={() => showView('outputs')}
          />
        )}

        {activeView === 'docs' && <ProductDocsView />}
      </main>

      <AiSettingsModal
        health={health}
        isOpen={aiSettingsOpen}
        settings={aiSettings}
        onClose={() => setAiSettingsOpen(false)}
        onSettingsChange={updateAiSettings}
      />
    </div>
  );
}

export default App;
