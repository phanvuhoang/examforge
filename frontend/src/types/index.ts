export type UserRole = 'admin' | 'editor' | 'user';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings_json: Record<string, unknown>;
  created_at: string;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_by: string;
  ai_provider_override: string | null;
  ai_model_override: string | null;
  created_at: string;
  updated_at: string;
  question_count?: number;
  exam_count?: number;
  document_count?: number;
}

export interface Document {
  id: string;
  project_id: string;
  filename: string;
  storage_key: string;
  file_type: string;
  status: 'processing' | 'ready' | 'error';
  chunk_count: number;
  uploaded_by: string;
  created_at: string;
}

export interface Tag {
  id: string;
  project_id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
}

export type QuestionType = 'MC' | 'MR' | 'TF' | 'FITB' | 'MATCH' | 'ORDER' | 'NUM' | 'SA' | 'ESSAY' | 'TEXT';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QualityScore = 'excellent' | 'good' | 'needs_review';

export interface QuestionOption {
  id: string;
  question_id: string;
  body_html: string;
  is_correct: boolean;
  display_order: number;
  partial_credit_pct: number;
  pin: boolean;
}

export interface Question {
  id: string;
  project_id: string;
  type: QuestionType;
  body_html: string;
  body_plain: string | null;
  correct_answer_json: Record<string, unknown> | null;
  explanation_html: string | null;
  points_default: number;
  difficulty: Difficulty;
  ai_generated: boolean;
  approved: boolean;
  quality_score: QualityScore | null;
  is_pinned: boolean;
  shuffle_options: boolean;
  shuffle_right_col: boolean;
  version: number;
  source_doc_id: string | null;
  created_by: string | null;
  language: string;
  created_at: string;
  updated_at: string;
  options?: QuestionOption[];
  tags?: Tag[];
}

export interface ExamTemplate {
  id: string;
  project_id: string;
  name: string;
  settings_json: Record<string, unknown>;
  total_points: number;
  created_by: string;
  created_at: string;
  sections?: TemplateSection[];
}

export interface TemplateSection {
  id: string;
  template_id: string;
  name: string;
  intro_html: string | null;
  question_type_filter: string[];
  tag_filter: string[];
  difficulty_filter: string[];
  question_count: number;
  points_per_question: number;
  randomize: boolean;
  fixed_question_ids: string[];
  display_order: number;
}

export type ExamStatus = 'draft' | 'open' | 'scheduled' | 'closed';
export type AccessType = 'public' | 'passcode' | 'email_list' | 'token';

export interface BrowserSecurity {
  disable_copy_paste: boolean;
  disable_right_click: boolean;
  disable_print: boolean;
}

export interface ExamSettings {
  pagination: 'all_on_one' | 'one_per_page';
  navigation: 'free_jump' | 'forward_only';
  inline_feedback: 'none' | 'correct_indicator' | 'show_answer' | 'full_with_explanation';
  shuffle_questions: boolean;
  shuffle_options: boolean;
  time_limit_minutes: number | null;
  time_per_question_seconds: number | null;
  max_attempts: number | null;
  cooldown_minutes: number;
  browser_security: BrowserSecurity;
  pass_threshold_pct: number;
  pass_message: string;
  fail_message: string;
  result_display: 'score' | 'outline' | 'correct_indicator' | 'show_answer' | 'show_explanation';
  review_window: 'immediate' | 'after_close' | 'never';
  require_identifier: 'name' | 'email' | 'student_id' | 'none';
  certificate_enabled: boolean;
  watermark_text: string;
  language: string;
}

export interface Exam {
  id: string;
  project_id: string;
  template_id: string | null;
  title: string;
  status: ExamStatus;
  access_type: AccessType;
  passcode: string | null;
  allowed_identifiers: string[] | null;
  open_at: string | null;
  close_at: string | null;
  settings_json: ExamSettings;
  created_by: string;
  token: string | null;
  created_at: string;
  questions?: ExamQuestion[];
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_id: string;
  section_name: string | null;
  display_order: number;
  pool_id: string | null;
  points_override: number | null;
  is_pinned: boolean;
  question?: Question;
}

export interface Attempt {
  id: string;
  exam_id: string;
  user_id: string | null;
  identifier_text: string | null;
  started_at: string;
  submitted_at: string | null;
  score_raw: number | null;
  score_pct: number | null;
  passed: boolean | null;
  time_taken_sec: number | null;
  ip_address: string | null;
}

export interface Response {
  id: string;
  attempt_id: string;
  exam_question_id: string;
  answer_data_json: Record<string, unknown> | null;
  is_correct: boolean | null;
  score_awarded: number | null;
  score_override: number | null;
  feedback_html: string | null;
  graded_by: string | null;
  graded_at: string | null;
}

export interface AIGenerationJob {
  id: string;
  project_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  provider: string;
  model: string;
  config_json: Record<string, unknown>;
  questions_generated: number;
  tokens_used: number;
  cost_usd: number;
  error_msg: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  message: string;
  read_at: string | null;
  payload_json: Record<string, unknown>;
  created_at: string;
}

export interface GenerationConfig {
  question_types: QuestionType[];
  count_per_type: Record<string, number>;
  difficulty_distribution: { easy: number; medium: number; hard: number };
  topic_filter: string[];
  chapter_filter: string[];
  language: string;
  include_explanation: boolean;
  ai_provider?: string;
  ai_model?: string;
}

export interface SSEProgressEvent {
  type: 'progress';
  step: number;
  total: number;
  label: string;
}

export interface SSEQuestionEvent {
  type: 'question';
  question: Question;
}

export interface SSEDoneEvent {
  type: 'done';
  total_generated: number;
}

export interface SSEErrorEvent {
  type: 'error';
  message: string;
}

export type SSEEvent = SSEProgressEvent | SSEQuestionEvent | SSEDoneEvent | SSEErrorEvent;

export interface DashboardStats {
  total_questions: number;
  total_exams: number;
  total_attempts: number;
  recent_activity: Array<{
    type: string;
    message: string;
    created_at: string;
  }>;
}

export interface ExamAnalytics {
  total_attempts: number;
  average_score: number;
  median_score: number;
  pass_rate: number;
  score_distribution: Array<{ bucket: string; count: number }>;
  per_question_stats: Array<{
    exam_question_id: string;
    question_text: string;
    question_type: QuestionType;
    pct_correct: number;
    avg_score: number;
    discrimination_index: number;
    avg_time_seconds: number;
  }>;
  attempt_timeline: Array<{ date: string; count: number }>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AIUsageStats {
  total_tokens: number;
  total_cost: number;
  by_provider: Array<{ provider: string; tokens: number; cost: number }>;
  by_project: Array<{ project_id: string; project_name: string; tokens: number; cost: number }>;
  timeline: Array<{ date: string; tokens: number; cost: number }>;
}
