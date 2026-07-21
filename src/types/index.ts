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
  /** v2 fields — absent on legacy saved records. */
  status?: string;
  dependencies?: string[];
  completion_criteria?: string;
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
  /** v2 fields — absent on legacy saved records. */
  meeting_purpose?: string;
  discussion_topics?: Array<{ topic: string; key_points: string[] }>;
  proposals?: Array<{ proposal: string; status: string }>;
  follow_ups?: string[];
  copy_ready_minutes?: string;
}

export interface QualityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | string;
  category: string;
  field_path: string;
  problem: string;
  evidence: string;
  required_fix: string;
}

export interface QualityScores {
  factuality: number;
  completeness: number;
  actionability: number;
  clarity: number;
  professionalism: number;
  safety: number;
}

/**
 * Unified quality gate. New results carry the v2 fields (verdict/scores/…);
 * legacy saved records carry only the old office- or meeting-shape fields, so
 * everything is optional and the UI derives a status via qualityStatus().
 */
export interface QualityCheck {
  verdict?: 'pass' | 'revise' | 'blocked' | string;
  scores?: QualityScores;
  issues?: QualityIssue[];
  missing_information?: string[];
  revision_summary?: string[];
  copy_ready?: boolean;
  /** Legacy office-shape fields. */
  has_hallucination?: boolean;
  hallucination_items?: string[];
  overclaim_items?: string[];
  missing_key_points?: string[];
  unclear_items?: string[];
  copy_ready_score?: number;
  revision_suggestions?: string[];
  /** Legacy meeting-shape fields. */
  questionable_decisions?: string[];
  questionable_action_items?: string[];
  missing_risks_or_questions?: string[];
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
  revision_applied?: boolean;
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

export interface PlanSourceItem {
  source_id: string;
  source_type: 'primary_input' | 'linked_meeting' | 'rag' | string;
  purpose: string;
  authority: 'primary' | 'supporting' | string;
}

export interface PlanKnownFact {
  fact: string;
  source_id: string;
  evidence: string;
}

export interface PlanAssumption {
  assumption: string;
  reason: string;
  needs_confirmation: boolean;
}

export interface PlanMissingInformation {
  field: string;
  reason: string;
  blocking: boolean;
  fallback_strategy: string;
}

export interface PlanExecutionStep {
  step: number;
  action: string;
  inputs: string[];
  expected_result: string;
  quality_gate: string;
}

export interface PlanRisk {
  risk: string;
  likelihood: string;
  impact: string;
  mitigation: string;
}

/**
 * Versioned execution plan (schema 2.0). Legacy saved plans (flat v1 shape)
 * lack schema_version and carry the legacy fields below; the UI normalizes
 * both via the helpers in lib/office.
 */
export interface AgentPlan {
  schema_version?: string;
  task_summary?: string;
  user_goal: string;
  selected_skill: SkillId;
  confidence: 'high' | 'medium' | 'low' | string;
  audience?: string[];
  deliverable?: {
    type: string;
    language: string;
    tone: string;
    format: string;
  };
  source_inventory?: PlanSourceItem[];
  known_facts?: PlanKnownFact[];
  assumptions?: PlanAssumption[];
  missing_information?: Array<PlanMissingInformation | string>;
  success_criteria?: string[];
  execution_steps?: Array<PlanExecutionStep | string>;
  output_outline?: string[];
  risk_register?: PlanRisk[];
  safety_checks?: string[];
  expected_outputs?: string[];
  clarification_questions?: string[];
  /** Legacy v1 fields (previously saved records). */
  detected_intent?: SkillId | 'unknown' | string;
  required_inputs?: string[];
  use_rag?: boolean;
  risk_notes?: string[];
}

export interface WeeklyPlanItem {
  /** v2 field; legacy records use `plan` instead. */
  objective?: string;
  plan?: string;
  deliverable?: string;
  priority?: string;
  deadline?: string;
  dependency?: string;
  basis: string;
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
  next_week_plan: WeeklyPlanItem[];
  support_needed: string[];
  copy_ready_report: string;
  /** v2 fields — absent on legacy saved records. */
  reporting_period?: string;
  executive_summary?: string;
  in_progress?: Array<{ item: string; status: string; evidence: string }>;
  milestones_or_metrics?: string[];
  blockers?: string[];
  dependencies?: string[];
  cross_team_items?: string[];
  management_highlights?: string[];
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
    given?: string;
    when?: string;
    then?: string;
  }>;
  engineering_notes: string[];
  testing_notes: string[];
  risks: Array<{
    risk: string;
    mitigation: string;
  }>;
  prd_draft: string;
  /** v2 fields — absent on legacy saved records. */
  review_readiness?: { level: string; conclusion: string };
  problem_statement?: string;
  target_users?: string[];
  user_scenarios?: string[];
  non_goals?: string[];
  success_metrics?: Array<{ metric: string; status: string }>;
  functional_requirements?: Array<{ id: string; requirement: string; priority: string }>;
  business_rules?: string[];
  state_and_permission_notes?: string[];
  data_api_analytics?: string[];
  non_functional_requirements?: string[];
  dependencies?: string[];
  edge_cases?: string[];
  open_questions?: string[];
  rollout_notes?: string[];
}

export type OfficeQualityCheck = QualityCheck;

export interface OfficeRunResult {
  source: SourceType;
  provider: HealthResponse['provider'] | null;
  warnings: string[];
  rag?: RagResult;
  agent_plan: AgentPlan;
  skill_output: WeeklyReportOutput | PrdReviewOutput | StructuredMinutes;
  quality_check: OfficeQualityCheck;
  revision_applied?: boolean;
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

export type FeedbackTargetType = 'generation' | 'saved_output';

/** What a feedback ticket is about — a fresh generation or a saved output. */
export interface FeedbackTicketTarget {
  target_type: FeedbackTargetType;
  target_id?: string;
  skill_id: SkillId | '';
  output_title: string;
}

export interface FeedbackTicketInput extends FeedbackTicketTarget {
  issue_type: string;
  subject: string;
  details: string;
  expected_result?: string;
  impact?: string;
}

export interface FeedbackTicketRecord {
  id: string;
  ticket_no: string;
  target_type: FeedbackTargetType | string;
  target_id: string;
  office_output: string;
  skill_id: SkillId | '';
  output_title: string;
  issue_type: string;
  subject: string;
  details: string;
  expected_result: string;
  impact: string;
  status: string;
  legacy: boolean;
  created_at: string;
  updated_at: string;
}
