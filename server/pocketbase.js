import PocketBase from 'pocketbase';

export const pocketBaseUrl = process.env.PB_URL || 'http://127.0.0.1:8090';

export function createPocketBaseClient(token = '') {
  const pb = new PocketBase(pocketBaseUrl);
  pb.autoCancellation(false);

  if (token) {
    pb.authStore.save(token, null);
  }

  return pb;
}

export function getBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

export async function requireAuth(req) {
  const token = getBearerToken(req);

  if (!token) {
    const error = new Error('请先登录');
    error.status = 401;
    throw error;
  }

  const pb = createPocketBaseClient(token);

  try {
    const authData = await pb.collection('users').authRefresh();
    return {
      pb,
      token: pb.authStore.token,
      user: authData.record,
    };
  } catch {
    const error = new Error('登录已失效，请重新登录');
    error.status = 401;
    throw error;
  }
}

export async function checkPocketBase() {
  const pb = createPocketBaseClient();

  try {
    await pb.health.check();
    return { ok: true, url: pocketBaseUrl };
  } catch (error) {
    return {
      ok: false,
      url: pocketBaseUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
