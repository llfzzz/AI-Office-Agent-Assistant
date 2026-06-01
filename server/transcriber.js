import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { filePartFromBuffer, generateContent } from './gemini.js';

const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/flac',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/mpga',
  'audio/m4a',
  'audio/aac',
  'audio/aiff',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-aiff',
  'audio/x-m4a',
  'audio/x-wav',
  'video/mp4',
  'video/webm',
  'application/octet-stream',
]);

const TRANSCODE_AUDIO_TYPES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/webm',
  'audio/x-m4a',
  'video/mp4',
  'video/webm',
]);

function extensionFromType(mimeType) {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('flac')) return 'flac';
  if (mimeType.includes('aiff')) return 'aiff';
  if (mimeType.includes('aac')) return 'aac';
  if (mimeType.includes('m4a')) return 'm4a';
  return 'webm';
}

function extensionFromName(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function shouldTranscode(mimeType, fileName) {
  return TRANSCODE_AUDIO_TYPES.has(mimeType) || ['m4a', 'mp4', 'webm'].includes(extensionFromName(fileName));
}

function transcodeToFlac(buffer) {
  const binary = process.env.FFMPEG_PATH || ffmpegPath;
  const timeoutMs = Number(process.env.GEMINI_AUDIO_CONVERT_TIMEOUT_MS || 60000);

  if (!binary) {
    throw new Error('浏览器录音转换需要 ffmpeg，但服务器没有找到可执行文件');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binary, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'flac',
      'pipe:1',
    ]);
    const output = [];
    const errors = [];
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`浏览器录音转换超时：${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`浏览器录音转换失败：${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        const detail = Buffer.concat(errors).toString('utf8').trim();
        reject(new Error(`浏览器录音转换失败${detail ? `：${detail}` : ''}`));
        return;
      }

      const converted = Buffer.concat(output);
      if (!converted.length) {
        reject(new Error('浏览器录音转换后没有音频内容'));
        return;
      }

      resolve(converted);
    });
    child.stdin.end(buffer);
  });
}

async function prepareGeminiAudio(buffer, mimeType, fileName) {
  if (shouldTranscode(mimeType, fileName)) {
    return {
      buffer: await transcodeToFlac(buffer),
      fileName: `${fileName.replace(/\.[^.]+$/, '')}.flac`,
      mimeType: 'audio/flac',
    };
  }

  return {
    buffer,
    fileName,
    mimeType: mimeType === 'audio/x-wav'
      ? 'audio/wav'
      : mimeType === 'audio/x-aiff'
        ? 'audio/aiff'
        : mimeType,
  };
}

function safeDecodeFileName(value) {
  if (!value) return '';

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function transcribeAudio(buffer, meta = {}, provider = {}) {
  if (!buffer?.byteLength) {
    throw new Error('audio file is required');
  }

  const mimeType = String(meta.mimeType || 'application/octet-stream').split(';')[0].toLowerCase();
  if (!SUPPORTED_AUDIO_TYPES.has(mimeType)) {
    throw new Error(`unsupported audio type: ${mimeType}`);
  }

  const fileName = safeDecodeFileName(meta.fileName) || `meeting-audio.${extensionFromType(mimeType)}`;
  const audio = await prepareGeminiAudio(buffer, mimeType, fileName);
  const filePart = await filePartFromBuffer(audio.buffer, {
    fileName: audio.fileName,
    mimeType: audio.mimeType,
  }, { provider });
  const result = await generateContent(
    [
      {
        role: 'user',
        parts: [
          {
            text: [
              `文件名：${fileName}`,
              meta.language ? `语言：${meta.language}` : '',
              '请完整转写这段会议音频。只输出可直接用于会议纪要分析的纯文本；保留发言顺序、决策、待办、负责人、时间、风险和问题；不要输出 Markdown。',
            ].filter(Boolean).join('\n'),
          },
          filePart,
        ],
      },
    ],
    {
      provider,
      temperature: 0,
      max_tokens: 5000,
      timeout_ms: Number(process.env.GEMINI_AUDIO_TIMEOUT_MS || process.env.GEMINI_TIMEOUT_MS || 120000),
    },
  );

  return {
    text: result.text || '',
    model: result.model,
    provider: result.provider,
  };
}
