import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeMeeting, answerQuestion, planOfficeTask, runOfficeSkill, summarizeFeedback } from './analyzer.js';
import { getProviderMeta } from './gemini.js';
import { isEncryptionAvailable } from './crypto.js';
import { publicCatalog } from './providers/catalog.js';
import {
  createAiConfig,
  deleteAiConfig,
  getActiveAiProvider,
  listAiConfigs,
  setDefaultAiConfig,
  updateAiConfig,
  validateAiConfig,
} from './aiConfigStore.js';
import { deleteKnowledgeDocument, listKnowledgeDocuments, saveKnowledgeDocument } from './rag.js';
import {
  appendQuestionAnswer,
  getMeeting,
  getOfficeOutput,
  listMeetings,
  listOfficeFeedback,
  listOfficeOutputs,
  saveMeeting,
  saveOfficeFeedback,
  saveOfficeOutput,
} from './storage.js';
import { checkPocketBase, createPocketBaseClient, pocketBaseUrl, requireAuth } from './pocketbase.js';
import { transcribeAudio } from './transcriber.js';
import { extractMeetingFile } from './extractor.js';

const app = express();
const port = Number(process.env.PORT || 8788);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', 'dist');
const appBasePath = String(process.env.APP_BASE_PATH || '/office-agent').replace(/\/$/, '');

// Serve transparently both behind a prefix-stripping reverse proxy and when
// addressed directly with the subpath (the Vite build uses base "/office-agent/",
// so direct requests arrive as /office-agent/api/... and /office-agent/assets/...).
app.use((req, _res, next) => {
  if (
    appBasePath &&
    appBasePath !== '/' &&
    (req.url === appBasePath || req.url.startsWith(`${appBasePath}/`) || req.url.startsWith(`${appBasePath}?`))
  ) {
    req.url = req.url.slice(appBasePath.length) || '/';
  }

  next();
});

// Lightweight request logging with a short correlation id. Logs method/path/status
// only — never request bodies, tokens, or query values — so it stays privacy-safe.
app.use((req, res, next) => {
  const requestId = randomUUID().slice(0, 8);
  res.locals.requestId = requestId;
  // Capture the path up front: mounted routers rewrite req.url during dispatch,
  // and req.path excludes the query string (which may carry user input).
  const requestPath = req.path;
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(`[api] ${requestId} ${req.method} ${requestPath} ${res.statusCode} ${durationMs.toFixed(0)}ms`);
  });

  next();
});

// Raw-body upload endpoints are registered before the JSON body parser:
// a global express.json() would otherwise consume an uploaded .json meeting
// file (parsing it into an object under the JSON body limit) before
// express.raw() could capture the Buffer.
app.post(
  '/api/audio/transcribe',
  express.raw({
    type: ['audio/*', 'video/mp4', 'video/webm', 'application/octet-stream'],
    limit: '25mb',
  }),
  async (req, res) => {
    try {
      const context = await requireAuth(req);
      const result = await transcribeAudio(req.body, {
        mimeType: req.get('content-type'),
        fileName: req.get('x-file-name'),
        language: req.get('x-audio-language'),
      }, await getActiveAiProvider(context));
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  },
);

app.post(
  '/api/files/extract',
  express.raw({
    type: '*/*',
    limit: '25mb',
  }),
  async (req, res) => {
    try {
      const context = await requireAuth(req);
      const result = await extractMeetingFile(req.body, {
        mimeType: req.get('content-type'),
        fileName: req.get('x-file-name'),
      }, await getActiveAiProvider(context));
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  },
);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));

function sendError(res, error, fallbackStatus = 500) {
  const status = typeof error?.status === 'number' ? error.status : fallbackStatus;
  const details = Object.entries(error?.data?.data || {})
    .map(([field, value]) => `${field}: ${value?.message || String(value)}`)
    .join('; ');
  const message = error instanceof Error ? error.message : String(error);
  const responseMessage = details ? `${message}: ${details}` : message;
  const requestId = res.locals?.requestId || '-';

  console.error(`[api] ${requestId} ${status}: ${responseMessage}`);
  res.status(status).json({ error: responseMessage });
}

function authPayload(authData) {
  return {
    token: authData.token,
    user: {
      id: authData.record.id,
      email: authData.record.email,
      name: authData.record.name || '',
    },
  };
}

app.get('/api/health', async (_req, res) => {
  const database = await checkPocketBase();
  res.json({
    ok: true,
    provider: getProviderMeta(),
    encryption: { available: isEncryptionAvailable() },
    database,
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();

    if (!email || !password) {
      res.status(400).json({ error: '邮箱和密码不能为空' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: '密码至少需要 8 位' });
      return;
    }

    const pb = createPocketBaseClient();
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name,
    });
    const authData = await pb.collection('users').authWithPassword(email, password);
    res.status(201).json(authPayload(authData));
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: '邮箱和密码不能为空' });
      return;
    }

    const pb = createPocketBaseClient();
    const authData = await pb.collection('users').authWithPassword(email, password);
    res.json(authPayload(authData));
  } catch {
    res.status(401).json({ error: '邮箱或密码不正确' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const context = await requireAuth(req);
    res.json({
      token: context.token,
      user: {
        id: context.user.id,
        email: context.user.email,
        name: context.user.name || '',
      },
    });
  } catch (error) {
    sendError(res, error, 401);
  }
});

app.post('/api/meetings/analyze', async (req, res) => {
  try {
    const context = await requireAuth(req);
    if (!req.body?.raw_transcript?.trim()) {
      res.status(400).json({ error: 'raw_transcript is required' });
      return;
    }

    const analysis = await analyzeMeeting(req.body, context, await getActiveAiProvider(context));
    res.json(analysis);
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/knowledge', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const documents = await listKnowledgeDocuments(context);
    res.json({ documents });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/knowledge', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const document = await saveKnowledgeDocument(context, req.body);
    res.status(201).json({ document });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.delete('/api/knowledge/:id', async (req, res) => {
  try {
    const context = await requireAuth(req);
    await deleteKnowledgeDocument(context, req.params.id);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 404);
  }
});

app.get('/api/meetings', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const meetings = await listMeetings(context, {
      search: req.query.search,
      type: req.query.type,
    });
    res.json({ meetings });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/meetings', async (req, res) => {
  try {
    const context = await requireAuth(req);
    if (!req.body?.analysis) {
      res.status(400).json({ error: 'analysis is required' });
      return;
    }

    const meeting = await saveMeeting(context, req.body);
    res.status(201).json({ meeting });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/meetings/:id', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const meeting = await getMeeting(context, req.params.id);

    if (!meeting) {
      res.status(404).json({ error: 'meeting not found' });
      return;
    }

    res.json({ meeting });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/meetings/:id/ask', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const question = String(req.body?.question || '').trim();

    if (!question) {
      res.status(400).json({ error: 'question is required' });
      return;
    }

    const meeting = await getMeeting(context, req.params.id);

    if (!meeting) {
      res.status(404).json({ error: 'meeting not found' });
      return;
    }

    const answer = await answerQuestion(meeting, question, await getActiveAiProvider(context));
    const qa = await appendQuestionAnswer(context, req.params.id, {
      question,
      ...answer,
    });

    res.json({ qa });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/office/plan', async (req, res) => {
  try {
    const context = await requireAuth(req);

    if (!req.body?.title && !req.body?.content) {
      res.status(400).json({ error: 'title or content is required' });
      return;
    }

    const result = await planOfficeTask(req.body, context, await getActiveAiProvider(context));
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/office/run', async (req, res) => {
  try {
    const context = await requireAuth(req);

    if (!req.body?.content?.trim()) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const result = await runOfficeSkill(req.body, context, await getActiveAiProvider(context));
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/office/outputs', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const outputs = await listOfficeOutputs(context);
    res.json({ outputs });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/office/outputs', async (req, res) => {
  try {
    const context = await requireAuth(req);

    if (!req.body?.input || !req.body?.result) {
      res.status(400).json({ error: 'input and result are required' });
      return;
    }

    const output = await saveOfficeOutput(context, req.body);
    res.status(201).json({ output });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/office/feedback', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const feedback = await listOfficeFeedback(context);
    res.json({ feedback });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/office/outputs/:id', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const output = await getOfficeOutput(context, req.params.id);

    if (!output) {
      res.status(404).json({ error: 'office output not found' });
      return;
    }

    res.json({ output });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/office/outputs/:id/feedback', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const output = await getOfficeOutput(context, req.params.id);

    if (!output) {
      res.status(404).json({ error: 'office output not found' });
      return;
    }

    const feedbackSummary = await summarizeFeedback({
      output,
      feedback: req.body,
    }, await getActiveAiProvider(context));
    const feedback = await saveOfficeFeedback(context, req.params.id, req.body, feedbackSummary);
    res.status(201).json({ feedback });
  } catch (error) {
    sendError(res, error);
  }
});

// Built-in provider catalog (labels, official base URLs, curated models). No
// secrets; requires auth for consistency. Source of truth lives in the backend.
app.get('/api/ai-providers', async (req, res) => {
  try {
    await requireAuth(req);
    res.json(publicCatalog());
  } catch (error) {
    sendError(res, error, 401);
  }
});

// --- Per-user AI provider configurations ---------------------------------
// Keys are encrypted at rest and never returned; responses carry masked hints
// only. Ownership is enforced by PocketBase collection rules (user token).
app.get('/api/ai-configs', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const configs = await listAiConfigs(context);
    res.json({ configs, encryption: { available: isEncryptionAvailable() } });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/ai-configs', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const config = await createAiConfig(context, req.body || {});
    res.status(201).json({ config });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.patch('/api/ai-configs/:id', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const config = await updateAiConfig(context, req.params.id, req.body || {});
    res.json({ config });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/ai-configs/:id/default', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const config = await setDefaultAiConfig(context, req.params.id);
    res.json({ config });
  } catch (error) {
    sendError(res, error, 404);
  }
});

app.post('/api/ai-configs/:id/validate', async (req, res) => {
  try {
    const context = await requireAuth(req);
    const config = await validateAiConfig(context, req.params.id);
    res.json({ config });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.delete('/api/ai-configs/:id', async (req, res) => {
  try {
    const context = await requireAuth(req);
    await deleteAiConfig(context, req.params.id);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 404);
  }
});

// Unknown API routes return JSON (not the SPA HTML fallback below).
app.use('/api', (req, res) => {
  res.status(404).json({ error: `未找到接口：${req.method} ${req.path}` });
});

if (existsSync(distPath)) {
  function setNoCacheHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      const normalizedPath = filePath.split(path.sep).join('/');

      if (normalizedPath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }

      if (normalizedPath.endsWith('/index.html')) {
        setNoCacheHeaders(res);
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    },
  }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    if (req.path.startsWith('/assets/') || path.extname(req.path)) {
      res.status(404).end();
      return;
    }

    setNoCacheHeaders(res);
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`AI Office Agent Assistant API running on http://localhost:${port}`);
  console.log('[config] AI provider: resolved per user from saved AI configs (demo mode without one)');
  console.log(`[config] PocketBase: ${pocketBaseUrl}`);
  console.log(
    `[config] AI config encryption: ${
      isEncryptionAvailable()
        ? 'enabled'
        : 'disabled — set AI_CONFIG_SECRET (>=16 chars) to allow per-user custom keys'
    }`,
  );
});
