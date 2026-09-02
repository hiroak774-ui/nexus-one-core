(() => {
  function simplifyLogin(doc) {
    if (!doc || doc.documentElement.dataset.nexusGoogleOnlyLogin === '1') return;
    const googleBtn = doc.getElementById('googleBtn');
    if (!googleBtn) return;

    doc.documentElement.dataset.nexusGoogleOnlyLogin = '1';

    const emailInput = doc.getElementById('emailInput');
    const emailLabel = doc.querySelector('label[for="emailInput"]');
    const emailButton = doc.getElementById('loginBtn') || doc.getElementById('emailBtn') || doc.getElementById('submitBtn');
    const divider = [...doc.querySelectorAll('.divider')].find(el => (el.textContent || '').trim().toUpperCase() === 'OR');

    if (emailInput) emailInput.style.display = 'none';
    if (emailLabel) emailLabel.style.display = 'none';
    if (emailButton && emailButton !== googleBtn) emailButton.style.display = 'none';
    if (divider) divider.style.display = 'none';

    const note = [...doc.querySelectorAll('p,div,span')].find(el =>
      /初回利用・端末変更・再認証時に使用します/.test(el.textContent || '') && el.children.length === 0
    );
    if (note) note.textContent = 'Googleアカウントでログインしてください。';

    googleBtn.style.marginTop = '8px';
    googleBtn.style.width = '100%';
  }

  function scan() {
    document.querySelectorAll('#nexus-root iframe').forEach(frame => {
      try { simplifyLogin(frame.contentDocument); } catch (_) {}
      if (!frame.dataset.nexusLoginUiListener) {
        frame.dataset.nexusLoginUiListener = '1';
        frame.addEventListener('load', () => {
          try { simplifyLogin(frame.contentDocument); } catch (_) {}
        });
      }
    });
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', scan);
  scan();
})();
