import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMeetingFile } from '../server/extractor.js';

test('extractMeetingFile reads a plain-text buffer', async () => {
  const buffer = Buffer.from('会议决定：下周一发布测试版\n待办：开发完成接口联调', 'utf8');
  const result = await extractMeetingFile(buffer, { mimeType: 'text/plain', fileName: 'notes.txt' });
  assert.equal(result.kind, 'file');
  assert.ok(result.text.includes('下周一发布测试版'));
  assert.deepEqual(result.warnings, []);
});

test('extractMeetingFile truncates over-long content and warns', async () => {
  const buffer = Buffer.from('会'.repeat(30000), 'utf8');
  const result = await extractMeetingFile(buffer, { mimeType: 'text/plain', fileName: 'long.txt' });
  assert.ok(result.text.includes('[内容过长，已截断]'));
  assert.ok(result.warnings.length >= 1);
});

test('extractMeetingFile detects text by extension even without a text mime type', async () => {
  const buffer = Buffer.from('key = value\n# comment', 'utf8');
  const result = await extractMeetingFile(buffer, {
    mimeType: 'application/octet-stream',
    fileName: 'meeting.conf',
  });
  assert.ok(result.text.includes('key = value'));
});

test('extractMeetingFile rejects unsupported binary files', async () => {
  const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
  await assert.rejects(
    () => extractMeetingFile(buffer, { mimeType: 'application/x-thing', fileName: 'blob.bin' }),
    (error) => {
      assert.equal(error.status, 415);
      return true;
    },
  );
});

test('extractMeetingFile rejects an empty buffer', async () => {
  await assert.rejects(
    () => extractMeetingFile(Buffer.alloc(0), { mimeType: 'text/plain', fileName: 'empty.txt' }),
    (error) => {
      assert.equal(error.status, 400);
      return true;
    },
  );
});
