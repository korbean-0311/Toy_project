// 화면 공통 조각들

const toastEl = document.getElementById('toast');
let toastTimer;

export function toast(message, { error = false } = {}) {
  toastEl.textContent = message;
  toastEl.classList.toggle('is-error', error);
  toastEl.hidden = false;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

export function setAppbar(html) {
  const el = document.getElementById('appbar');
  el.innerHTML = html ?? '';
  el.hidden = !html;
}

export function spinner(label = '불러오는 중') {
  return `<div class="loading"><span class="spin" aria-hidden="true"></span>${label}</div>`;
}

export function errorBox(message) {
  return `<div class="notice is-error"><b>문제가 생겼어요</b><span>${message}</span></div>`;
}

export function go(hash) {
  location.hash = hash;
}

/**
 * 5개 별 위에서 반쪽 단위로 별점을 고르게 한다.
 * 별 하나를 좌/우 두 칸으로 나눠 각각 0.5 / 1.0 에 대응시킨다.
 */
export function starPicker({ value = 0, onChange } = {}) {
  const root = document.createElement('div');
  root.className = 'picker';
  root.innerHTML = `
    <div class="picker-stars" role="radiogroup" aria-label="별점"></div>
    <output class="picker-value"></output>`;

  const starsEl = root.querySelector('.picker-stars');
  const valueEl = root.querySelector('.picker-value');
  let current = value;

  for (let i = 1; i <= 5; i += 1) {
    const star = document.createElement('span');
    star.className = 'pick-star';
    star.innerHTML = `
      <span class="pick-fill"></span>
      <button type="button" class="pick-half" data-value="${i - 0.5}"
              role="radio" aria-label="${i - 0.5}점"></button>
      <button type="button" class="pick-half" data-value="${i}"
              role="radio" aria-label="${i}점"></button>`;
    starsEl.append(star);
  }

  starsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.pick-half');
    if (!btn) return;
    set(Number(btn.dataset.value));
  });

  function set(next) {
    current = next;
    starsEl.querySelectorAll('.pick-star').forEach((star, idx) => {
      const filled = Math.min(1, Math.max(0, current - idx));
      star.querySelector('.pick-fill').style.width = `${filled * 100}%`;
      star.querySelectorAll('.pick-half').forEach((b) => {
        b.setAttribute('aria-checked', String(Number(b.dataset.value) === current));
      });
    });
    valueEl.textContent = current ? `${current.toFixed(1)}점` : '별을 눌러 점수를 주세요';
    valueEl.classList.toggle('is-empty', !current);
    onChange?.(current);
  }

  set(current);
  root.getValue = () => current;
  return root;
}
