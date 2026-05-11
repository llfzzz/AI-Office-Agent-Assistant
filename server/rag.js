const MIN_QUERY_TOKEN_LENGTH = 2;

function recordToDocument(record) {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    created_at: record.created,
    updated_at: record.updated,
  };
}

function tokenize(text) {
  const asciiTokens =
    String(text)
      .toLowerCase()
      .match(/[a-z0-9_]{2,}/g) || [];
  const cjkTokens = Array.from(String(text).matchAll(/[\u4e00-\u9fff]{2,}/g)).flatMap((match) => {
    const value = match[0];
    const tokens = [];
    for (let index = 0; index < value.length - 1; index += 1) {
      tokens.push(value.slice(index, index + 2));
    }
    return tokens;
  });

  return [...asciiTokens, ...cjkTokens].filter((token) => token.length >= MIN_QUERY_TOKEN_LENGTH);
}

function chunkDocument(document) {
  const normalized = document.content.replace(/\s+/g, ' ').trim();
  const chunks = [];
  const size = 700;
  const overlap = 120;

  for (let start = 0; start < normalized.length; start += size - overlap) {
    const content = normalized.slice(start, start + size).trim();
    if (content) {
      chunks.push({
        document_id: document.id,
        title: document.title,
        content,
      });
    }
  }

  return chunks;
}

export async function listKnowledgeDocuments(context) {
  const records = await context.pb.collection('knowledge_documents').getFullList({
    sort: '-updated',
  });
  return records.map(recordToDocument);
}

export async function saveKnowledgeDocument(context, input) {
  const title = String(input.title || '').trim() || '默认资料库';
  const content = String(input.content || '').trim();

  if (!content) {
    throw new Error('knowledge content is required');
  }

  const payload = {
    user: context.user.id,
    title,
    content,
  };

  if (input.id) {
    const record = await context.pb.collection('knowledge_documents').update(input.id, payload);
    return recordToDocument(record);
  }

  const record = await context.pb.collection('knowledge_documents').create(payload);
  return recordToDocument(record);
}

export async function retrieveRagContext(context, query, options = {}) {
  if (!options.enabled) {
    return { enabled: false, sources: [], context: '' };
  }

  const documents = await listKnowledgeDocuments(context);
  if (documents.length === 0) {
    return { enabled: false, sources: [], context: '' };
  }

  const queryTokens = new Set(tokenize(query));
  const chunks = documents.flatMap(chunkDocument);
  const ranked = chunks
    .map((chunk) => {
      const chunkTokens = tokenize(`${chunk.title} ${chunk.content}`);
      const score = chunkTokens.reduce((total, token) => total + (queryTokens.has(token) ? 1 : 0), 0);
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const sources = ranked.length > 0 ? ranked : chunks.slice(0, 2);
  const contextText = sources
    .map((source, index) => `资料 ${index + 1}｜${source.title}\n${source.content}`)
    .join('\n\n');

  return {
    enabled: true,
    sources: sources.map((source) => ({
      document_id: source.document_id,
      title: source.title,
      score: source.score || 0,
    })),
    context: contextText,
  };
}
