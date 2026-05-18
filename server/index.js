import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeMeeting, answerQuestion, planOfficeTask, runOfficeSkill, summarizeFeedback } from './analyzer.js';
import { getProviderMeta } from './gptsapi.js';
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
import { checkPocketBase, createPocketBaseClient, requireAuth } from './pocketbase.js';
import { transcribeAudio } from './transcriber.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', 'dist');

app.use(express.json({ limit: '2mb' }));

function sendError(res, error, fallbackStatus = 500) {
  const status = typeof error?.status === 'number' ? error.status : fallbackStatus;
  res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
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

function readAiProvider(req) {
  const mode = String(req.get('x-ai-provider-mode') || 'default').trim();
  const model = String(req.get('x-ai-model') || '').trim();

  if (mode === 'custom') {
    return {
      mode: 'custom',
      api_key: String(req.get('x-ai-api-key') || '').trim(),
      base_url: String(req.get('x-ai-base-url') || '').trim(),
      model,
    };
  }

  return model ? { model } : {};
}

app.get('/api/health', async (_req, res) => {
  const database = await checkPocketBase();
  res.json({
    ok: true,
    provider: getProviderMeta(),
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

    const analysis = await analyzeMeeting(req.body, context, readAiProvider(req));
    res.json(analysis);
  } catch (error) {
    sendError(res, error);
  }
});

app.post(
  '/api/audio/transcribe',
  express.raw({
    type: ['audio/*', 'video/mp4', 'video/webm', 'application/octet-stream'],
    limit: '25mb',
  }),
  async (req, res) => {
    try {
      await requireAuth(req);
      const result = await transcribeAudio(req.body, {
        mimeType: req.get('content-type'),
        fileName: req.get('x-file-name'),
        language: req.get('x-audio-language'),
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  },
);

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

    const answer = await answerQuestion(meeting, question, readAiProvider(req));
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

    const result = await planOfficeTask(req.body, context, readAiProvider(req));
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

    const result = await runOfficeSkill(req.body, context, readAiProvider(req));
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
    }, readAiProvider(req));
    const feedback = await saveOfficeFeedback(context, req.params.id, req.body, feedbackSummary);
    res.status(201).json({ feedback });
  } catch (error) {
    sendError(res, error);
  }
});

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`AI Office Agent Assistant API running on http://localhost:${port}`);
});
