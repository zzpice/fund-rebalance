// Independent of the calculator: initialize synchronously before CSS or modules.
(() => {
  const key = 'zp-folio-theme';
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const preference = value => value === 'light' || value === 'dark' ? value : 'system';
  let mode = 'system';
  try { mode = preference(localStorage.getItem(key)); } catch {}
  const labels = {light: '浅色', dark: '深色', system: '跟随系统'};

  function apply() {
    const resolved = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
    root.dataset.themeMode = mode;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    document.getElementById('themeColor').content = resolved === 'dark' ? '#121619' : '#f6f7f8';
    root.style.backgroundColor = document.querySelector('meta[name="theme-color"]').content;
    document.querySelector('meta[name="color-scheme"]').content = resolved;
    document.querySelector('link[rel="manifest"]').href = resolved === 'dark' ? './manifest-dark.webmanifest' : './manifest.webmanifest';
    document.querySelectorAll('[name="appearance"]').forEach(input => { input.checked = input.value === mode; });
    const trigger = document.querySelector('.theme-menu summary');
    if (trigger) trigger.setAttribute('aria-label', `外观：${labels[mode]}（当前${labels[resolved]}）`);
  }
  apply();
  system.addEventListener('change', () => { if (mode === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) { mode = preference(event.newValue); apply(); }
  });
  window.addEventListener('pageshow', () => {
    try { mode = preference(localStorage.getItem(key)); } catch {}
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const menu = document.querySelector('.theme-menu');
    apply();
    menu.hidden = false;
    menu.addEventListener('change', event => {
      if (event.target.name !== 'appearance') return;
      mode = preference(event.target.value);
      try {
        if (mode === 'system') localStorage.removeItem(key);
        else localStorage.setItem(key, mode);
      } catch {}
      apply();
    });
    document.addEventListener('pointerdown', event => {
      if (!menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('focusin', event => {
      if (!menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
        event.preventDefault();
      }
    });
  });
})();
