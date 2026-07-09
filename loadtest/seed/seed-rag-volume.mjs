#!/usr/bin/env node
// Seeds/tops-up knowledge docs + meetings for ONE dedicated load-test user, so
// loadtest/scenarios/06_rag_volume.js can sweep N in {10, 50, 200} against a
// single growing knowledge base (matching real usage) rather than three
// disjoint datasets. Follows the same register/use/cascade-delete convention
// as scripts/verify-ai-e2e.mjs and scripts/verify-memory-save.mjs.
//
// Usage:
//   node loadtest/seed/seed-rag-volume.mjs --target=10
//   node loadtest/seed/seed-rag-volume.mjs --target=50
//   node loadtest/seed/seed-rag-volume.mjs --target=200
//   node loadtest/seed/seed-rag-volume.mjs --cleanup
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, '..', '.state');
const STATE_FILE = path.join(STATE_DIR, 'rag-volume-session.json');

const apiBaseUrl = process.env.LOADTEST_BASE_URL || 'http://127.0.0.1:8788/api';
const pocketBaseUrl = process.env.LOADTEST_PB_URL || 'http://127.0.0.1:8090';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestJson(urlPath, options = {}) {
  const res = await fetch(`${apiBaseUrl}${urlPath}`, options);
  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`${urlPath} failed (${res.status}): ${payload.error || JSON.stringify(payload)}`);
  }

  return payload;
}

function authHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function registerUser() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const email = `loadtest-volume-${suffix}@example.com`;
  const password = `Loadtest-${suffix}-Aa1!`;

  const session = await requestJson('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Loadtest RAG Volume' }),
  });

  return {
    email,
    password,
    token: session.token,
    userId: session.user.id,
    knowledgeCount: 0,
    meetingCount: 0,
  };
}

const THEMES = ['项目排期', '客户反馈', '产品需求', '技术选型', '风险评估', '预算规划', '团队分工', '上线计划'];

function knowledgeContent(index) {
  const theme = THEMES[index % THEMES.length];
  const paragraph = `关于${theme}的资料 ${index}：本资料记录了${theme}相关的背景信息、关键决策和执行细节，供后续检索与引用。`.repeat(20);
  return { title: `资料库文档 ${index}（${theme}）`, content: paragraph };
}

function meetingContent(index) {
  return {
    title: `压测会议记录 ${index}`,
    date: '2026-07-09',
    meeting_type: '项目进度会',
    participants: '压测账号',
    raw_transcript: `会议 ${index}：我们决定继续推进本周计划，负责人为压测账号，本周五前完成。`,
    analysis: {
      source: 'demo-fallback',
      structured_minutes: {
        summary: `会议 ${index} 摘要`,
        one_sentence_summary: `会议 ${index} 摘要`,
        decisions: [{ decision: `会议 ${index} 决策`, evidence: '', confidence: 'high' }],
        action_items: [],
      },
      quality_check: { has_hallucination: false },
    },
  };
}

async function topUp(state, targetCount) {
  const addKnowledge = Math.max(0, targetCount - state.knowledgeCount);
  const addMeetings = Math.max(0, targetCount - state.meetingCount);

  for (let i = state.knowledgeCount; i < state.knowledgeCount + addKnowledge; i += 1) {
    await requestJson('/knowledge', {
      method: 'POST',
      headers: authHeaders(state.token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(knowledgeContent(i)),
    });
  }
  state.knowledgeCount += addKnowledge;

  for (let i = state.meetingCount; i < state.meetingCount + addMeetings; i += 1) {
    await requestJson('/meetings', {
      method: 'POST',
      headers: authHeaders(state.token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(meetingContent(i)),
    });
  }
  state.meetingCount += addMeetings;

  console.log(`topped up: +${addKnowledge} knowledge docs (total ${state.knowledgeCount}), +${addMeetings} meetings (total ${state.meetingCount})`);
}

async function cleanup() {
  const state = loadState();

  if (!state || state.cleaned) {
    console.log('no active seeded volume-test session found — nothing to clean up.');
    return;
  }

  const res = await fetch(`${pocketBaseUrl}/api/collections/users/records/${state.userId}`, {
    method: 'DELETE',
    headers: authHeaders(state.token),
  });

  console.log(
    res.ok
      ? 'volume-test account cleanup: ok (cascade removes its knowledge docs + meetings)'
      : `cleanup failed (${res.status}) — account may need manual removal via the PocketBase dashboard`,
  );

  saveState({ ...state, cleaned: true });
}

async function main() {
  const args = parseArgs();

  if (args.cleanup) {
    await cleanup();
    return;
  }

  const target = Number(args.target || 10);
  assert(Number.isFinite(target) && target > 0, 'usage: node seed-rag-volume.mjs --target=<N> | --cleanup');

  let state = loadState();
  if (!state || state.cleaned) {
    state = await registerUser();
    console.log(`registered dedicated volume-test user: ${state.email}`);
  }

  await topUp(state, target);
  saveState(state);

  console.log(`ready: target=${target}, userId=${state.userId} — run the k6 scenario now.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
