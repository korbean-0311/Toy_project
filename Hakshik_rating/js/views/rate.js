import {
  getMeal, signedUrl, saveRating, listComments, addComment, deleteComment,
} from '../lib/store.js';
import { getRole, ROLES } from '../lib/auth.js';
import { MEAL_LABEL, MEAL_EMOJI, formatDate, formatTime, starText, esc } from '../lib/format.js';
import { watchComments } from '../lib/realtime.js';
import { setAppbar, spinner, errorBox, starPicker, toast, go } from '../ui.js';
import { invalidateMeals, peekMeals } from '../lib/mealcache.js';

// 답글이 깊어져도 화면이 좁아지지 않게 들여쓰기는 여기까지만 한다
const MAX_INDENT = 5;

export default async function rate(root, { id }) {
  const role = getRole();

  setAppbar(`
    <div class="appbar-row">
      <button class="back" id="backBtn" aria-label="뒤로">‹</button>
      <span class="brand">🍚 기록</span>
    </div>`);
  document.getElementById('backBtn').addEventListener('click', () => go('#/'));

  // 피드나 달력이 이미 받아둔 기록이면 그걸로 먼저 그린다. 사진 URL 까지 들어 있어서
  // 왕복을 기다리지 않고 사진이 바로 뜬다. 최신 내용은 아래에서 받아 갈아끼운다.
  const known = (peekMeals() ?? []).find((m) => m.id === id) ?? null;

  let meal = known;
  let photo = known?.url ?? '';
  let comments = [];
  let editingRating = false;
  let ratingTouched = false; // 사용자가 폼을 직접 여닫았으면 갱신이 건드리지 않는다
  let replyTo = null; // null 이면 한줄평(스레드 뿌리)에 다는 답글

  if (meal) {
    editingRating = role === 'rater' && !meal.rating;
    render();
  } else {
    root.innerHTML = spinner();
  }

  try {
    const [fresh, freshComments] = await Promise.all([getMeal(id), listComments(id)]);
    if (!photo || fresh.photo_path !== meal?.photo_path) photo = await signedUrl(fresh.photo_path);
    meal = fresh;
    comments = freshComments;
    if (!ratingTouched) editingRating = role === 'rater' && !meal.rating;
    render();
  } catch {
    if (!meal) {
      root.innerHTML = errorBox('그 기록을 찾을 수 없어요. 지워졌을 수도 있어요.');
      return;
    }
    toast('새로 불러오지 못했어요', { error: true });
  }

  // 상대가 답글을 달면 바로 뜨게 한다. 별점 폼을 쓰는 중일 수 있으니
  // 화면 전체가 아니라 댓글 부분만 다시 그린다.
  const unwatch = watchComments(meal.id, async () => {
    try {
      const fresh = await listComments(meal.id);
      if (JSON.stringify(fresh) === JSON.stringify(comments)) return;
      comments = fresh;
      if (!comments.some((c) => c.id === replyTo)) replyTo = null;
      invalidateMeals();
      paintThread();
    } catch {
      /* 잠깐 실패해도 다음 신호에서 맞춰진다 */
    }
  });

  return unwatch;

  function render() {
    const taken = new Date(meal.taken_at);
    const place = meal.cafeteria
      ? `${esc(meal.cafeteria.name)}${meal.cafeteria.building ? ` · ${esc(meal.cafeteria.building)}` : ''}`
      : '식당 미확인';

    root.innerHTML = `
      <div class="pad">
        <figure class="preview">
          <img src="${esc(photo)}" alt="학식 사진" fetchpriority="high" decoding="async" />
        </figure>

        <div class="head">
          <div class="head-pills">
            <span class="pill">${MEAL_EMOJI[meal.meal_type]} ${MEAL_LABEL[meal.meal_type]}</span>
            <span class="pill">${esc(formatDate(taken))} ${esc(formatTime(taken))}</span>
          </div>
          <h1 class="head-place">${place}</h1>
        </div>

        <div id="ratingBlock">${ratingBlock()}</div>
        <div id="threadBlock">${threadBlock()}</div>
      </div>`;

    bindRating();
    bindThread();
  }

  /** 댓글 부분만 다시 그린다. 쓰던 답글은 날리지 않는다. */
  function paintThread() {
    const host = root.querySelector('#threadBlock');
    if (!host) return;

    const typing = root.querySelector('#replyBody');
    const draft = typing?.value ?? '';
    const hadFocus = document.activeElement === typing;

    host.innerHTML = threadBlock();
    bindThread();

    const next = root.querySelector('#replyBody');
    if (next && draft) next.value = draft;
    if (next && hadFocus) next.focus();
  }

  function ratingBlock() {
    if (editingRating) {
      return `
        <form class="rate-form" id="rateForm">
          <div id="pickerHost"></div>
          <label class="field">
            <span>한줄평</span>
            <input type="text" id="comment" maxlength="120" placeholder="줄은 길었는데 맛은 괜찮았음"
                   value="${esc(meal.rating?.comment ?? '')}" />
          </label>
          <button class="btn btn-primary btn-block" type="submit">
            ${meal.rating ? '평가 수정' : '평가 남기기'}
          </button>
          ${meal.rating ? '<button class="btn btn-ghost btn-block" type="button" id="cancelRating">취소</button>' : ''}
        </form>`;
    }

    if (!meal.rating) {
      return `<div class="notice"><b>아직 평가 전</b><span>상대가 별점을 주면 여기에 보여요.</span></div>`;
    }

    return `
      <div class="result">
        <div class="result-stars">${starText(Number(meal.rating.stars))}</div>
        <div class="result-num">${Number(meal.rating.stars).toFixed(1)}점</div>
        ${meal.rating.comment ? `<p class="result-comment">${esc(meal.rating.comment)}</p>` : ''}
        ${role === 'rater' ? '<button class="btn btn-ghost btn-xs" id="editRating">평가 수정</button>' : ''}
      </div>`;
  }

  function threadBlock() {
    if (!meal.rating) return '';

    const byParent = new Map();
    for (const c of comments) {
      const key = c.parent_id ?? 'root';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    }

    // 트리를 깊이와 함께 한 줄로 펴서 그린다. 들여쓰기는 CSS 가 --depth 로 준다.
    const flat = [];
    (function walk(key, depth) {
      for (const c of byParent.get(key) ?? []) {
        flat.push({ ...c, depth });
        walk(c.id, depth + 1);
      }
    })('root', 0);

    const target = replyTo ? comments.find((c) => c.id === replyTo) : null;

    return `
      <section class="thread">
        <h2 class="thread-title">댓글 ${comments.length ? comments.length : ''}</h2>
        ${
          flat.length
            ? flat.map(commentRow).join('')
            : '<p class="thread-empty">한줄평에 답글을 달아보세요.</p>'
        }

        <form class="reply" id="replyForm">
          ${
            target
              ? `<div class="reply-target">
                   <span>${esc(shorten(target.body))} 에 답글</span>
                   <button type="button" id="cancelReply">취소</button>
                 </div>`
              : ''
          }
          <div class="reply-row">
            <input type="text" id="replyBody" maxlength="500" autocomplete="off"
                   placeholder="${target ? '답글 달기' : '한줄평에 답글 달기'}" />
            <button class="btn btn-primary btn-sm" type="submit">등록</button>
          </div>
        </form>
      </section>`;
  }

  function commentRow(c) {
    const who = ROLES[c.author];
    const at = new Date(c.created_at);
    return `
      <article class="cmt" style="--depth:${Math.min(c.depth, MAX_INDENT)}">
        <div class="cmt-head">
          <span class="cmt-who">${who ? `${who.emoji} ${esc(who.label)}` : '?'}</span>
          <span class="cmt-when">${esc(formatDate(at))} ${esc(formatTime(at))}</span>
        </div>
        <p class="cmt-body">${esc(c.body)}</p>
        <div class="cmt-actions">
          <button type="button" data-reply="${c.id}">답글</button>
          ${c.author === role ? `<button type="button" class="danger" data-delcmt="${c.id}">삭제</button>` : ''}
        </div>
      </article>`;
  }

  function shorten(text) {
    return text.length > 14 ? `${text.slice(0, 14)}…` : text;
  }

  function bindRating() {
    root.querySelector('#editRating')?.addEventListener('click', () => {
      editingRating = true;
      ratingTouched = true;
      render();
    });

    root.querySelector('#cancelRating')?.addEventListener('click', () => {
      editingRating = false;
      ratingTouched = true;
      render();
    });

    const form = root.querySelector('#rateForm');
    if (form) {
      const picker = starPicker({ value: Number(meal.rating?.stars ?? 0) });
      root.querySelector('#pickerHost').append(picker);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const stars = picker.getValue();
        if (!stars) return toast('별점을 먼저 골라주세요', { error: true });

        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '저장 중…';

        try {
          const saved = await saveRating({
            mealId: meal.id,
            stars,
            comment: root.querySelector('#comment').value.trim(),
          });
          meal.rating = saved;
          editingRating = false;
          invalidateMeals();
          toast('평가를 남겼어요');
          render();
        } catch (err) {
          toast(err.message, { error: true });
          btn.disabled = false;
          btn.textContent = meal.rating ? '평가 수정' : '평가 남기기';
        }
      });
    }

  }

  function bindThread() {
    root.querySelectorAll('[data-reply]').forEach((btn) => {
      btn.addEventListener('click', () => {
        replyTo = btn.dataset.reply;
        paintThread();
        root.querySelector('#replyBody')?.focus();
      });
    });

    root.querySelector('#cancelReply')?.addEventListener('click', () => {
      replyTo = null;
      paintThread();
    });

    root.querySelectorAll('[data-delcmt]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 댓글을 지울까요? 달린 답글도 같이 사라져요.')) return;
        try {
          await deleteComment(btn.dataset.delcmt);
          comments = await listComments(meal.id);
          if (!comments.some((c) => c.id === replyTo)) replyTo = null;
          invalidateMeals();
          paintThread();
        } catch (err) {
          toast(err.message, { error: true });
        }
      });
    });

    root.querySelector('#replyForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = root.querySelector('#replyBody');
      const body = input.value.trim();
      if (!body) return;

      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;

      try {
        await addComment({ mealId: meal.id, parentId: replyTo, body });
        comments = await listComments(meal.id);
        replyTo = null;
        invalidateMeals();
        paintThread();
      } catch (err) {
        toast(err.message, { error: true });
        btn.disabled = false;
      }
    });
  }
}
