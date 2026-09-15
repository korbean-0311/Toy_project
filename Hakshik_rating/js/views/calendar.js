// 달력으로 지난 기록 찾기.
//
// 칸에는 그날 먹은 끼니 이모지만 놓는다 (점심/저녁 둘뿐이라 그걸로 충분하다).
// 기록이 있는 날만 누를 수 있고, 누르면 달력 바로 아래에 그날 카드가 펼쳐진다.

import { getRole } from '../lib/auth.js';
import { peekMeals, loadMeals, setMeals, stampMeals, dayKey } from '../lib/mealcache.js';
import { MEAL_EMOJI, MEAL_LABEL, esc } from '../lib/format.js';
import { openCard, bindCards } from './mealcard.js';
import { setAppbar, spinner, errorBox, toast, go } from '../ui.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MEAL_ORDER = ['lunch', 'dinner'];

export default async function calendar(root) {
  const role = getRole();
  let meals = peekMeals() ?? [];
  let byDay = new Map();

  // 보고 있는 달. 기록이 있으면 가장 최근 기록의 달에서 시작한다.
  let cursor = null;
  let selected = null;

  setAppbar(`
    <div class="appbar-row">
      <button class="back" id="backBtn" aria-label="뒤로">‹</button>
      <span class="brand">📅 달력</span>
    </div>`);
  document.getElementById('backBtn').addEventListener('click', () => go('#/'));

  if (meals.length) {
    regroup();
    render();
  } else {
    root.innerHTML = spinner();
  }

  try {
    const fresh = await loadMeals();
    const isNew = stampMeals(fresh) !== stampMeals(meals);
    meals = fresh;
    if (isNew || !root.querySelector('.cal')) {
      regroup();
      render();
    }
  } catch (err) {
    if (!meals.length) root.innerHTML = errorBox(esc(err.message));
    else toast('새로 불러오지 못했어요', { error: true });
  }

  function regroup() {
    byDay = new Map();
    for (const m of meals) {
      const key = dayKey(m.taken_at);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(m);
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => new Date(a.taken_at) - new Date(b.taken_at));
    }

    if (!cursor) {
      const newest = meals.reduce(
        (best, m) => (!best || new Date(m.taken_at) > new Date(best.taken_at) ? m : best),
        null,
      );
      const base = newest ? new Date(newest.taken_at) : new Date();
      cursor = new Date(base.getFullYear(), base.getMonth(), 1);
    }
    if (selected && !byDay.has(selected)) selected = null;
  }

  function render() {
    if (!meals.length) {
      root.innerHTML = `
        <div class="notice">
          <b>아직 기록이 없어요</b>
          <span>기록이 쌓이면 달력에서 날짜로 찾아볼 수 있어요.</span>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="pad">
        <div class="cal">
          <div class="cal-bar">
            <button type="button" class="cal-nav" id="prevMonth" aria-label="이전 달">‹</button>
            <span class="cal-month">${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월</span>
            <button type="button" class="cal-nav" id="nextMonth" aria-label="다음 달">›</button>
          </div>

          <div class="cal-week">
            ${WEEKDAYS.map(
              (d, i) => `<span class="cal-wd${i === 0 ? ' sun' : ''}">${d}</span>`,
            ).join('')}
          </div>

          <div class="cal-grid">${cells()}</div>
        </div>

        <div id="dayBlock">${dayBlock()}</div>
      </div>`;

    bind();
  }

  function cells() {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const todayKey = dayKey(new Date());

    const out = [];
    for (let i = 0; i < firstWeekday; i += 1) out.push('<span class="cal-cell is-blank"></span>');

    for (let date = 1; date <= lastDate; date += 1) {
      const key = dayKey(new Date(year, month, date));
      const list = byDay.get(key) ?? [];

      // 같은 끼니를 두 번 먹었어도 이모지는 하나만. 점심이 먼저 온다.
      const kinds = MEAL_ORDER.filter((k) => list.some((m) => m.meal_type === k));
      const marks = kinds.map((k) => `<i title="${MEAL_LABEL[k]}">${MEAL_EMOJI[k]}</i>`).join('');

      const cls = [
        'cal-cell',
        list.length ? 'has' : 'is-empty',
        key === selected ? 'is-on' : '',
        key === todayKey ? 'is-today' : '',
        new Date(year, month, date).getDay() === 0 ? 'sun' : '',
      ]
        .filter(Boolean)
        .join(' ');

      out.push(
        list.length
          ? `<button type="button" class="${cls}" data-day="${key}">
               <span class="cal-date">${date}</span>
               <span class="cal-marks">${marks}</span>
             </button>`
          : `<span class="${cls}"><span class="cal-date">${date}</span></span>`,
      );
    }

    return out.join('');
  }

  function dayBlock() {
    if (!selected) {
      return '<p class="cal-hint">기록이 있는 날짜를 누르면 그날 먹은 걸 볼 수 있어요.</p>';
    }

    const list = byDay.get(selected) ?? [];
    const [y, m, d] = selected.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];

    return `
      <div class="cal-day">
        <h2 class="cal-day-title">${m}월 ${d}일 (${weekday})</h2>
        <div class="stories">${list.map((meal) => openCard(meal, { role })).join('')}</div>
      </div>`;
  }

  function paintDay() {
    const host = root.querySelector('#dayBlock');
    if (!host) return;
    host.innerHTML = dayBlock();
    bindDayCards();
  }

  function bindDayCards() {
    bindCards(root.querySelector('#dayBlock') ?? root, {
      getMeals: () => meals,
      onDeleted: (id) => {
        meals = setMeals(meals.filter((m) => m.id !== id));
        regroup();
        render();
      },
    });
  }

  function bind() {
    root.querySelector('#prevMonth').addEventListener('click', () => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
      selected = null;
      render();
    });

    root.querySelector('#nextMonth').addEventListener('click', () => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      selected = null;
      render();
    });

    root.querySelectorAll('[data-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.day;
        selected = selected === key ? null : key; // 같은 날 다시 누르면 접는다
        root.querySelectorAll('[data-day]').forEach((b) => {
          b.classList.toggle('is-on', b.dataset.day === selected);
        });
        paintDay();
      });
    });

    bindDayCards();
  }
}
