import { isConfigured } from './lib/supabase.js';
import { getRole, refreshRole } from './lib/auth.js';
import { initTheme } from './theme.js';
import { setAppbar, spinner } from './ui.js';

import login from './views/login.js';
import feed from './views/feed.js';
import upload from './views/upload.js';
import rate from './views/rate.js';
import settings from './views/settings.js';

const screen = document.getElementById('screen');
const tabbar = document.getElementById('tabbar');

const TABS = [
  { hash: '#/', label: '피드', emoji: '🍚' },
  { hash: '#/upload', label: '올리기', emoji: '📸', role: 'uploader' },
  { hash: '#/settings', label: '설정', emoji: '⚙️' },
];

const ROUTES = [
  { match: /^#\/login$/, view: login, open: true },
  { match: /^#\/?$/, view: feed },
  { match: /^#\/upload$/, view: upload, role: 'uploader' },
  { match: /^#\/rate\/([\w-]+)$/, view: rate, params: (m) => ({ id: m[1] }) },
  { match: /^#\/settings$/, view: settings },
];

initTheme();
window.addEventListener('hashchange', render);
boot();

// 저장된 익명 세션에 아직 역할이 붙어 있는지 서버에 한 번 확인하고 시작한다.
// (다른 기기에서 슬롯을 놓아버린 경우 등을 여기서 걸러낸다)
async function boot() {
  if (!isConfigured) return setupNotice();

  // 브라우저가 저장공간을 함부로 비우지 못하게 막아둔다.
  // 이게 걸려 있어야 세션이 오래 버틴다 (특히 iOS).
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* 지원 안 하면 그냥 넘어간다 */
  }

  screen.innerHTML = spinner('들어가는 중');
  try {
    await refreshRole();
  } catch {
    // 오프라인이면 캐시된 역할로 그냥 진행한다
  }
  render();
}

async function render() {
  const hash = location.hash || '#/';

  if (!isConfigured) return setupNotice();

  const route = ROUTES.find((r) => r.match.test(hash));
  if (!route) return go('#/');

  const role = getRole();

  // 역할이 없으면 PIN 화면으로. 공유 링크로 들어온 경우를 위해 목적지를 기억해둔다.
  if (!route.open && !role) {
    if (hash !== '#/') sessionStorage.setItem('hakshik.next', hash);
    return go('#/login');
  }

  if (route.role && role !== route.role) return go('#/');

  paintTabs(hash, role);
  screen.scrollTop = 0;

  const params = route.params?.(hash.match(route.match)) ?? {};
  try {
    await route.view(screen, params);
  } catch (err) {
    console.error(err);
    screen.innerHTML = `<div class="notice is-error"><b>화면을 그리지 못했어요</b><span>${err.message}</span></div>`;
  }
}

function paintTabs(hash, role) {
  if (!role) {
    tabbar.hidden = true;
    return;
  }

  const visible = TABS.filter((t) => !t.role || t.role === role);
  tabbar.innerHTML = visible
    .map(
      (t) => `
      <a class="tab ${isActive(hash, t.hash) ? 'is-on' : ''}" href="${t.hash}">
        <span class="tab-emoji">${t.emoji}</span>
        <span class="tab-label">${t.label}</span>
      </a>`,
    )
    .join('');
  tabbar.hidden = false;
}

function isActive(hash, tabHash) {
  if (tabHash === '#/') return hash === '#/' || hash === '#' || hash === '';
  return hash.startsWith(tabHash);
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function setupNotice() {
  tabbar.hidden = true;
  setAppbar(null);
  screen.innerHTML = `
    <div class="pad">
      <div class="notice is-error">
        <b>Supabase 설정이 비어 있어요</b>
        <span><code>js/config.js</code> 의 <code>SUPABASE_URL</code> 과
              <code>SUPABASE_ANON_KEY</code> 를 채워주세요.</span>
      </div>
      <p class="dim">Supabase 대시보드 → Project Settings → Data API 에서 복사할 수 있어요.</p>
    </div>`;
}
