import { isConfigured } from './lib/supabase.js';
import { getRole, refreshRole } from './lib/auth.js';
import { initTheme } from './theme.js';
import { setAppbar, spinner } from './ui.js';

const screen = document.getElementById('screen');
const tabbar = document.getElementById('tabbar');

// 지금 화면이 떠날 때 불러야 할 정리 함수 (예: 댓글 실시간 구독 해제)
let cleanup = null;

const TABS = [
  { hash: '#/', label: '피드', emoji: '🍚' },
  { hash: '#/upload', label: '올리기', emoji: '📸', role: 'uploader' },
  { hash: '#/settings', label: '설정', emoji: '⚙️' },
];

// 화면은 필요할 때 불러온다. 특히 올리기 화면은 EXIF 라이브러리를 끌고 오는데(26KB),
// 평가자는 평생 안 쓰고 업로더도 앱을 켜는 그 순간에는 필요 없다.
const ROUTES = [
  { match: /^#\/login$/, load: () => import('./views/login.js'), open: true },
  { match: /^#\/?$/, load: () => import('./views/feed.js') },
  { match: /^#\/upload$/, load: () => import('./views/upload.js'), role: 'uploader' },
  {
    match: /^#\/rate\/([\w-]+)$/,
    load: () => import('./views/rate.js'),
    params: (m) => ({ id: m[1] }),
  },
  { match: /^#\/settings$/, load: () => import('./views/settings.js') },
];

initTheme();
window.addEventListener('hashchange', render);
boot();

// 저장된 익명 세션에 아직 역할이 붙어 있는지 서버에 한 번 확인하고 시작한다.
// (다른 기기에서 자리를 넘겨받은 경우 등을 여기서 걸러낸다)
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
  preloadViews();
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

  // 앞 화면이 붙여둔 것(실시간 구독 등)을 먼저 떼어낸다
  if (cleanup) {
    try {
      cleanup();
    } catch (err) {
      console.warn('화면 정리 중 오류:', err);
    }
    cleanup = null;
  }

  const params = route.params?.(hash.match(route.match)) ?? {};
  try {
    const { default: view } = await route.load();
    // 화면이 함수를 돌려주면 떠날 때 불러줄 정리 함수로 본다
    const teardown = await view(screen, params);
    if (typeof teardown === 'function') cleanup = teardown;
  } catch (err) {
    console.error(err);
    screen.innerHTML = `<div class="notice is-error"><b>화면을 그리지 못했어요</b><span>${err.message}</span></div>`;
  }
}

/** 첫 화면을 그리고 난 뒤, 한가할 때 나머지 화면을 미리 받아둔다. */
function preloadViews() {
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
  idle(() => {
    import('./views/settings.js');
    if (getRole() === 'uploader') import('./views/upload.js');
    else import('./views/rate.js');
  });
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
