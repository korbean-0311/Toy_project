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

// 사진은 가장 최근 기록만 펼쳐두고 나머지는 접는다. 여기 담긴 건 사용자가 직접 펼친 것들.
const expanded = new Set();

// 탭을 오갈 때마다 왕복 두 번(기록 조회 → URL 서명)을 기다리면 그동안 화면이 비어 있다.
// 마지막으로 받아둔 걸 먼저 그려놓고, 새로 받아온 게 다를 때만 갈아끼운다.
let cached = null;

export default async function feed(root) {
  const role = getRole();
  let meals = cached ?? [];

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

  const placeRow = document.getElementById('placeRow');

  document.getElementById('sortSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    sortKey = btn.dataset.sort;
    localStorage.setItem('hakshik.sort', sortKey);
    document.querySelectorAll('#sortSeg [data-sort]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.sort === sortKey);
    });
    paint(); // 정렬은 이미 받아둔 걸 다시 늘어놓는 것뿐이라 서버를 다시 부르지 않는다
  });

  placeRow.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-place]');
    if (!btn) return;
    placeFilter = btn.dataset.place;
    paint();
  });

  if (cached) {
    renderChips();
    paint();
  } else {
    root.innerHTML = spinner();
  }

  try {
    const fresh = await load();
    const isNew = stamp(fresh) !== stamp(meals);
    cached = fresh;
    meals = fresh;
    if (isNew || !root.querySelector('.stories, .notice')) {
      renderChips();
      paint();
    }
  } catch (err) {
    // 이미 뭔가 그려져 있으면 화면을 날리지 않고 알려만 준다
    if (!cached) root.innerHTML = errorBox(esc(err.message));
    else toast('새로 불러오지 못했어요', { error: true });
  }

  async function load() {
    const rows = await listMeals();
    const urls = await signedUrls(rows.map((m) => m.photo_path));
    return rows.map((m) => ({ ...m, url: urls.get(m.photo_path) ?? '' }));
  }

  /** 내용이 실제로 바뀌었는지 보는 지문. 같으면 다시 안 그린다. */
  function stamp(list) {
    return list
      .map((m) => `${m.id}:${m.rating?.stars ?? ''}:${m.rating?.comment ?? ''}:${m.url}`)
      .join('|');
  }

  function renderChips() {
    const places = [...new Set(meals.map((m) => m.cafeteria?.name).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ko'),
    );
    if (placeFilter !== 'all' && !places.includes(placeFilter)) placeFilter = 'all';

    placeRow.innerHTML = places.length
      ? `<div class="chips">
           <button type="button" class="chip ${placeFilter === 'all' ? 'is-on' : ''}" data-place="all">전체</button>
           ${places
             .map(
               (p) =>
                 `<button type="button" class="chip ${placeFilter === p ? 'is-on' : ''}"
                          data-place="${esc(p)}">${esc(p)}</button>`,
             )
             .join('')}
         </div>`
      : '';
  }

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

    // 가장 최근 것 하나만 사진을 펼쳐둔다. 정렬을 바꿔도 기준은 '찍은 시각' 그대로다.
    const latestId = meals.reduce(
      (best, m) => (!best || new Date(m.taken_at) > new Date(best.taken_at) ? m : best),
      null,
    )?.id;

    root.innerHTML = `<div class="stories">${shown
      .map((m) => (m.id === latestId || expanded.has(m.id) ? openCard(m, m.id !== latestId) : slimCard(m)))
      .join('')}</div>`;

    root.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => act(btn.dataset.action, btn.dataset.id));
    });

    root.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggle;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        paint();
      });
    });
  }

  /* 카드 내용은 펼친 것과 접은 것이 같다. 접힌 쪽은 사진 대신 글자만 놓는다. */

  function place(m) {
    return m.cafeteria
      ? `${esc(m.cafeteria.name)}${m.cafeteria.building ? ` · ${esc(m.cafeteria.building)}` : ''}`
      : '식당 미확인';
  }

  function actions(m) {
    if (!m.rating && role === 'rater') {
      return `<button class="btn btn-primary btn-sm" data-action="rate" data-id="${m.id}">평가하기</button>`;
    }
    if (role === 'uploader') {
      return `<button class="btn btn-ghost btn-sm" data-action="share" data-id="${m.id}">공유</button>
              <button class="btn btn-ghost btn-sm danger" data-action="delete" data-id="${m.id}">삭제</button>`;
    }
    return '';
  }

  function openCard(m, collapsible) {
    const taken = new Date(m.taken_at);
    const rated = m.rating
      ? `<div class="story-rating">
           <span class="stars">${starText(Number(m.rating.stars))}</span>
           <span class="stars-num">${Number(m.rating.stars).toFixed(1)}</span>
         </div>
         ${m.rating.comment ? `<p class="story-comment">${esc(m.rating.comment)}</p>` : ''}`
      : `<div class="story-pending">아직 평가 전</div>`;

    const buttons =
      actions(m) +
      (collapsible
        ? `<button class="btn btn-ghost btn-sm" data-toggle="${m.id}">접기</button>`
        : '');

    return `
      <article class="story">
        <img class="story-img" src="${esc(m.url)}" alt="" loading="lazy" />
        <div class="story-veil"></div>
        <div class="story-body">
          <div class="story-meta">
            <span class="pill">${MEAL_EMOJI[m.meal_type]} ${MEAL_LABEL[m.meal_type]}</span>
            <span class="pill">${esc(formatDate(taken))} ${esc(formatTime(taken))}</span>
          </div>
          <h2 class="story-place">${place(m)}</h2>
          ${rated}
          ${buttons ? `<div class="story-actions">${buttons}</div>` : ''}
        </div>
      </article>`;
  }

  function slimCard(m) {
    const taken = new Date(m.taken_at);
    const rated = m.rating
      ? `<div class="slim-rating">
           <span class="stars">${starText(Number(m.rating.stars))}</span>
           <span class="stars-num">${Number(m.rating.stars).toFixed(1)}</span>
         </div>
         ${m.rating.comment ? `<p class="slim-comment">${esc(m.rating.comment)}</p>` : ''}`
      : `<div class="slim-pending">아직 평가 전</div>`;

    const buttons = actions(m);

    return `
      <article class="slim">
        <div class="slim-head">
          <div class="slim-meta">
            <span class="pill">${MEAL_EMOJI[m.meal_type]} ${MEAL_LABEL[m.meal_type]}</span>
            <span class="pill">${esc(formatDate(taken))} ${esc(formatTime(taken))}</span>
          </div>
          <button class="slim-open" data-toggle="${m.id}" aria-label="사진 보기">🖼️</button>
        </div>
        <h2 class="slim-place">${place(m)}</h2>
        ${rated}
        ${buttons ? `<div class="slim-actions">${buttons}</div>` : ''}
      </article>`;
  }

  async function act(action, id) {
    const meal = meals.find((m) => m.id === id);
    if (!meal) return;

    if (action === 'rate') return go(`#/rate/${id}`);
    if (action === 'share') return shareMeal(meal);

    if (action === 'delete') {
      if (!confirm('이 기록을 지울까요? 되돌릴 수 없어요.')) return;
      try {
        await deleteMeal(meal);
        meals = meals.filter((m) => m.id !== id);
        cached = meals;
        toast('지웠어요');
        renderChips();
        paint();
      } catch (err) {
        toast(err.message, { error: true });
      }
    }
  }
}

/** 다른 화면에서 내용을 바꿨을 때, 피드가 옛 걸 먼저 그리지 않도록 버린다. */
export function invalidateFeed() {
  cached = null;
}
