const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

export async function verifyGoogleIdToken(idToken, env) {
  if (!idToken) {
    throw new Error('Google ID token is required');
  }

  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }

  const url = `${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Invalid Google ID token');
  }

  const payload = await response.json();

  if (payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error('Google token audience mismatch');
  }

  if (payload.email_verified !== 'true' && payload.email_verified !== true) {
    throw new Error('Google email is not verified');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || '',
    picture: payload.picture || ''
  };
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export function getBearerToken(request) {
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}
