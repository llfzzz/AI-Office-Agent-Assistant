import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { extractMeetingFile } from '../server/extractor.js';

// Minimal ZIP writer (local headers + central directory + EOCD) so we can test
// the office-document path without fixtures. The extractor ignores CRC/time.
function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, entry.data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(entry.method, 10);
    cen.writeUInt32LE(entry.data.length, 20);
    cen.writeUInt32LE(entry.uncompressedSize, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, name]));
    offset += 30 + name.length + entry.data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

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

test('extractMeetingFile extracts DOCX body text', async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>会议决定：下周一发布测试版</w:t></w:r></w:p></w:body></w:document>';
  const data = Buffer.from(xml, 'utf8');
  const docx = buildZip([
    { name: 'word/document.xml', data, uncompressedSize: data.length, method: 0 },
    { name: 'word/media/image1.png', data: Buffer.from('binary'), uncompressedSize: 6, method: 0 },
  ]);
  const result = await extractMeetingFile(docx, {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileName: 'minutes.docx',
  });
  assert.ok(result.text.includes('下周一发布测试版'));
});

test('extractMeetingFile rejects a zip bomb instead of inflating it', async () => {
  // 30 MB of identical bytes deflates to ~30 KB — over the 24 MB per-entry cap.
  const huge = Buffer.alloc(30 * 1024 * 1024, 0x41);
  const bomb = buildZip([
    { name: 'word/document.xml', data: deflateRawSync(huge), uncompressedSize: huge.length, method: 8 },
  ]);
  await assert.rejects(
    () => extractMeetingFile(bomb, {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'bomb.docx',
    }),
    (error) => {
      assert.equal(error.status, 400);
      assert.ok(/文档内容过大/.test(error.message));
      return true;
    },
  );
});

test('extractMeetingFile gives a clear error for images without an AI provider', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  await assert.rejects(
    () => extractMeetingFile(png, { mimeType: 'image/png', fileName: 'board.png' }),
    (error) => {
      assert.equal(error.status, 400);
      assert.ok(/未配置可用的 AI Provider/.test(error.message));
      return true;
    },
  );
});
