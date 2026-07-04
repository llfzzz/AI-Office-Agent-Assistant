// Domain/API types. App-local UI types (views, navigation, attachments) live in
// ./ui and are re-exported here so consumers can `import type { … } from '../types'`.
export * from './ui';

export type SourceType = 'default-api' | 'demo-fallback';

export interface MeetingInput {
  title: string;
  date: string;
  meeting_type: string;
  participants: string;
  raw_transcript: string;
  rag?: RagSelection;
}

export interface RagSelection {
  enabled: boolean;
}

export interface RagSource {
  document_id: string;
  title: string;
  score: number;
}

export interface RagResult {
  enabled: boolean;
  sources: RagSource[];
  context: string;
}

export interface MeetingUnderstanding {
  meeting_type: string;
  main_topic: string;
  top_themes: string[];
  has_clear_decision: boolean;
  has_action_items: boolean;
  notes_for_extraction: string;
}

export interface Decision {
  decision: string;
  evidence: string;
  confidence: string;
}

export interface ActionItem {
  task: string;
  owner: string;
  deadline: string;
  priority: string;
  evidence: string;
}

export interface Risk {
  risk: string;
  impact: string;
  suggestion: string;
  confidence: string;
}

export interface OpenQuestion {
  question: string;
  why_it_matters: string;
}

export interface LongTermMemory {
  memory: string;
  category: string;
}

export interface StructuredMinutes {
  meeting_type: string;
  one_sentence_summary: string;
  summary: string;
  decisions: Decision[];
  action_items: ActionItem[];
  risks: Risk[];
  open_questions: OpenQuestion[];
  long_term_memory: LongTermMemory[];
  keywords: string[];
}

export interface QualityCheck {
  has_hallucination: boolean;
  hallucination_items: string[];
  questionable_decisions: string[];
  questionable_action_items: string[];
  missing_risks_or_questions: string[];
  revision_suggestions: string[];
}

export interface AnalysisResult {
  source: SourceType;
  provider: {
    base_url: string;
    model: string;
    configured: boolean;
  } | null;
  warnings: string[];
  rag?: RagResult;
  meeting_understanding: MeetingUnderstanding;
  structured_minutes: StructuredMinutes;
  quality_check: QualityCheck;
}

export interface QAEntry {
  id: string;
  question: string;
  answer: string;
  evidence: string;
  confidence: string;
  source: SourceType;
  warnings: string[];
  created_at: string;
}

export interface MeetingRecord extends MeetingInput {
  id: string;
  analysis: AnalysisResult;
  qa_history: QAEntry[];
  created_at: string;
  updated_at: string;
}

export interface HealthResponse {
  ok: boolean;
  provider: {
    base_url: string;
    model: string;
    configured: boolean;
  };
  encryption?: {
    available: boolean;
  };
  database?: {
    ok: boolean;
    url: string;
    error?: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptionResponse {
  text: string;
  model: string;
  provider: HealthResponse['provider'];
}

export type MeetingAttachmentKind = 'recording' | 'audio' | 'image' | 'file';

export interface FileExtractionResponse {
  text: string;
  kind: Extract<MeetingAttachmentKind, 'image' | 'file'>;
  model: string | null;
  provider: HealthResponse['provider'] | null;
  warnings: string[];
}

export type SkillId = 'meeting_minutes' | 'weekly_report' | 'prd_review';

export interface OfficeTaskInput {
  skill_id: SkillId;
  title: string;
  content: string;
  date?: string;
  metadata?: Record<string, string>;
  rag?: RagSelection;
  linked_meeting_ids?: string[];
}

export interface AgentPlan {
  user_goal: string;
  detected_intent: SkillId | 'unknown';
  selected_skill: SkillId;
  confidence: 'high' | 'medium' | 'low' | string;
  required_inputs: string[];
  missing_information: string[];
  use_rag: boolean;
  execution_steps: string[];
  expected_outputs: string[];
  risk_notes: string[];
}

export interface WeeklyReportOutput {
  one_sentence_summary: string;
  completed_items: Array<{
    item: string;
    evidence: string;
    impact: string;
  }>;
  key_progress: string[];
  risks: Array<{
    risk: string;
    impact: string;
    suggestion: string;
  }>;
  next_week_plan: Array<{
    plan: string;
    basis: string;
  }>;
  support_needed: string[];
  copy_ready_report: string;
}

export interface PrdReviewOutput {
  background: string;
  user_pain_points: Array<{
    pain: string;
    source: string;
    severity: string;
  }>;
  product_goals: string[];
  user_flow: string[];
  scope: string[];
  out_of_scope: string[];
  acceptance_criteria: Array<{
    criterion: string;
    verification_method: string;
  }>;
  engineering_notes: string[];
  testing_notes: string[];
  risks: Array<{
    risk: string;
    mitigation: string;
  }>;
  prd_draft: string;
}

export interface OfficeQualityCheck {
  has_hallucination: boolean;
  hallucination_items: string[];
  overclaim_items: string[];
  missing_key_points: string[];
  unclear_items: string[];
  copy_ready_score: number;
  revision_suggestions: string[];
}

export interface OfficeRunResult {
  source: SourceType;
  provider: HealthResponse['provider'] | null;
  warnings: string[];
  rag?: RagResult;
  agent_plan: AgentPlan;
  skill_output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes;
  quality_check: OfficeQualityCheck;
}

export interface OfficeOutputRecord {
  id: string;
  skill_id: SkillId;
  title: string;
  input: OfficeTaskInput;
  agent_plan: AgentPlan;
  output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes;
  quality_check: OfficeQualityCheck;
  rag?: RagResult;
  created_at: string;
  updated_at: string;
}

export interface OfficeFeedbackInput {
  accuracy_score: number;
  copyability_score: number;
  completeness_score: number;
  needs_heavy_edit: boolean;
  missing_info: string;
  hallucination: string;
  suggestion: string;
}

export interface FeedbackSummary {
  feedback_summary: string;
  problem_categories: string[];
  iteration_suggestions: string[];
  priority: 'high' | 'medium' | 'low' | string;
  next_prompt_adjustment: string;
  next_product_adjustment: string;
}

export interface OfficeFeedbackRecord extends OfficeFeedbackInput {
  id: string;
  office_output: string;
  skill_id: SkillId | '';
  output_title: string;
  feedback_summary: FeedbackSummary | null;
  created_at: string;
  updated_at: string;
}
