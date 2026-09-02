const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const PEOPLE_ME_URL = 'https://people.googleapis.com/v1/people/me?personFields=addresses';

function assertClientId(env) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }
}

export async function verifyGoogleIdToken(idToken, env) {
  if (!idToken) throw new Error('Google ID token is required');
  assertClientId(env);

  const response = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error('Invalid Google ID token');

  const payload = await response.json();
  if (payload.aud !== env.GOOGLE_CLIENT_ID) throw new Error('Google token audience mismatch');
  if (payload.email_verified !== 'true' && payload.email_verified !== true) {
    throw new Error('Google email is not verified');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || '',
    picture: payload.picture || '',
    scopes: ''
  };
}

export async function verifyGoogleAccessToken(accessToken, env) {
  if (!accessToken) throw new Error('Google access token is required');
  assertClientId(env);

  const tokenInfoResponse = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`, {
    headers: { Accept: 'application/json' }
  });
  if (!tokenInfoResponse.ok) throw new Error('Invalid Google access token');
  const tokenInfo = await tokenInfoResponse.json();

  const audience = tokenInfo.audience || tokenInfo.issued_to || '';
  if (audience !== env.GOOGLE_CLIENT_ID) throw new Error('Google token audience mismatch');
  if (tokenInfo.verified_email !== true && tokenInfo.verified_email !== 'true') {
    throw new Error('Google email is not verified');
  }

  const userInfoResponse = await fetch(USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });
  if (!userInfoResponse.ok) throw new Error('Failed to load Google profile');
  const userInfo = await userInfoResponse.json();

  return {
    sub: userInfo.sub || tokenInfo.user_id || '',
    email: userInfo.email || tokenInfo.email || '',
    name: userInfo.name || '',
    picture: userInfo.picture || '',
    scopes: tokenInfo.scope || ''
  };
}

function chooseAddress(addresses) {
  if (!Array.isArray(addresses) || !addresses.length) return null;
  return addresses.find(a => a?.metadata?.primary) ||
    addresses.find(a => a?.type === 'home') ||
    addresses[0] || null;
}

export async function fetchGoogleAddress(accessToken) {
  if (!accessToken) return null;

  const response = await fetch(PEOPLE_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (response.status === 403 || response.status === 401) return null;
  if (!response.ok) return null;

  const payload = await response.json();
  const address = chooseAddress(payload.addresses);
  if (!address) return null;

  const region = address.region || '';
  const city = address.city || '';
  const street = address.streetAddress || '';
  const extended = address.extendedAddress || '';

  return {
    postalCode: address.postalCode || '',
    prefecture: region,
    cityAddress: city,
    streetAddress: street,
    building: extended,
    formattedValue: address.formattedValue || [region, city, street, extended].filter(Boolean).join(''),
    countryCode: address.countryCode || '',
    source: 'google'
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
