// 밝게 / 어둡게 전환.
//
// <html data-theme> 에 항상 'light' 또는 'dark' 를 명시적으로 찍는다.
// '시스템' 을 골랐을 때도 여기서 계산해서 찍으므로, CSS 는 [data-theme="dark"]
// 한 벌만 두면 된다. 첫 화면이 번쩍이지 않도록 index.html 의 인라인 스크립트가
// 같은 일을 먼저 해두고, 이 모듈은 그 뒤를 이어받는다.

const KEY = 'hakshik.theme';

export const MODES = [
  { id: 'system', label: '시스템' },
  { id: 'light', label: '밝게' },
  { id: 'dark', label: '어둡게' },
];

const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

export function getMode() {
  try {
    const saved = localStorage.getItem(KEY);
    return MODES.some((m) => m.id === saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function setMode(mode) {
  try {
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* 저장 못 해도 이번 세션 동안은 적용된다 */
  }
  apply();
}

/** 지금 실제로 보이는 테마 ('light' | 'dark'). */
export function resolvedTheme() {
  const mode = getMode();
  if (mode !== 'system') return mode;
  return darkQuery?.matches ? 'dark' : 'light';
}

export function initTheme() {
  apply();
  // 시스템을 따르는 동안에는 OS 설정이 바뀌면 바로 반영한다
  darkQuery?.addEventListener?.('change', () => {
    if (getMode() === 'system') apply();
  });
}

function apply() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;

  // 주소창·상태바 색까지 같이 맞춘다
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#15140f' : '#f7f6f3';
}
