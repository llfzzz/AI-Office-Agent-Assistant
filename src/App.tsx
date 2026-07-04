import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  ClipboardList,
  Database,
  FilePlus2,
  History,
  Library,
  ListTodo,
  LogOut,
  Loader2,
  Menu,
  Mic,
  MessageSquare,
  Network,
  PanelLeftClose,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  UserPlus,
  UserRound,
  Wand2,
  type LucideIcon,
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
import { Alert, Badge, Button, Card, Input, Modal, SegmentedControl, Select, Spinner, Switch, Tag, Textarea, Tooltip } from './freejoy';
import { ScorePicker, SemanticPanel } from './ui';
// Note: keep these import lists in sync with actual usage (noUnusedLocals is on).
import {
  GEMINI_API_BASE_URL,
  GEMINI_API_MODEL,
  aiProviderIsLocallyConfigured,
  getStoredAiProviderSettings,
  normalizeAiProviderSettings,
  storeAiProviderSettings,
  type AiProviderSettings,
} from './aiProvider';
import { meetingTypes, sampleMeeting } from './sample';
import type {
  ActionItem,
  AnalysisResult,
  AuthSession,
  Decision,
  HealthResponse,
  KnowledgeDocument,
  LongTermMemory,
  MeetingAttachmentKind,
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
type NavGroupId = 'agent' | 'memory' | 'records';

type NavItemDefinition = {
  view: View;
  label: string;
  icon: LucideIcon;
  disabled?: (context: { selectedMeeting: MeetingRecord | null }) => boolean;
};

type NavGroupDefinition = {
  id: NavGroupId;
  label: string;
  items: NavItemDefinition[];
};

type MeetingAttachmentStatus = 'processing' | 'ready' | 'error';

type MeetingAttachment = {
  id: string;
  kind: MeetingAttachmentKind;
  fileName: string;
  mimeType: string;
  size: number;
  extractedText: string;
  selected: boolean;
  status: MeetingAttachmentStatus;
  error?: string;
  createdAt: string;
};

const attachmentKindLabels: Record<MeetingAttachmentKind, string> = {
  recording: '录音',
  audio: '音频',
  image: '图片',
  file: '文件',
};

const meetingFileAccept = [
  '.txt',
  '.text',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.log',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
  '.rtf',
  '.docx',
  '.odt',
  '.pptx',
  '.xlsx',
  'text/*',
  'application/json',
  'text/csv',
  'text/tab-separated-values',
  'application/xml',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

function createAttachmentId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function randomProtectionToken(size = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint32Array(size);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  }

  return Array.from({ length: size }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function compactTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    '-',
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join('');
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('flac')) return 'flac';
  if (mimeType.includes('m4a')) return 'm4a';
  return 'webm';
}

function protectedRecordingFileName(mimeType: string) {
  return `录音-${compactTimestamp()}-${randomProtectionToken()}.${extensionFromMimeType(mimeType)}`;
}

function inferUploadKind(file: File): Extract<MeetingAttachmentKind, 'image' | 'file'> {
  return file.type.startsWith('image/') ? 'image' : 'file';
}

function buildMeetingTranscript(form: MeetingInput, attachments: MeetingAttachment[]) {
  const manualText = form.raw_transcript.trim();
  const attachmentSections = attachments
    .filter((attachment) => attachment.selected && attachment.status === 'ready' && attachment.extractedText.trim())
    .map((attachment) => {
      const label = attachmentKindLabels[attachment.kind];
      return `【${label}：${attachment.fileName}】\n${attachment.extractedText.trim()}`;
    });

  return [manualText, ...attachmentSections].filter(Boolean).join('\n\n');
}

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

const navigationGroups: NavGroupDefinition[] = [
  {
    id: 'agent',
    label: 'Skills',
    items: [
      { view: 'compose', label: '会议纪要', icon: Mic },
      { view: 'weekly', label: '周报生成', icon: ClipboardList },
      { view: 'prd', label: '需求评审', icon: ShieldCheck },
    ],
  },
  {
    id: 'memory',
    label: '记忆与资料',
    items: [
      { view: 'rag', label: 'RAG 资料库', icon: Database },
      { view: 'library', label: '会议记忆库', icon: Library },
      {
        view: 'detail',
        label: '会议追问',
        icon: MessageSquare,
        disabled: ({ selectedMeeting }) => !selectedMeeting,
      },
    ],
  },
  {
    id: 'records',
    label: '记录与迭代',
    items: [
      { view: 'outputs', label: '输出记录', icon: History },
      { view: 'feedback', label: '反馈迭代', icon: MessageSquare },
      { view: 'docs', label: '产品资料', icon: Tags },
    ],
  },
];

const initialOpenNavGroups: Record<NavGroupId, boolean> = {
  agent: true,
  memory: true,
  records: true,
};

function getActiveNavItem(view: View) {
  return navigationGroups.flatMap((group) => group.items).find((item) => item.view === view);
}

function getNavGroupIdForView(view: View) {
  return navigationGroups.find((group) => group.items.some((item) => item.view === view))?.id;
}

function onlyOpenNavGroup(groupId: NavGroupId = 'agent'): Record<NavGroupId, boolean> {
  return {
    agent: groupId === 'agent',
    memory: groupId === 'memory',
    records: groupId === 'records',
  };
}

function isMobileNavViewport() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(max-width: 760px)').matches ||
    window.innerWidth <= 760 ||
    document.documentElement.clientWidth <= 760
  );
}

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

  useEffect(() => {
    if (!utilityMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && utilityMenuRef.current?.contains(target)) {
        return;
      }

      setUtilityMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [utilityMenuOpen]);

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
            <div className="brand">
              <div className="brand-mark">
                <Brain size={22} strokeWidth={2.2} />
              </div>
              <div className="brand-copy">
                <strong>Office Agent</strong>
                <span>{session.user.name || session.user.email}</span>
              </div>
            </div>
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
            outputs={officeOutputs}
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

function AuthView({
  mode,
  form,
  error,
  isLoading,
  onMode,
  onForm,
  onSubmit,
}: {
  mode: AuthMode;
  form: { email: string; password: string; name: string };
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

        <SegmentedControl
          full
          value={mode}
          onChange={(value) => onMode(value as AuthMode)}
          options={[
            { value: 'login', label: '登录' },
            { value: 'register', label: '注册' },
          ]}
          style={{ marginBottom: 4 }}
        />

        {mode === 'register' && (
          <Input
            label="昵称"
            value={form.name}
            onChange={(event) => onForm({ ...form, name: event.target.value })}
            placeholder="用于侧边栏显示"
          />
        )}
        <Input
          label="邮箱"
          type="text"
          inputMode="email"
          value={form.email}
          onChange={(event) => onForm({ ...form, email: event.target.value })}
          placeholder="you@example.com"
          required
        />
        <Input
          label="密码"
          type="password"
          value={form.password}
          onChange={(event) => onForm({ ...form, password: event.target.value })}
          placeholder="至少 8 位"
          minLength={8}
          required
        />

        {error && (
          <Alert tone="danger" icon={<AlertTriangle size={18} />}>
            {error}
          </Alert>
        )}

        <Button
          type="submit"
          full
          size="lg"
          disabled={isLoading}
          iconLeft={isLoading ? <Loader2 className="spin" size={17} /> : mode === 'login' ? <UserRound size={17} /> : <UserPlus size={17} />}
        >
          {mode === 'login' ? '登录并连接' : '注册并进入'}
        </Button>
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
          <Button size="lg" onClick={onStart} iconLeft={<Wand2 size={17} />}>
            进入会议纪要
          </Button>
          <Button size="lg" variant="secondary" onClick={onLibrary} iconLeft={<Library size={17} />}>
            打开会议记忆库
          </Button>
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

          <Card className="agent-flow-panel" padding="22px">
            <div className="panel-heading compact">
              <div>
                <h2>Agent Plan（任务执行流程）</h2>
                <p className="muted-copy">目标理解、资料检索、结构化生成和保存会按同一链路执行。</p>
              </div>
            </div>
            <div className="flow-steps">
              {['目标理解', '资料检索', '结构化生成', '保存结果'].map((step, index) => (
                <div className={index < 3 ? 'flow-step complete' : 'flow-step pending'} key={step}>
                  <span>{index + 1}</span>
                  <strong>{step}</strong>
                  <small>{index < 3 ? '已完成' : '待开始'}</small>
                </div>
              ))}
            </div>
          </Card>

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
          <Badge tone={canUseRag ? 'success' : 'neutral'}>{canUseRag ? 'RAG 可用' : 'RAG 关闭'}</Badge>
        </div>

        <div className="form-grid">
          <Input
            label="周报标题"
            value={task.title}
            onChange={(event) => onTask({ ...task, title: event.target.value })}
          />
          <Input
            label="周期"
            value={metadata.period || ''}
            onChange={(event) => updateMetadata('period', event.target.value)}
            placeholder="例如：2026.05.04 - 2026.05.10"
          />
        </div>

        <Textarea
          label="工作记录"
          rows={6}
          value={task.content}
          onChange={(event) => onTask({ ...task, content: event.target.value })}
          placeholder="粘贴本周完成事项、推进进展、阻塞风险、协作信息。"
        />

        <Textarea
          label="下周计划草稿"
          rows={3}
          value={metadata.next_plan || ''}
          onChange={(event) => updateMetadata('next_plan', event.target.value)}
          placeholder="可选。没有明确计划时，系统会基于未完成事项给出建议并标记依据。"
        />

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
          <Button
            onClick={onRun}
            disabled={isRunning}
            iconLeft={isRunning ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
          >
            生成周报
          </Button>
          <Button
            variant="secondary"
            onClick={onSave}
            disabled={!result || isSaving}
            iconLeft={isSaving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
          >
            保存输出
          </Button>
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
          <Badge tone={canUseRag ? 'success' : 'neutral'}>{canUseRag ? 'RAG 可用' : 'RAG 关闭'}</Badge>
        </div>

        <div className="form-grid">
          <Input
            label="功能名称"
            value={metadata.feature_name || ''}
            onChange={(event) => {
              updateMetadata('feature_name', event.target.value);
              onTask({ ...task, title: event.target.value || task.title, metadata: { ...metadata, feature_name: event.target.value } });
            }}
            placeholder="例如：会议输出反馈迭代"
          />
          <Input
            label="目标用户"
            value={metadata.target_user || ''}
            onChange={(event) => updateMetadata('target_user', event.target.value)}
            placeholder="例如：产品实习生 / 项目负责人"
          />
        </div>

        <Textarea
          label="功能想法"
          rows={5}
          value={task.content}
          onChange={(event) => onTask({ ...task, content: event.target.value })}
          placeholder="描述功能想解决的问题、核心流程、预期输出。"
        />

        <div className="form-grid">
          <Textarea
            label="用户反馈 / 痛点"
            rows={3}
            value={metadata.feedback || ''}
            onChange={(event) => updateMetadata('feedback', event.target.value)}
            placeholder="粘贴用户反馈、访谈片段或痛点描述。"
          />
          <Textarea
            label="业务背景"
            rows={3}
            value={metadata.business_context || ''}
            onChange={(event) => updateMetadata('business_context', event.target.value)}
            placeholder="补充业务目标、现有流程、约束环境。"
          />
        </div>

        <Textarea
          label="约束条件"
          rows={3}
          value={metadata.constraints || ''}
          onChange={(event) => updateMetadata('constraints', event.target.value)}
          placeholder="例如：第一版不做第三方集成；输出必须可复制；用户数据按账号隔离。"
        />

        <div className="button-row">
          <Button
            onClick={onRun}
            disabled={isRunning}
            iconLeft={isRunning ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
          >
            生成评审材料
          </Button>
          <Button
            variant="secondary"
            onClick={onSave}
            disabled={!result || isSaving}
            iconLeft={isSaving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
          >
            保存输出
          </Button>
        </div>
      </div>

      <OfficeResultPanel result={result} emptyTitle="等待生成需求评审材料" />
    </section>
  );
}

function OfficeResultPanel({ result, emptyTitle }: { result: OfficeRunResult | null; emptyTitle: string }) {
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
    <SemanticPanel tone={tone} icon={<CheckCircle2 size={18} />} title={title} count={items.length}>
      {items.length === 0 ? (
        <p className="list-empty">未提及</p>
      ) : (
        <ul className="semantic-list">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <strong>{item}</strong>
            </li>
          ))}
        </ul>
      )}
    </SemanticPanel>
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
            <Spinner size={18} label="正在读取输出记录" />
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
        <ScorePicker label="准确性" value={form.accuracy_score} onChange={(value) => onForm({ ...form, accuracy_score: value })} />
        <ScorePicker label="可复制性" value={form.copyability_score} onChange={(value) => onForm({ ...form, copyability_score: value })} />
        <ScorePicker label="完整性" value={form.completeness_score} onChange={(value) => onForm({ ...form, completeness_score: value })} />
      </div>
      <Switch
        checked={form.needs_heavy_edit}
        onChange={(checked) => onForm({ ...form, needs_heavy_edit: checked })}
        label="需要大量人工修改"
      />
      <div className="form-grid">
        <Textarea
          label="遗漏了什么"
          rows={3}
          value={form.missing_info}
          onChange={(event) => onForm({ ...form, missing_info: event.target.value })}
        />
        <Textarea
          label="哪些内容有幻觉"
          rows={3}
          value={form.hallucination}
          onChange={(event) => onForm({ ...form, hallucination: event.target.value })}
        />
      </div>
      <Textarea
        label="下一版建议"
        rows={3}
        value={form.suggestion}
        onChange={(event) => onForm({ ...form, suggestion: event.target.value })}
      />
      <Button
        onClick={onSubmit}
        disabled={isSubmitting}
        iconLeft={isSubmitting ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
      >
        提交反馈
      </Button>
    </section>
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
}) {
  return (
    <section className="rag-page">
      <RagPanel {...props} />
    </section>
  );
}

function ComposeView({
  form,
  attachments,
  analysis,
  isAnalyzing,
  isSaving,
  isTranscribing,
  onFormChange,
  onTranscribe,
  onExtractAttachment,
  onToggleAttachment,
  onDeleteAttachment,
  onError,
  onAnalyze,
  onSave,
}: {
  form: MeetingInput;
  attachments: MeetingAttachment[];
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  isSaving: boolean;
  isTranscribing: boolean;
  onFormChange: (form: MeetingInput) => void;
  onTranscribe: (file: Blob, fileName?: string, kind?: Extract<MeetingAttachmentKind, 'recording' | 'audio'>) => void;
  onExtractAttachment: (file: File) => void;
  onToggleAttachment: (id: string) => void;
  onDeleteAttachment: (id: string) => void;
  onError: (message: string) => void;
  onAnalyze: () => void;
  onSave: () => void;
}) {
  const analyzableTextLength = buildMeetingTranscript(form, attachments).trim().length;

  return (
    <section className="two-column">
      <div className="panel compose-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">新建会议</span>
            <h2>输入转写稿</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onFormChange(sampleMeeting)} iconLeft={<Sparkles size={16} />}>
            示例
          </Button>
        </div>

        <div className="form-grid">
          <Input
            label="会议标题"
            value={form.title}
            onChange={(event) => onFormChange({ ...form, title: event.target.value })}
            placeholder="例如：AI 会议助手第一版功能讨论"
          />
          <Input
            label="会议日期"
            type="date"
            value={form.date}
            onChange={(event) => onFormChange({ ...form, date: event.target.value })}
          />
          <Select
            label="会议类型"
            value={form.meeting_type}
            onChange={(event) => onFormChange({ ...form, meeting_type: event.target.value })}
            options={[...meetingTypes]}
          />
          <Input
            label="参会人"
            value={form.participants}
            onChange={(event) => onFormChange({ ...form, participants: event.target.value })}
            placeholder="姓名用逗号分隔"
          />
        </div>

        <div className="transcript-workbench">
          <div className="workbench-heading">
            <div>
              <span className="eyebrow">转写部分</span>
              <h3>语音与文本集合</h3>
            </div>
            <span>{analyzableTextLength ? `${analyzableTextLength} 字可分析` : '未输入内容'}</span>
          </div>

          <div className="transcript-field">
            <label className="field-label" htmlFor="meeting-raw-transcript">
              原始会议文本
            </label>
            <div className="transcript-input-wrap">
              <textarea
                id="meeting-raw-transcript"
                value={form.raw_transcript}
                onChange={(event) => onFormChange({ ...form, raw_transcript: event.target.value })}
                placeholder="粘贴或输入会议文本"
              />
              <MeetingContentToolbar
                isTranscribing={isTranscribing}
                onTranscribe={onTranscribe}
                onExtractAttachment={onExtractAttachment}
                onError={onError}
              />
            </div>
            <MeetingAttachmentList
              attachments={attachments}
              onToggleAttachment={onToggleAttachment}
              onDeleteAttachment={onDeleteAttachment}
            />
          </div>
        </div>

        <div className="button-row">
          <Button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            iconLeft={isAnalyzing ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
          >
            生成结构化纪要
          </Button>
          <Button
            variant="secondary"
            onClick={onSave}
            disabled={!analysis || isSaving}
            iconLeft={isSaving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
          >
            保存到记忆库
          </Button>
        </div>
      </div>

      <div className="compose-side">
        <ResultPanel analysis={analysis} />
      </div>
    </section>
  );
}

function MeetingContentToolbar({
  isTranscribing,
  onTranscribe,
  onExtractAttachment,
  onError,
}: {
  isTranscribing: boolean;
  onTranscribe: (file: Blob, fileName?: string, kind?: Extract<MeetingAttachmentKind, 'recording' | 'audio'>) => void;
  onExtractAttachment: (file: File) => void;
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
      onTranscribe(blob, protectedRecordingFileName(preferredType), 'recording');
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
    <div className="attachment-toolbar" aria-label="会议内容附件操作">
      <Tooltip content={isRecording ? '停止录音' : '开始录音'} placement="top">
        <button
          type="button"
          className={isRecording ? 'attachment-tool-button active' : 'attachment-tool-button'}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          aria-label={isRecording ? '停止录音' : '开始录音'}
        >
          <MeetingAssetIcon kind="recording" />
        </button>
      </Tooltip>
      <Tooltip content={isTranscribing ? '正在转写' : '上传音频'} placement="top">
        <label
          className={isTranscribing ? 'attachment-tool-button attachment-tool-label disabled' : 'attachment-tool-button attachment-tool-label'}
          aria-label="上传音频"
        >
          <MeetingAssetIcon kind="audio" />
          <input
            type="file"
            accept="audio/*,video/mp4,video/webm"
            disabled={isTranscribing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onTranscribe(file, file.name, 'audio');
                event.target.value = '';
              }
            }}
          />
        </label>
      </Tooltip>
      <Tooltip content="上传图片" placement="top">
        <label className="attachment-tool-button attachment-tool-label" aria-label="上传图片">
          <MeetingAssetIcon kind="image" />
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onExtractAttachment(file);
                event.target.value = '';
              }
            }}
          />
        </label>
      </Tooltip>
      <Tooltip content="上传文件" placement="top">
        <label className="attachment-tool-button attachment-tool-label" aria-label="上传文件">
          <MeetingAssetIcon kind="file" />
          <input
            type="file"
            accept={meetingFileAccept}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onExtractAttachment(file);
                event.target.value = '';
              }
            }}
          />
        </label>
      </Tooltip>
      {isTranscribing && (
        <span className="attachment-tool-status" aria-label="正在转写">
          <Loader2 className="spin" size={15} />
        </span>
      )}
    </div>
  );
}

function MeetingAttachmentList({
  attachments,
  onToggleAttachment,
  onDeleteAttachment,
}: {
  attachments: MeetingAttachment[];
  onToggleAttachment: (id: string) => void;
  onDeleteAttachment: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="meeting-attachment-list" aria-label="会议内容附件">
      {attachments.map((attachment) => (
        <div
          className={[
            'meeting-attachment-item',
            attachment.selected ? 'selected' : '',
            attachment.status,
          ]
            .filter(Boolean)
            .join(' ')}
          key={attachment.id}
        >
          <Tooltip content={attachment.selected ? '已选择，点击取消' : '未选择，点击选择'} placement="top" style={{ width: '100%' }}>
            <button
              type="button"
              className="meeting-attachment-select"
              onClick={() => onToggleAttachment(attachment.id)}
              aria-pressed={attachment.selected}
            >
              <MeetingAssetIcon kind={attachment.kind} />
              <span className="meeting-attachment-copy">
                <strong>{attachment.fileName}</strong>
                <span>{attachmentMeta(attachment)}</span>
              </span>
            </button>
          </Tooltip>
          <Tooltip content="删除" placement="top">
            <button
              type="button"
              className="meeting-attachment-delete"
              onClick={() => onDeleteAttachment(attachment.id)}
              aria-label={`删除 ${attachment.fileName}`}
            >
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}

function attachmentMeta(attachment: MeetingAttachment) {
  if (attachment.status === 'processing') {
    return attachment.kind === 'recording' || attachment.kind === 'audio' ? '转写中' : '提取中';
  }

  if (attachment.status === 'error') {
    return attachment.error || '处理失败';
  }

  return `${attachmentKindLabels[attachment.kind]} · ${attachment.extractedText.trim().length} 字`;
}

function MeetingAssetIcon({ kind }: { kind: MeetingAttachmentKind }) {
  return (
    <svg className="meeting-asset-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === 'recording' && (
        <>
          <rect x="8.5" y="3" width="7" height="12" rx="3.5" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
          <path d="M12 18v3" />
          <path d="M8.5 21h7" />
          <path d="M10.5 7h3" />
        </>
      )}
      {kind === 'audio' && (
        <>
          <path d="M6.5 4.5h7l4 4v11h-11z" />
          <path d="M13.5 4.5v4h4" />
          <path d="M8.8 14.5h1.4l1-3 1.6 5 1.1-3.2h1.3" />
        </>
      )}
      {kind === 'image' && (
        <>
          <rect x="4.5" y="5" width="15" height="14" rx="2" />
          <circle cx="9" cy="9.5" r="1.25" />
          <path d="M6.8 16.8 10.3 13l2.4 2.2 2.2-2.7 2.4 4.3" />
        </>
      )}
      {kind === 'file' && (
        <>
          <path d="M6.5 4.5h7.2l3.8 3.8v11.2h-11z" />
          <path d="M13.5 4.8v3.9h3.8" />
          <path d="M9 12h6" />
          <path d="M9 15h6" />
          <path d="M9 18h4" />
        </>
      )}
    </svg>
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
}: {
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
}) {
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
          <Input
            iconLeft={<Search size={17} />}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="标题、关键词、参会人"
            style={{ minWidth: 220 }}
          />
          <Select
            value={typeFilter}
            onChange={(event) => onTypeFilter(event.target.value)}
            options={['全部', ...meetingTypes.filter((type) => type !== '自动识别')]}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-row">
          <Spinner size={18} label="正在读取记忆库" />
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
                  <Badge tone="success">{minutes.meeting_type || meeting.meeting_type}</Badge>
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
        <Button variant="secondary" onClick={onOpenLibrary} iconLeft={<Library size={17} />}>
          打开记忆库
        </Button>
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
          <Badge tone="success">{minutes.meeting_type}</Badge>
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
          <Textarea
            rows={3}
            value={question}
            onChange={(event) => onQuestion(event.target.value)}
            placeholder="例如：这次会议谁负责后续跟进？"
          />
          <Button
            onClick={onAsk}
            disabled={isAsking || !question.trim()}
            iconLeft={isAsking ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
          >
            发送
          </Button>
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
    <SemanticPanel tone={tone} icon={icon} title={title} count={items.length}>
      {items.length === 0 ? (
        <p className="list-empty">未提及</p>
      ) : (
        <ul className="semantic-list">
          {items.map((item, index) => (
            <li key={index}>{render(item)}</li>
          ))}
        </ul>
      )}
    </SemanticPanel>
  );
}

function UtilityMenu({
  refEl,
  health,
  isOpen,
  settings,
  userLabel,
  onOpenChange,
  onOpenSettings,
  onLogout,
}: {
  refEl: RefObject<HTMLDivElement | null>;
  health: HealthResponse | null;
  isOpen: boolean;
  settings: AiProviderSettings;
  userLabel: string;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const configured =
    settings.mode === 'custom'
      ? aiProviderIsLocallyConfigured(settings)
      : Boolean(health?.provider.configured);
  const displayModel =
    settings.mode === 'custom'
      ? settings.model.trim() || '自定义模型'
      : GEMINI_API_MODEL;

  return (
    <div className="utility-menu" ref={refEl}>
      <Tooltip content="AI 设置" placement="bottom">
        <button
          type="button"
          className="icon-button utility-trigger"
          aria-label="打开设置菜单"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          onClick={() => onOpenChange(!isOpen)}
        >
          <Settings2 size={18} />
        </button>
      </Tooltip>

      {isOpen && (
        <div className="utility-popover" role="menu">
          <div className="utility-status">
            <span className="eyebrow">当前账号</span>
            <strong>{userLabel}</strong>
            <SourceBadge configured={configured} />
            <p>{configured ? displayModel : '未配置 API_KEY'}</p>
          </div>
          <button
            type="button"
            className="utility-item"
            role="menuitem"
            onClick={() => {
              onOpenSettings();
              onOpenChange(false);
            }}
          >
            <Network size={17} />
            API 设置
          </button>
          <button
            type="button"
            className="utility-item danger"
            role="menuitem"
            onClick={() => {
              onOpenChange(false);
              onLogout();
            }}
          >
            <LogOut size={17} />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

function AiSettingsModal({
  health,
  isOpen,
  settings,
  onClose,
  onSettingsChange,
}: {
  health: HealthResponse | null;
  isOpen: boolean;
  settings: AiProviderSettings;
  onClose: () => void;
  onSettingsChange: (settings: AiProviderSettings) => void;
}) {
  const configured =
    settings.mode === 'custom'
      ? aiProviderIsLocallyConfigured(settings)
      : Boolean(health?.provider.configured);
  const displayModel =
    settings.mode === 'custom'
      ? settings.model.trim() || '自定义模型'
      : GEMINI_API_MODEL;

  function update(patch: Partial<AiProviderSettings>) {
    onSettingsChange({ ...settings, ...patch });
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="AI 连接配置" width={500}>
      <div className="modal-status">
        <SourceBadge configured={configured} />
        <p>{configured ? displayModel : '未配置 API_KEY'}</p>
      </div>

      <div className="ai-provider-form">
        <SegmentedControl
          full
          value={settings.mode}
          onChange={(value) =>
            value === 'default'
              ? update({ mode: 'default', baseUrl: GEMINI_API_BASE_URL, apiKey: '', model: GEMINI_API_MODEL })
              : update({ mode: 'custom', baseUrl: '', apiKey: '', model: '' })
          }
          options={[
            { value: 'default', label: '默认 Gemini' },
            { value: 'custom', label: '自定义网络' },
          ]}
        />

        {settings.mode === 'custom' && (
          <>
            <Input
              label="API Base URL"
              value={settings.baseUrl}
              onChange={(event) => update({ baseUrl: event.target.value })}
              placeholder="https://api.example.com/v1"
            />
            <Input
              label="API Key"
              type="password"
              value={settings.apiKey}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder="sk-..."
              autoComplete="off"
            />
            <Input
              label="模型名称"
              value={settings.model}
              onChange={(event) => update({ model: event.target.value })}
              placeholder="model-id"
            />
          </>
        )}
      </div>
    </Modal>
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
