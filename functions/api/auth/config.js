import { jsonResponse } from '../../_lib/googleAuth.js';

export function onRequestGet({ env }) {
  if (!env.GOOGLE_CLIENT_ID) {
    return jsonResponse({ ok: false, error: 'GOOGLE_CLIENT_ID is not configured' }, 500);
  }

  return jsonResponse({
    ok: true,
    clientId: env.GOOGLE_CLIENT_ID,
    scope: 'openid email profile https://www.googleapis.com/auth/user.addresses.read'
  });
}
