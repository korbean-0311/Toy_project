import { getMeal, photoUrl, saveRating } from '../lib/store.js';
import { getRole } from '../lib/auth.js';
import { MEAL_LABEL, MEAL_EMOJI, formatDate, formatTime, starText, esc } from '../lib/format.js';
import { setAppbar, spinner, errorBox, starPicker, toast, go } from '../ui.js';

export default async function rate(root, { id }) {
  setAppbar(`
    <div class="appbar-row">
      <button class="back" id="backBtn" aria-label="뒤로">‹</button>
      <span class="brand">⭐ 평가하기</span>
    </div>`);
  document.getElementById('backBtn').addEventListener('click', () => go('#/'));

  root.innerHTML = spinner();

  let meal;
  try {
    meal = await getMeal(id);
  } catch (err) {
    root.innerHTML = errorBox('그 기록을 찾을 수 없어요. 지워졌을 수도 있어요.');
    return;
  }

  const taken = new Date(meal.taken_at);
  const place = meal.cafeteria
    ? `${esc(meal.cafeteria.name)}${meal.cafeteria.building ? ` · ${esc(meal.cafeteria.building)}` : ''}`
    : '식당 미확인';

  const readOnly = getRole() !== 'rater';

  root.innerHTML = `
    <div class="pad">
      <figure class="preview">
        <img src="${esc(photoUrl(meal.photo_path))}" alt="학식 사진" />
      </figure>

      <div class="head">
        <div class="head-pills">
          <span class="pill">${MEAL_EMOJI[meal.meal_type]} ${MEAL_LABEL[meal.meal_type]}</span>
          <span class="pill">${esc(formatDate(taken))} ${esc(formatTime(taken))}</span>
        </div>
        <h1 class="head-place">${place}</h1>
      </div>

      <div id="body"></div>
    </div>`;

  const body = root.querySelector('#body');

  if (readOnly) {
    body.innerHTML = meal.rating
      ? `<div class="result">
           <div class="result-stars">${starText(Number(meal.rating.stars))}</div>
           <div class="result-num">${Number(meal.rating.stars).toFixed(1)}점</div>
           ${meal.rating.comment ? `<p class="result-comment">${esc(meal.rating.comment)}</p>` : ''}
         </div>`
      : `<div class="notice"><b>아직 평가 전</b><span>상대가 별점을 주면 여기에 보여요.</span></div>`;
    return;
  }

  body.innerHTML = `
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
    </form>`;

  const picker = starPicker({ value: Number(meal.rating?.stars ?? 0) });
  body.querySelector('#pickerHost').append(picker);

  body.querySelector('#rateForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const stars = picker.getValue();
    if (!stars) return toast('별점을 먼저 골라주세요', { error: true });

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = '저장 중…';

    try {
      await saveRating({
        mealId: meal.id,
        stars,
        comment: body.querySelector('#comment').value.trim(),
      });
      toast('평가를 남겼어요');
      go('#/');
    } catch (err) {
      toast(err.message, { error: true });
      btn.disabled = false;
      btn.textContent = meal.rating ? '평가 수정' : '평가 남기기';
    }
  });
}
