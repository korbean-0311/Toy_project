import { getRole } from '../lib/auth.js';
import { peekMeals, loadMeals, setMeals, stampMeals } from '../lib/mealcache.js';
import { esc } from '../lib/format.js';
import { openCard, slimCard, bindCards } from './mealcard.js';
import { setAppbar, spinner, errorBox, toast, go } from '../ui.js';

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

export default async function feed(root) {
  const role = getRole();
  let meals = peekMeals() ?? [];

  setAppbar(`
    <div class="appbar-row">
      <span class="brand">🍚 학식 평점</span>
      <button class="icon-btn" id="calBtn" aria-label="달력으로 보기">📅</button>
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

  document.getElementById('calBtn').addEventListener('click', () => go('#/calendar'));

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

  if (meals.length) {
    renderChips();
    paint();
  } else {
    root.innerHTML = spinner();
  }

  try {
    const fresh = await loadMeals();
    const isNew = stampMeals(fresh) !== stampMeals(meals);
    meals = fresh;
    if (isNew || !root.querySelector('.stories, .notice')) {
      renderChips();
      paint();
    }
  } catch (err) {
    // 이미 뭔가 그려져 있으면 화면을 날리지 않고 알려만 준다
    if (!meals.length) root.innerHTML = errorBox(esc(err.message));
    else toast('새로 불러오지 못했어요', { error: true });
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
      .map((m) =>
        m.id === latestId || expanded.has(m.id)
          ? openCard(m, { role, collapsible: m.id !== latestId })
          : slimCard(m, { role }),
      )
      .join('')}</div>`;

    bindCards(root, {
      getMeals: () => meals,
      onDeleted: (id) => {
        meals = setMeals(meals.filter((m) => m.id !== id));
        renderChips();
        paint();
      },
      onToggle: (id) => {
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        paint();
      },
    });
  }
}
