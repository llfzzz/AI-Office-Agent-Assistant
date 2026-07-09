#!/usr/bin/env node
// Hand-builds adversarial + legitimate ZIP fixtures (DOCX-shaped) against the
// exact byte layout server/extractor.js's extractZipEntries parses (PK
// central-directory / local-header / end-of-central-directory records) — not
// full OOXML documents, just enough structure to exercise the per-entry
// (24MB) and total (64MB) decompression caps on POST /api/files/extract.
// k6's JS runtime (goja) has no zlib, so these must be pre-built here, not
// generated inside a k6 script.
//
// Usage: node loadtest/seed/generate-zip-fixtures.mjs
import { deflateRawSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
mkdirSync(FIXTURES_DIR, { recursive: true });

const MB = 1024 * 1024;

function xmlEntry(text) {
  return Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    'utf8',
  );
}

// Highly-compressible filler: a single repeated byte deflates to a few bytes
// regardless of logical size, so multi-megabyte inflated entries stay cheap
// and fast to both generate and upload (the compressed fixture on disk is
// tiny; only the SERVER'S inflation of it is large — that's the point).
function fillerXml(uncompressedBytes) {
  const prefix = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:body><w:p><w:r><w:t>',
    'utf8',
  );
  const suffix = Buffer.from('</w:t></w:r></w:p></w:body></w:document>', 'utf8');
  const fillerSize = Math.max(0, uncompressedBytes - prefix.length - suffix.length);
  const filler = Buffer.alloc(fillerSize, 0x41); // 'A' repeated
  return Buffer.concat([prefix, filler, suffix]);
}

// --- Minimal ZIP writer, matching exactly the fields server/extractor.js reads ---
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const compressed = entry.store ? entry.data : deflateRawSync(entry.data);
    const method = entry.store ? 0 : 8;
    const nameBuf = Buffer.from(entry.name, 'utf8');

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14); // crc-32: never checked by the server parser
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const localRecord = Buffer.concat([localHeader, nameBuf, compressed]);
    const localHeaderOffset = offset;
    localParts.push(localRecord);
    offset += localRecord.length;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localHeaderOffset, 42);

    centralParts.push(Buffer.concat([centralHeader, nameBuf]));
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(localSection.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localSection, centralSection, eocd]);
}

function writeFixture(name, entries) {
  const zip = buildZip(entries);
  writeFileSync(path.join(FIXTURES_DIR, name), zip);
  console.log(`${name}: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, upload size ${(zip.length / 1024).toFixed(1)} KB`);
}

writeFixture('valid-small.docx', [
  { name: 'word/document.xml', data: xmlEntry('Load test fixture: valid small DOCX.') },
]);

// Legitimate large document: one entry just under the 24MB per-entry cap -> expect 200.
writeFixture('near-cap-valid.docx', [
  { name: 'word/document.xml', data: fillerXml(20 * MB) },
]);

// Trips the per-entry cap: one entry inflating past 24MB -> expect 400.
writeFixture('trip-entry-cap.docx', [
  { name: 'word/document.xml', data: fillerXml(30 * MB) },
]);

// Trips the cumulative cap: 4 matched entries, each under 24MB alone, summing past 64MB -> expect 400.
writeFixture('trip-total-cap.docx', [
  { name: 'word/document.xml', data: fillerXml(20 * MB) },
  { name: 'word/footnotes.xml', data: fillerXml(20 * MB) },
  { name: 'word/endnotes.xml', data: fillerXml(20 * MB) },
  { name: 'word/comments.xml', data: fillerXml(20 * MB) },
]);

console.log('Fixtures written to', FIXTURES_DIR);
