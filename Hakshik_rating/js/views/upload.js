import { readExif, shrink } from '../lib/photo.js';
import { currentPosition, matchCafeteria } from '../lib/geo.js';
import { listCafeterias, uploadPhoto, createMeal } from '../lib/store.js';
import {
  mealTypeOf, MEAL_LABEL, MEAL_EMOJI, formatDate, formatTime, formatBytes, esc,
} from '../lib/format.js';
import { setAppbar, toast, go } from '../ui.js';
import { shareMeal } from '../lib/share.js';

const SOURCE_LABEL = {
  exif: '사진에 찍힌 위치',
  device: '지금 내 위치',
  manual: '직접 고름',
  none: '위치 없음',
};

export default async function upload(root) {
  setAppbar('<div class="appbar-row"><span class="brand">📸 올리기</span></div>');

  let cafeterias = [];
  try {
    cafeterias = await listCafeterias();
  } catch (err) {
    toast(err.message, { error: true });
  }

  // 선택한 사진에 대해 추려낸 정보
  let draft = null;

  root.innerHTML = `
    <div class="pad">
      ${
        cafeterias.length
          ? ''
          : `<div class="notice">
               <b>등록된 식당이 없어요</b>
               <span>설정에서 식당 위치를 먼저 등록하면 사진의 GPS로 자동 매칭돼요.</span>
               <button class="btn btn-ghost btn-sm" id="toSettings">설정으로</button>
             </div>`
      }

      <div class="pick">
        <button class="pick-btn" id="camBtn">
          <span class="pick-emoji">📷</span>
          <span class="pick-label">사진 찍기</span>
        </button>
        <button class="pick-btn" id="albumBtn">
          <span class="pick-emoji">🖼️</span>
          <span class="pick-label">앨범에서 선택</span>
        </button>
      </div>

      <input type="file" id="camInput" accept="image/*" capture="environment" hidden />
      <input type="file" id="albumInput" accept="image/*" hidden />

      <div id="stage"></div>
    </div>`;

  root.querySelector('#toSettings')?.addEventListener('click', () => go('#/settings'));

  const camInput = root.querySelector('#camInput');
  const albumInput = root.querySelector('#albumInput');
  const stage = root.querySelector('#stage');

  root.querySelector('#camBtn').addEventListener('click', () => camInput.click());
  root.querySelector('#albumBtn').addEventListener('click', () => albumInput.click());
  camInput.addEventListener('change', () => pick(camInput.files?.[0]));
  albumInput.addEventListener('change', () => pick(albumInput.files?.[0]));

  async function pick(file) {
    if (!file) return;

    stage.innerHTML = `<div class="loading"><span class="spin"></span>사진 읽는 중</div>`;

    const { coords: exifCoords, takenAt } = await readExif(file);

    let coords = exifCoords;
    let source = exifCoords ? 'exif' : 'none';

    // EXIF에 GPS가 없으면 (브라우저 카메라 촬영분은 대부분 없다) 단말 위치로 대신한다
    if (!coords) {
      const device = await currentPosition();
      if (device) {
        coords = device;
        source = 'device';
      }
    }

    const { blob, type } = await shrink(file);
    const matched = matchCafeteria(coords, cafeterias);

    draft = {
      blob,
      type,
      previewUrl: URL.createObjectURL(blob),
      takenAt: takenAt ?? new Date(),
      coords,
      source,
      cafeteriaId: matched?.cafeteria.id ?? '',
      autoCafeteriaId: matched?.cafeteria.id ?? '',
      distance: matched?.distance ?? null,
      mealType: mealTypeOf(takenAt ?? new Date()),
      originalSize: file.size,
      size: blob.size,
    };

    renderStage();
  }

  function renderStage() {
    const d = draft;

    stage.innerHTML = `
      <figure class="preview">
        <img src="${d.previewUrl}" alt="선택한 학식 사진" />
      </figure>

      <dl class="facts">
        <div class="fact">
          <dt>시간</dt>
          <dd>${esc(formatDate(d.takenAt))} ${esc(formatTime(d.takenAt))}</dd>
        </div>
        <div class="fact">
          <dt>끼니</dt>
          <dd>
            <div class="seg seg-inline" id="mealSeg">
              <button type="button" data-meal="lunch" class="${d.mealType === 'lunch' ? 'is-on' : ''}">
                ${MEAL_EMOJI.lunch} 점심
              </button>
              <button type="button" data-meal="dinner" class="${d.mealType === 'dinner' ? 'is-on' : ''}">
                ${MEAL_EMOJI.dinner} 저녁
              </button>
            </div>
          </dd>
        </div>
        <div class="fact">
          <dt>용량</dt>
          <dd class="dim">
            ${esc(formatBytes(d.originalSize))} → ${esc(formatBytes(d.size))}
            ${d.size < d.originalSize ? `<b>(${Math.round((1 - d.size / d.originalSize) * 100)}% 줄임)</b>` : ''}
          </dd>
        </div>
        <div class="fact">
          <dt>위치</dt>
          <dd class="dim">
            ${esc(SOURCE_LABEL[d.source])}${
              d.distance != null ? ` · 등록 지점에서 ${Math.round(d.distance)}m` : ''
            }
          </dd>
        </div>
        <div class="fact">
          <dt>식당</dt>
          <dd>
            <select id="cafeteriaSel">
              <option value="">— 고르지 않음 —</option>
              ${cafeterias
                .map(
                  (c) =>
                    `<option value="${c.id}" ${c.id === d.cafeteriaId ? 'selected' : ''}>
                       ${esc(c.name)}${c.building ? ` (${esc(c.building)})` : ''}
                     </option>`,
                )
                .join('')}
            </select>
          </dd>
        </div>
      </dl>

      <button class="btn btn-primary btn-block" id="submitBtn">올리기</button>`;

    stage.querySelector('#mealSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-meal]');
      if (!btn) return;
      draft.mealType = btn.dataset.meal;
      stage.querySelectorAll('#mealSeg button').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.meal === draft.mealType);
      });
    });

    stage.querySelector('#cafeteriaSel').addEventListener('change', (e) => {
      draft.cafeteriaId = e.target.value;
      if (draft.cafeteriaId !== draft.autoCafeteriaId) draft.source = 'manual';
    });

    stage.querySelector('#submitBtn').addEventListener('click', submit);
  }

  async function submit() {
    const btn = stage.querySelector('#submitBtn');
    btn.disabled = true;
    btn.textContent = '올리는 중…';

    try {
      const path = await uploadPhoto(draft.blob, draft.type);
      const meal = await createMeal({
        photo_path: path,
        taken_at: draft.takenAt.toISOString(),
        meal_type: draft.mealType,
        lat: draft.coords?.lat ?? null,
        lng: draft.coords?.lng ?? null,
        gps_source: draft.coords ? draft.source : 'none',
        cafeteria_id: draft.cafeteriaId || null,
      });

      done({ ...meal, cafeteria: cafeterias.find((c) => c.id === meal.cafeteria_id) ?? null });
    } catch (err) {
      toast(err.message, { error: true });
      btn.disabled = false;
      btn.textContent = '올리기';
    }
  }

  function done(meal) {
    URL.revokeObjectURL(draft.previewUrl);
    draft = null;
    camInput.value = '';
    albumInput.value = '';

    stage.innerHTML = `
      <div class="notice is-ok">
        <b>올렸어요</b>
        <span>아래 버튼으로 공유하면 상대가 바로 평가 화면으로 들어와요.</span>
      </div>
      <button class="btn btn-primary btn-block" id="shareBtn">공유하기</button>
      <button class="btn btn-ghost btn-block" id="feedBtn">피드 보기</button>`;

    stage.querySelector('#shareBtn').addEventListener('click', () => shareMeal(meal));
    stage.querySelector('#feedBtn').addEventListener('click', () => go('#/'));
  }
}
