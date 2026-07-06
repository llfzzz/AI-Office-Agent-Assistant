import type {
  AnalysisResult,
  AuthSession,
  HealthResponse,
  KnowledgeDocument,
  FileExtractionResponse,
  MeetingInput,
  MeetingRecord,
  OfficeFeedbackInput,
  OfficeFeedbackRecord,
  OfficeOutputRecord,
  OfficeRunResult,
  OfficeTaskInput,
  QAEntry,
  TranscriptionResponse,
} from './types';
import type { AiConfig, AiConfigInput, AiProviderCatalog } from './aiProvider';

const AUTH_TOKEN_KEY = 'meeting-memory-auth-token';
const API_PREFIX = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

function apiUrl(path: string) {
  return `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

export function storeToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getHealth() {
  return requestJson<HealthResponse>(apiUrl('/health'));
}

export function registerUser(input: { email: string; password: string; name?: string }) {
  return requestJson<AuthSession>(apiUrl('/auth/register'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function loginUser(input: { email: string; password: string }) {
  return requestJson<AuthSession>(apiUrl('/auth/login'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getCurrentUser() {
  return requestJson<AuthSession>(apiUrl('/auth/me'));
}

export function analyzeMeeting(input: MeetingInput) {
  return requestJson<AnalysisResult>(apiUrl('/meetings/analyze'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function saveMeeting(input: MeetingInput, analysis: AnalysisResult) {
  return requestJson<{ meeting: MeetingRecord }>(apiUrl('/meetings'), {
    method: 'POST',
    body: JSON.stringify({ ...input, analysis }),
  });
}

export function listMeetings(params: { search?: string; type?: string } = {}) {
  const searchParams = new URLSearchParams();

  if (params.search) searchParams.set('search', params.search);
  if (params.type && params.type !== '全部') searchParams.set('type', params.type);

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return requestJson<{ meetings: MeetingRecord[] }>(apiUrl(`/meetings${suffix}`));
}

export function getMeeting(id: string) {
  return requestJson<{ meeting: MeetingRecord }>(apiUrl(`/meetings/${id}`));
}

export function askMeeting(id: string, question: string) {
  return requestJson<{ qa: QAEntry }>(apiUrl(`/meetings/${id}/ask`), {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export async function transcribeAudio(file: Blob, options: { fileName?: string; language?: string } = {}) {
  const token = getStoredToken();
  const response = await fetch(apiUrl('/audio/transcribe'), {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.fileName ? { 'X-File-Name': encodeURIComponent(options.fileName) } : {}),
      ...(options.language ? { 'X-Audio-Language': options.language } : {}),
    },
    body: file,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<TranscriptionResponse>;
}

export async function extractMeetingFile(file: Blob, options: { fileName?: string } = {}) {
  const token = getStoredToken();
  const response = await fetch(apiUrl('/files/extract'), {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.fileName ? { 'X-File-Name': encodeURIComponent(options.fileName) } : {}),
    },
    body: file,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<FileExtractionResponse>;
}

export function listKnowledgeDocuments() {
  return requestJson<{ documents: KnowledgeDocument[] }>(apiUrl('/knowledge'));
}

export function saveKnowledgeDocument(input: { id?: string; title: string; content: string }) {
  return requestJson<{ document: KnowledgeDocument }>(apiUrl('/knowledge'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteKnowledgeDocument(id: string) {
  const token = getStoredToken();
  const headers = new Headers();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(`/knowledge/${id}`), {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
}

export function planOfficeTask(input: OfficeTaskInput) {
  return requestJson<Pick<OfficeRunResult, 'source' | 'provider' | 'warnings' | 'rag' | 'agent_plan'>>(apiUrl('/office/plan'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function runOfficeSkill(input: OfficeTaskInput) {
  return requestJson<OfficeRunResult>(apiUrl('/office/run'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function saveOfficeOutput(input: OfficeTaskInput, result: OfficeRunResult) {
  return requestJson<{ output: OfficeOutputRecord }>(apiUrl('/office/outputs'), {
    method: 'POST',
    body: JSON.stringify({ input, result }),
  });
}

export function listOfficeOutputs() {
  return requestJson<{ outputs: OfficeOutputRecord[] }>(apiUrl('/office/outputs'));
}

export function getOfficeOutput(id: string) {
  return requestJson<{ output: OfficeOutputRecord }>(apiUrl(`/office/outputs/${id}`));
}

export function submitOfficeFeedback(id: string, input: OfficeFeedbackInput) {
  return requestJson<{ feedback: OfficeFeedbackRecord }>(apiUrl(`/office/outputs/${id}/feedback`), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listOfficeFeedback() {
  return requestJson<{ feedback: OfficeFeedbackRecord[] }>(apiUrl('/office/feedback'));
}

// --- Per-user AI provider configurations ---------------------------------
export function getAiProviderCatalog() {
  return requestJson<AiProviderCatalog>(apiUrl('/ai-providers'));
}

export function listAiConfigs() {
  return requestJson<{ configs: AiConfig[]; encryption: { available: boolean } }>(apiUrl('/ai-configs'));
}

export function createAiConfig(input: AiConfigInput) {
  return requestJson<{ config: AiConfig }>(apiUrl('/ai-configs'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAiConfig(id: string, input: AiConfigInput) {
  return requestJson<{ config: AiConfig }>(apiUrl(`/ai-configs/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function setDefaultAiConfig(id: string) {
  return requestJson<{ config: AiConfig }>(apiUrl(`/ai-configs/${id}/default`), {
    method: 'POST',
  });
}

export function validateAiConfig(id: string) {
  return requestJson<{ config: AiConfig }>(apiUrl(`/ai-configs/${id}/validate`), {
    method: 'POST',
  });
}

export async function deleteAiConfig(id: string) {
  const token = getStoredToken();
  const headers = new Headers();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(`/ai-configs/${id}`), {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
}
