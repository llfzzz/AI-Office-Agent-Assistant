import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveRagContext } from '../server/rag.js';

function stubContext(documents) {
  return {
    user: { id: 'u1' },
    pb: {
      collection() {
        return {
          async getFullList() {
            return documents;
          },
        };
      },
    },
  };
}

const docs = [
  {
    id: 'd1',
    title: '产品背景',
    content: '我们的产品叫会议助手，使用 Gemini 接口。术语：RAG 检索用于补充背景资料。',
    created: '',
    updated: '',
  },
];

test('retrieveRagContext returns disabled when the option is off', async () => {
  const result = await retrieveRagContext(stubContext(docs), '任意查询', { enabled: false });
  assert.equal(result.enabled, false);
  assert.deepEqual(result.sources, []);
  assert.equal(result.context, '');
});

test('retrieveRagContext returns disabled when there are no documents', async () => {
  const result = await retrieveRagContext(stubContext([]), '查询', { enabled: true });
  assert.equal(result.enabled, false);
});

test('retrieveRagContext ranks and returns matching chunks', async () => {
  const result = await retrieveRagContext(stubContext(docs), 'Gemini 接口 检索', { enabled: true });
  assert.equal(result.enabled, true);
  assert.ok(result.sources.length >= 1);
  assert.equal(result.sources[0].document_id, 'd1');
  assert.ok(result.context.includes('会议助手'));
});

test('retrieveRagContext still supplies fallback context when nothing matches', async () => {
  const result = await retrieveRagContext(stubContext(docs), 'zzzzzzzz', { enabled: true });
  assert.equal(result.enabled, true);
  assert.ok(result.sources.length >= 1);
});
