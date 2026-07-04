import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkedMeetingsContext } from '../server/analyzer.js';

function stubContext(recordsById) {
  return {
    user: { id: 'u1' },
    pb: {
      collection() {
        return {
          async getOne(id) {
            if (recordsById[id]) {
              return recordsById[id];
            }
            const error = new Error('not found');
            error.status = 404;
            throw error;
          },
        };
      },
    },
  };
}

const records = {
  m1: {
    id: 'm1',
    title: '需求评审会',
    date: '2026-05-01',
    meeting_type: '需求评审',
    analysis: {
      structured_minutes: {
        meeting_type: '需求评审',
        one_sentence_summary: '确定第一版范围',
        decisions: [{ decision: '第一版只做文本输入', evidence: '会上明确', confidence: 'high' }],
        action_items: [{ task: '完成前端页面', owner: '小罗', deadline: '本周', priority: 'high', evidence: '' }],
      },
    },
    created: '',
    updated: '',
  },
};

test('buildLinkedMeetingsContext returns empty string when nothing is linked', async () => {
  assert.equal(await buildLinkedMeetingsContext(stubContext(records), []), '');
});

test('buildLinkedMeetingsContext renders title, summary, decisions and owners', async () => {
  const text = await buildLinkedMeetingsContext(stubContext(records), ['m1']);
  assert.ok(text.includes('需求评审会'));
  assert.ok(text.includes('确定第一版范围'));
  assert.ok(text.includes('第一版只做文本输入'));
  assert.ok(text.includes('完成前端页面（小罗）'));
});

test('buildLinkedMeetingsContext skips missing/deleted meetings', async () => {
  assert.equal(await buildLinkedMeetingsContext(stubContext(records), ['missing']), '');
});

test('buildLinkedMeetingsContext de-duplicates repeated ids', async () => {
  const text = await buildLinkedMeetingsContext(stubContext(records), ['m1', 'm1']);
  assert.equal(text.split('关联会议：').length - 1, 1);
});
