export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();

  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const scripts = [];
  if (!html.includes('/nexus-auth-client.js')) scripts.push('<script src="/nexus-auth-client.js"></script>');
  if (!html.includes('/nexus-login-ui.js')) scripts.push('<script src="/nexus-login-ui.js"></script>');

  if (!scripts.length) return new Response(html, response);

  const lower = html.toLowerCase();
  const bodyIndex = lower.lastIndexOf('</body>');
  const injected = bodyIndex >= 0
    ? html.slice(0, bodyIndex) + scripts.join('') + html.slice(bodyIndex)
    : html + scripts.join('');

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
