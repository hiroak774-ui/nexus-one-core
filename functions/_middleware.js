export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();

  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  if (html.includes('/nexus-auth-override.js')) return new Response(html, response);

  const script = '<script src="/nexus-auth-override.js"></script>';
  const lower = html.toLowerCase();
  const bodyIndex = lower.lastIndexOf('</body>');
  const injected = bodyIndex >= 0
    ? html.slice(0, bodyIndex) + script + html.slice(bodyIndex)
    : html + script;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
