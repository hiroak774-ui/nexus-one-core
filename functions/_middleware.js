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

function sanitizeLegacyAdminShell(html) {
  return html
    .replaceAll(LEGACY_GAS_URL, '')
    .replace(/ITキャリアアップシステム/g, '株式会社がんばる')
    .replace(/ITキャリア/g, '株式会社がんばる')
    .replace(/\bITC\b/g, 'GANBARU')
    .replace(/HR COMPANY(?!株式会社)/g, 'HR COMPANY株式会社');
}

const SETUP_SCROLL_FIX = `<script>
(() => {
  function fixSetupScroll(frame) {
    try {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!doc || win?.__NEXUS_VIEW_KEY !== 'setup') return;

      const content = doc.getElementById('setupContent') || doc.querySelector('.content');
      if (!content) return;

      doc.documentElement.style.height = '100%';
      doc.body.style.height = '100%';
      doc.body.style.overflow = 'hidden';

      content.style.height = '100%';
      content.style.minHeight = '0';
      content.style.overflowX = 'hidden';
      content.style.overflowY = 'auto';
      content.style.webkitOverflowScrolling = 'touch';
      content.style.touchAction = 'pan-y';
      content.style.overscrollBehaviorY = 'contain';
      content.style.paddingBottom = 'calc(36px + env(safe-area-inset-bottom))';
    } catch (_) {}
  }

  function scan() {
    document.querySelectorAll('#nexus-root iframe').forEach(frame => {
      fixSetupScroll(frame);
      if (frame.dataset.nexusSetupScrollBound === '1') return;
      frame.dataset.nexusSetupScrollBound = '1';
      frame.addEventListener('load', () => fixSetupScroll(frame));
    });
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', scan);
  scan();
})();
</script>`;

function injectBeforeBodyEnd(html, scripts) {
  if (!scripts.length) return html;
  const lower = html.toLowerCase();
  const bodyIndex = lower.lastIndexOf('</body>');
  return bodyIndex >= 0
    ? html.slice(0, bodyIndex) + scripts.join('') + html.slice(bodyIndex)
    : html + scripts.join('');
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();
  const isStaffShell = url.pathname === '/' || url.pathname === '/index.html';
  const isAdminShell = url.pathname === '/admin.html';

  if (!isStaffShell && !isAdminShell) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  const scripts = [];

  if (isStaffShell) {
    html = sanitizeLegacyStaffShell(html);

    if (!html.includes('/nexus-auth-client.js')) {
      scripts.push('<script src="/nexus-auth-client.js"></script>');
    }
    if (!html.includes('/nexus-staff-profile.js')) {
      scripts.push('<script src="/nexus-staff-profile.js"></script>');
    }
    if (!html.includes('/nexus-staff-runtime.js')) {
      scripts.push('<script src="/nexus-staff-runtime.js"></script>');
    }
    if (!html.includes('/nexus-admin-router.js')) {
      scripts.push('<script src="/nexus-admin-router.js"></script>');
    }
    if (!html.includes('nexusSetupScrollBound')) {
      scripts.push(SETUP_SCROLL_FIX);
    }
  }

  if (isAdminShell) {
    html = sanitizeLegacyAdminShell(html);

    if (!html.includes('id="nexusAdminAuthHide"')) {
      const style = '<style id="nexusAdminAuthHide">html{visibility:hidden!important}</style>';
      const headIndex = html.toLowerCase().indexOf('</head>');
      html = headIndex >= 0
        ? html.slice(0, headIndex) + style + html.slice(headIndex)
        : style + html;
    }
    if (!html.includes('/nexus-admin-auth.js')) {
      scripts.push('<script src="/nexus-admin-auth.js"></script>');
    }
    if (!html.includes('/nexus-admin-runtime.js')) {
      scripts.push('<script src="/nexus-admin-runtime.js"></script>');
    }
    if (!html.includes('/nexus-admin-actions.js')) {
      scripts.push('<script src="/nexus-admin-actions.js"></script>');
    }
  }

  html = injectBeforeBodyEnd(html, scripts);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
