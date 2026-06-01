import { inflateRawSync } from 'node:zlib';
import { filePartFromBuffer, generateContent } from './gemini.js';

const MAX_EXTRACTED_CHARS = Number(process.env.MEETING_FILE_MAX_CHARS || process.env.GEMINI_FILE_MAX_CHARS || 24000);

const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/rtf',
  'application/xml',
  'application/x-ndjson',
  'text/calendar',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/plain',
  'text/tab-separated-values',
  'text/xml',
]);

const TEXT_EXTENSIONS = new Set([
  'adoc',
  'bash',
  'bat',
  'c',
  'cfg',
  'cmd',
  'conf',
  'cpp',
  'cs',
  'csv',
  'env',
  'fish',
  'go',
  'h',
  'hpp',
  'htm',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'jsonl',
  'jsx',
  'kt',
  'log',
  'markdown',
  'md',
  'org',
  'php',
  'ps1',
  'py',
  'rb',
  'rs',
  'rst',
  'rtf',
  'scala',
  'sh',
  'sql',
  'srt',
  'swift',
  'tex',
  'text',
  'toml',
  'ts',
  'tsv',
  'tsx',
  'txt',
  'vtt',
  'xml',
  'yaml',
  'yml',
  'zsh',
]);

const TEXT_FILE_NAMES = new Set([
  '.env',
  '.gitignore',
  'dockerfile',
  'makefile',
]);

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ODT_MIME_TYPE = 'application/vnd.oasis.opendocument.text';
const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const IMAGE_MIME_TYPES = new Set([
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function withStatus(error, status) {
  error.status = status;
  return error;
}

function safeDecodeFileName(value) {
  if (!value) return '';

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extensionFromName(fileName) {
  const normalized = String(fileName || '').trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1) : '';
}

function baseNameFromName(fileName) {
  return String(fileName || '').trim().toLowerCase().split(/[\\/]/).pop() || '';
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function xmlToText(value) {
  return cleanExtractedText(
    decodeXmlEntities(
      String(value || '')
        .replace(/<w:tab\s*\/>/g, '\t')
        .replace(/<a:br\s*\/>|<w:br\s*\/>/g, '\n')
        .replace(/<\/(?:w:p|a:p|text:p|text:h|row|si)>/g, '\n')
        .replace(/<[^>]+>/g, ' '),
    )
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+\n/g, '\n'),
  );
}

function cleanExtractedText(value) {
  const text = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  return text.length > MAX_EXTRACTED_CHARS
    ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[内容过长，已截断]`
    : text;
}

function isTextFile(mimeType, fileName) {
  return (
    mimeType.startsWith('text/') ||
    TEXT_MIME_TYPES.has(mimeType) ||
    TEXT_FILE_NAMES.has(baseNameFromName(fileName)) ||
    TEXT_EXTENSIONS.has(extensionFromName(fileName))
  );
}

function looksLikeTextBuffer(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));

  if (!sample.length) {
    return false;
  }

  let controlBytes = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 32 && ![9, 10, 12, 13].includes(byte)) {
      controlBytes += 1;
    }
  }

  const decoded = sample.toString('utf8');
  const replacementCount = (decoded.match(/\uFFFD/g) || []).length;

  return controlBytes / sample.length < 0.05 && replacementCount / Math.max(decoded.length, 1) < 0.02;
}

function isDocxFile(mimeType, fileName) {
  return mimeType === DOCX_MIME_TYPE || extensionFromName(fileName) === 'docx';
}

function isOdtFile(mimeType, fileName) {
  return mimeType === ODT_MIME_TYPE || extensionFromName(fileName) === 'odt';
}

function isPptxFile(mimeType, fileName) {
  return mimeType === PPTX_MIME_TYPE || extensionFromName(fileName) === 'pptx';
}

function isXlsxFile(mimeType, fileName) {
  return mimeType === XLSX_MIME_TYPE || extensionFromName(fileName) === 'xlsx';
}

function isImageFile(mimeType, fileName) {
  return IMAGE_MIME_TYPES.has(mimeType) || ['gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'webp'].includes(extensionFromName(fileName));
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }

  return -1;
}

function extractZipEntries(buffer) {
  const entries = new Map();
  const eocdOffset = findEndOfCentralDirectory(buffer);

  if (eocdOffset < 0) {
    throw withStatus(new Error('无法读取压缩文档结构'), 400);
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    if (buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      const compressed = buffer.subarray(dataStart, dataEnd);

      if (!fileName.endsWith('/')) {
        if (compressionMethod === 0) {
          entries.set(fileName, compressed);
        } else if (compressionMethod === 8) {
          entries.set(fileName, inflateRawSync(compressed));
        }
      }
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function extractZipXmlText(buffer, matcher) {
  const entries = extractZipEntries(buffer);
  const texts = [...entries.entries()]
    .filter(([name]) => matcher(name))
    .sort(([left], [right]) => left.localeCompare(right, 'en', { numeric: true }))
    .map(([_name, content]) => xmlToText(content.toString('utf8')))
    .filter(Boolean);

  return cleanExtractedText(texts.join('\n\n'));
}

function extractDocxText(buffer) {
  return extractZipXmlText(buffer, (name) =>
    /^word\/(?:document|footnotes|endnotes|comments)\.xml$/i.test(name) ||
    /^word\/(?:header|footer)\d+\.xml$/i.test(name),
  );
}

function extractOdtText(buffer) {
  return extractZipXmlText(buffer, (name) => name === 'content.xml');
}

function extractPptxText(buffer) {
  return extractZipXmlText(buffer, (name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name));
}

function extractXlsxText(buffer) {
  return extractZipXmlText(buffer, (name) =>
    name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/i.test(name),
  );
}

async function extractImageText(buffer, meta, provider = {}) {
  const mimeType = String(meta.mimeType || 'application/octet-stream').split(';')[0];
  const fileName = safeDecodeFileName(meta.fileName) || 'meeting-image';
  const filePart = await filePartFromBuffer(buffer, { fileName, mimeType }, { provider });

  try {
    const result = await generateContent(
      [
        {
          role: 'user',
          parts: [
            {
              text: `文件名：${fileName}\n请提取图片中的会议文字、截图、白板、PPT 或手写要点。保留决策、待办、负责人、时间、风险和问题。只输出简洁纯文本，不要输出 Markdown。`,
            },
            filePart,
          ],
        },
      ],
      {
        provider,
        temperature: 0.1,
        max_tokens: 1600,
        timeout_ms: Number(process.env.GEMINI_EXTRACT_TIMEOUT_MS || process.env.GEMINI_TIMEOUT_MS || 120000),
      },
    );
    const text = cleanExtractedText(result.text);

    if (!text) {
      throw new Error('图片未提取到可用于会议纪要的内容');
    }

    return {
      text,
      kind: 'image',
      model: result.model,
      provider: result.provider,
      warnings: [],
    };
  } catch (error) {
    throw error;
  }
}

export async function extractMeetingFile(buffer, meta = {}, provider = {}) {
  if (!buffer?.byteLength) {
    throw withStatus(new Error('file is required'), 400);
  }

  const mimeType = String(meta.mimeType || 'application/octet-stream').split(';')[0].toLowerCase();
  const fileName = safeDecodeFileName(meta.fileName) || 'meeting-file';

  if (isImageFile(mimeType, fileName)) {
    return extractImageText(buffer, { mimeType, fileName }, provider);
  }

  if (isDocxFile(mimeType, fileName) || isOdtFile(mimeType, fileName) || isPptxFile(mimeType, fileName) || isXlsxFile(mimeType, fileName)) {
    const text = isDocxFile(mimeType, fileName)
      ? extractDocxText(buffer)
      : isOdtFile(mimeType, fileName)
        ? extractOdtText(buffer)
        : isPptxFile(mimeType, fileName)
          ? extractPptxText(buffer)
          : extractXlsxText(buffer);

    if (!text) {
      throw withStatus(new Error('文件中没有提取到可用于会议纪要的文本'), 400);
    }

    return {
      text,
      kind: 'file',
      model: null,
      provider: null,
      warnings: text.includes('[内容过长，已截断]') ? ['文件内容过长，已截断后用于分析。'] : [],
    };
  }

  if (!isTextFile(mimeType, fileName) && !looksLikeTextBuffer(buffer)) {
    throw withStatus(
      new Error('当前会议内容提取支持图片、纯文本、Markdown、CSV、JSON、HTML、XML、RTF、DOCX、ODT、PPTX、XLSX，以及其他可识别的纯文本文件。旧版 DOC 或 PDF 请先导出为 DOCX 或文本后上传。'),
      415,
    );
  }

  const text = cleanExtractedText(buffer.toString('utf8'));

  if (!text) {
    throw withStatus(new Error('文件中没有提取到可用于会议纪要的文本'), 400);
  }

  return {
    text,
    kind: 'file',
    model: null,
    provider: null,
    warnings: text.includes('[内容过长，已截断]') ? ['文件内容过长，已截断后用于分析。'] : [],
  };
}
