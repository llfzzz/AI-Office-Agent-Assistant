import http from 'k6/http';
import { check } from 'k6';
import { PB_URL, authHeaders } from '../config.js';

// Deletes a throwaway user directly via PocketBase's REST API (same call
// scripts/verify-memory-save.mjs uses in its `finally` block). Cascade-delete
// on every user-owned collection means this one call is complete teardown.
export function deleteThrowawayUser(session) {
  if (!session || !session.token || !session.userId) {
    return;
  }

  const res = http.del(
    `${PB_URL}/api/collections/users/records/${session.userId}`,
    null,
    { headers: authHeaders(session.token), tags: { name: 'teardown_delete_user' } },
  );

  check(res, {
    'test account cleanup ok (200/204)': (r) => r.status === 200 || r.status === 204,
  });
}

export function deleteThrowawayUsers(sessions) {
  (sessions || []).forEach(deleteThrowawayUser);
}
