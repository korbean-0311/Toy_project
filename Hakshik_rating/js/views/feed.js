import { listMeals, signedUrls, deleteMeal } from '../lib/store.js';
import { getRole } from '../lib/auth.js';
import { MEAL_LABEL, MEAL_EMOJI, formatDate, formatTime, starText, esc } from '../lib/format.js';
import { setAppbar, spinner, errorBox, toast, go } from '../ui.js';
import { shareMeal } from '../lib/share.js';

const SORTS = {
  recent: { label: '최신', apply: (a, b) => new Date(b.taken_at) - new Date(a.taken_at) },
  stars: {
    label: '별점',
    apply: (a, b) => (b.rating?.stars ?? -1) - (a.rating?.stars ?? -1),
  },
  place: {
    label: '식당',
    apply: (a, b) =>
      (a.cafeteria?.name ?? 'ㅎ힣').localeCompare(b.cafeteria?.name ?? 'ㅎ힣', 'ko') ||
      new Date(b.taken_at) - new Date(a.taken_at),
  },
};

let sortKey = localStorage.getItem('hakshik.sort') || 'recent';
let placeFilter = 'all';

export default async function feed(root) {
  const role = getRole();

  setAppbar(`
    <div class="appbar-row">
      <span class="brand">🍚 학식 평점</span>
      <div class="seg" id="sortSeg">
        ${Object.entries(SORTS)
          .map(
            ([key, s]) =>
              `<button type="button" data-sort="${key}"
                       class="${key === sortKey ? 'is-on' : ''}">${s.label}</button>`,
          )
          .join('')}
      </div>
    </div>
    <div class="appbar-row" id="placeRow"></div>`);

  root.innerHTML = spinner();

  let meals;
  try {
    meals = await listMeals();
    const urls = await signedUrls(meals.map((m) => m.photo_path));
    meals = meals.map((m) => ({ ...m, url: urls.get(m.photo_path) ?? '' }));
  } catch (err) {
    root.innerHTML = errorBox(esc(err.message));
    return;
  }

  const places = [...new Set(meals.map((m) => m.cafeteria?.name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );

  const placeRow = document.getElementById('placeRow');
  placeRow.innerHTML = `
    <div class="chips">
      <button type="button" class="chip ${placeFilter === 'all' ? 'is-on' : ''}" data-place="all">전체</button>
      ${places
        .map(
          (p) =>
            `<button type="button" class="chip ${placeFilter === p ? 'is-on' : ''}"
                     data-place="${esc(p)}">${esc(p)}</button>`,
        )
        .join('')}
    </div>`;

  document.getElementById('sortSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    sortKey = btn.dataset.sort;
    localStorage.setItem('hakshik.sort', sortKey);
    feed(root);
  });

  placeRow.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-place]');
    if (!btn) return;
    placeFilter = btn.dataset.place;
    paint();
  });

  paint();

  function paint() {
    placeRow.querySelectorAll('[data-place]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.place === placeFilter);
    });

    const shown = meals
      .filter((m) => placeFilter === 'all' || m.cafeteria?.name === placeFilter)
      .sort(SORTS[sortKey].apply);

    if (!shown.length) {
      root.innerHTML = `
        <div class="notice">
          <b>아직 기록이 없어요</b>
          <span>${
            role === 'uploader'
              ? '아래 올리기 탭에서 오늘 학식을 찍어 올려보세요.'
              : '상대가 학식을 올리면 여기에 쌓여요.'
          }</span>
        </div>`;
      return;
    }

    root.innerHTML = `<div class="stories">${shown.map(card).join('')}</div>`;

    root.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => act(btn.dataset.action, btn.dataset.id, shown));
    });
  }

  function card(m) {
    const taken = new Date(m.taken_at);
    const place = m.cafeteria
      ? `${esc(m.cafeteria.name)}${m.cafeteria.building ? ` · ${esc(m.cafeteria.building)}` : ''}`
      : '식당 미확인';

    const rated = m.rating
      ? `<div class="story-rating">
           <span class="stars">${starText(Number(m.rating.stars))}</span>
           <span class="stars-num">${Number(m.rating.stars).toFixed(1)}</span>
         </div>
         ${m.rating.comment ? `<p class="story-comment">${esc(m.rating.comment)}</p>` : ''}`
      : `<div class="story-pending">아직 평가 전</div>`;

    const action =
      !m.rating && role === 'rater'
        ? `<button class="btn btn-primary btn-sm" data-action="rate" data-id="${m.id}">평가하기</button>`
        : role === 'uploader'
          ? `<button class="btn btn-ghost btn-sm" data-action="share" data-id="${m.id}">공유</button>
             <button class="btn btn-ghost btn-sm danger" data-action="delete" data-id="${m.id}">삭제</button>`
          : '';

    return `
      <article class="story">
        <img class="story-img" src="${esc(m.url)}" alt="" loading="lazy" />
        <div class="story-veil"></div>
        <div class="story-body">
          <div class="story-meta">
            <span class="pill">${MEAL_EMOJI[m.meal_type]} ${MEAL_LABEL[m.meal_type]}</span>
            <span class="pill">${esc(formatDate(taken))} ${esc(formatTime(taken))}</span>
          </div>
          <h2 class="story-place">${place}</h2>
          ${rated}
          ${action ? `<div class="story-actions">${action}</div>` : ''}
        </div>
      </article>`;
  }

  async function act(action, id, shown) {
    const meal = shown.find((m) => m.id === id);
    if (!meal) return;

    if (action === 'rate') return go(`#/rate/${id}`);
    if (action === 'share') return shareMeal(meal);

    if (action === 'delete') {
      if (!confirm('이 기록을 지울까요? 되돌릴 수 없어요.')) return;
      try {
        await deleteMeal(meal);
        meals = meals.filter((m) => m.id !== id);
        toast('지웠어요');
        paint();
      } catch (err) {
        toast(err.message, { error: true });
      }
    }
  }
}
