const LEGACY_GAS_URL = 'https://script.google.com/macros/s/AKfycbwiV9vLacv8se1UVdGhhKuoWkSlsNReRJOUIgT494XUMBNUKBOxMhkzXLsvHRdCfWIt/exec';

function sanitizeLegacyStaffShell(html) {
  return html
    .replaceAll(LEGACY_GAS_URL, 'about:blank')
    .replace("['home','attendance','application','mypage'].forEach(k=>ensureFrame(k));", '')
    .replaceAll('loadHomeData();', 'void 0;')
    .replaceAll('loadAttendanceData();', 'void 0;')
    .replaceAll('loadApplicationData();', 'void 0;')
    .replaceAll('loadMypage();', 'void 0;')
    .replaceAll('checkStatus(false).catch(()=>{});', 'void 0;')
    .replace(/ITキャリアアップシステム/g, '株式会社がんばる')
    .replace(/ITキャリア/g, '株式会社がんばる')
    .replace(/\bITC\b/g, 'GANBARU')
    .replace(/HR COMPANY(?!株式会社)/g, 'HR COMPANY株式会社');
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();

  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  html = sanitizeLegacyStaffShell(html);

  const scriptTag = '<script src="/nexus-auth-client.js"></script>';
  if (!html.includes('/nexus-auth-client.js')) {
    const lower = html.toLowerCase();
    const bodyIndex = lower.lastIndexOf('</body>');
    html = bodyIndex >= 0
      ? html.slice(0, bodyIndex) + scriptTag + html.slice(bodyIndex)
      : html + scriptTag;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
