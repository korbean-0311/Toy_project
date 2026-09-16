// 기록 카드 마크업. 피드와 달력이 같은 걸 쓴다.
//
// 펼친 카드(사진 위에 글자)와 접힌 카드(글자만)는 내용이 같고 담는 그릇만 다르다.
// 클릭 처리는 쓰는 쪽에서 data-action / data-toggle 로 받아간다.

import { MEAL_LABEL, MEAL_EMOJI, formatDate, formatTime, starBar, esc } from '../lib/format.js';
import { deleteMeal } from '../lib/store.js';
import { shareMeal } from '../lib/share.js';
import { toast, go } from '../ui.js';

/**
 * 카드가 사진 비율을 그대로 따라가게 한다. 고정 비율에 맞춰 자르면 가로 사진이
 * 좌우로 크게 잘려나간다. 크기를 모르는 예전 기록은 CSS 기본값(4:5)으로 둔다.
 */
export function aspectStyle(m) {
  if (!m.photo_w || !m.photo_h) return '';
  // 지나치게 길쭉한 사진이 화면을 다 잡아먹지 않게만 가둔다 (폰 사진은 여기 안 걸린다)
  const ratio = Math.min(1.9, Math.max(0.55, m.photo_w / m.photo_h));
  return ` style="--ar:${ratio.toFixed(4)}"`;
}

export function placeOf(m) {
  return m.cafeteria
    ? `${esc(m.cafeteria.name)}${m.cafeteria.building ? ` · ${esc(m.cafeteria.building)}` : ''}`
    : '식당 미확인';
}

export function cardActions(m, role) {
  const parts = [];

  if (!m.rating && role === 'rater') {
    parts.push(
      `<button class="btn btn-primary btn-sm" data-action="open" data-id="${m.id}">평가하기</button>`,
    );
  } else {
    parts.push(
      `<button class="btn btn-ghost btn-sm" data-action="open" data-id="${m.id}">
         💬${m.commentCount ? ` ${m.commentCount}` : ''}
       </button>`,
    );
  }

  if (role === 'uploader') {
    parts.push(
      `<button class="btn btn-ghost btn-sm" data-action="share" data-id="${m.id}">공유</button>`,
      `<button class="btn btn-ghost btn-sm danger" data-action="delete" data-id="${m.id}">삭제</button>`,
    );
  }

  return parts.join('');
}

/**
 * 사진이 보이는 카드.
 * @param {boolean} [o.collapsible] '접기' 버튼을 붙인다
 * @param {boolean} [o.eager] 화면에 바로 보이는 카드 — lazy 를 걸면 받기 시작이 늦어진다
 */
export function openCard(m, { role, collapsible = false, eager = false } = {}) {
  const taken = new Date(m.taken_at);
  const rated = m.rating
    ? `<div class="story-rating">
         ${starBar(m.rating.stars)}
         <span class="stars-num">${Number(m.rating.stars).toFixed(1)}</span>
       </div>
       ${m.rating.comment ? `<p class="story-comment">${esc(m.rating.comment)}</p>` : ''}`
    : `<div class="story-pending">아직 평가 전</div>`;

  const buttons =
    cardActions(m, role) +
    (collapsible ? `<button class="btn btn-ghost btn-sm" data-toggle="${m.id}">접기</button>` : '');

  return `
    <article class="story"${aspectStyle(m)}>
      <img class="story-img" src="${esc(m.url)}" alt=""
           ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'} />
      <div class="story-veil"></div>
      <div class="story-body">
        <div class="story-meta">
          <span class="pill">${MEAL_EMOJI[m.meal_type]} ${MEAL_LABEL[m.meal_type]}</span>
          <span class="pill">${esc(formatDate(taken))} ${esc(formatTime(taken))}</span>
        </div>
        <h2 class="story-place">${placeOf(m)}</h2>
        ${rated}
        ${buttons ? `<div class="story-actions">${buttons}</div>` : ''}
      </div>
    </article>`;
}

/** 사진을 접고 글자만 남긴 카드. */
export function slimCard(m, { role } = {}) {
  const taken = new Date(m.taken_at);
  const buttons =
    cardActions(m, role) +
    `<button class="btn btn-ghost btn-sm" data-toggle="${m.id}">펼치기</button>`;

  return `
    <article class="slim">
      <div class="slim-head">
        <span class="slim-when">
          ${MEAL_EMOJI[m.meal_type]} ${MEAL_LABEL[m.meal_type]} ·
          ${esc(formatDate(taken))} ${esc(formatTime(taken))}
        </span>
      </div>

      <div class="slim-line">
        <h2 class="slim-place">${placeOf(m)}</h2>
        ${
          m.rating
            ? `<span class="slim-rating">
                 ${starBar(m.rating.stars)}
                 <span class="stars-num">${Number(m.rating.stars).toFixed(1)}</span>
               </span>`
            : '<span class="slim-pending">평가 전</span>'
        }
      </div>

      ${m.rating?.comment ? `<p class="slim-comment">${esc(m.rating.comment)}</p>` : ''}
      ${buttons ? `<div class="slim-actions">${buttons}</div>` : ''}
    </article>`;
}

/**
 * 카드 안 버튼들을 연결한다. 피드와 달력이 같은 동작을 쓴다.
 * @param {object} o
 * @param {() => object[]} o.getMeals   지금 화면에 있는 기록들
 * @param {(id: string) => void} [o.onDeleted]  삭제가 끝난 뒤
 * @param {(id: string) => void} [o.onToggle]   사진 펼치기/접기
 */
export function bindCards(root, { getMeals, onDeleted, onToggle }) {
  root.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => act(btn.dataset.action, btn.dataset.id));
  });

  root.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => onToggle?.(btn.dataset.toggle));
  });

  async function act(action, id) {
    const meal = getMeals().find((m) => m.id === id);
    if (!meal) return;

    if (action === 'open') return go(`#/rate/${id}`);
    if (action === 'share') return shareMeal(meal);

    if (action === 'delete') {
      if (!confirm('이 기록을 지울까요? 되돌릴 수 없어요.')) return;
      try {
        await deleteMeal(meal);
        toast('지웠어요');
        onDeleted?.(id);
      } catch (err) {
        toast(err.message, { error: true });
      }
    }
  }
}
