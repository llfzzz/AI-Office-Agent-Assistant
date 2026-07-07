import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribeAudio } from '../server/transcriber.js';

test('transcribeAudio gives a clear error without an AI provider', async () => {
  await assert.rejects(
    () => transcribeAudio(Buffer.from('RIFFxxxxWAVE'), { mimeType: 'audio/wav', fileName: 'a.wav' }),
    (error) => {
      assert.equal(error.status, 400);
      assert.ok(/未配置可用的 AI Provider/.test(error.message));
      return true;
    },
  );
});

test('transcribeAudio rejects an empty buffer', async () => {
  await assert.rejects(() => transcribeAudio(Buffer.alloc(0), { mimeType: 'audio/wav' }));
});
