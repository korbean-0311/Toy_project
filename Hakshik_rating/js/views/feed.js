import { getRole } from '../lib/auth.js';
import { peekMeals, loadMeals, setMeals, stampMeals } from '../lib/mealcache.js';
import { esc } from '../lib/format.js';
import { openCard, slimCard, bindCards } from './mealcard.js';
import { setAppbar, spinner, errorBox, toast, go } from '../ui.js';

const SORTS = {
  recent: { label: '최신순', apply: (a, b) => new Date(b.taken_at) - new Date(a.taken_at) },
  stars: {
    label: '별점순',
    apply: (a, b) => (b.rating?.stars ?? -1) - (a.rating?.stars ?? -1),
  },
};

// 예전에 없앤 '식당' 정렬이 저장돼 있을 수 있으므로 걸러낸다
const savedSort = localStorage.getItem('hakshik.sort');
let sortKey = Object.hasOwn(SORTS, savedSort ?? '') ? savedSort : 'recent';
let placeFilter = 'all';

// 사진은 가장 최근 기록만 펼쳐두고 나머지는 접는다. 여기 담긴 건 사용자가 직접 펼친 것들.
const expanded = new Set();

export default async function feed(root) {
  const role = getRole();
  let meals = peekMeals() ?? [];

  setAppbar(`
    <div class="appbar-row">
      <span class="brand">🍚 자기는 뭘 먹을까?</span>
      <div class="seg" id="sortSeg">
        ${Object.entries(SORTS)
          .map(
            ([key, s]) =>
              `<button type="button" data-sort="${key}"
                       class="${key === sortKey ? 'is-on' : ''}">${s.label}</button>`,
          )
          .join('')}
      </div>
      <button class="icon-btn" id="calBtn" aria-label="달력으로 보기">📅</button>
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
    renderChips();
    paint();
  });

  placeRow.addEventListener('change', (e) => {
    if (e.target.id !== 'placeSel') return;
    placeFilter = e.target.value || 'all';
    renderChips();
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

    // 식당이 늘어나면 칩이 줄줄이 늘어서 가로로 넘친다. 고르는 건 드롭다운에 맡긴다.
    const picked = placeFilter !== 'all';

    placeRow.innerHTML = places.length
      ? `<div class="chips">
           <button type="button" class="chip ${picked ? '' : 'is-on'}" data-place="all">전체</button>
           <span class="chip-wrap ${picked ? 'is-on' : ''}">
             <span class="chip chip-face">
               ${picked ? esc(placeFilter) : '식당 선택'}
               <i class="chip-caret" aria-hidden="true">▾</i>
             </span>
             <select class="chip-native" id="placeSel" aria-label="식당 고르기">
               <option value="">식당 선택</option>
               ${places
                 .map(
                   (p) =>
                     `<option value="${esc(p)}" ${p === placeFilter ? 'selected' : ''}>${esc(p)}</option>`,
                 )
                 .join('')}
             </select>
           </span>
         </div>`
      : '';
  }

  function paint() {
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
          ? openCard(m, { role, collapsible: m.id !== latestId, eager: m.id === latestId })
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
