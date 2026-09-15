// 피드와 달력이 같은 목록을 나눠 쓴다.
//
// 탭을 오갈 때마다 왕복 두 번(기록 조회 → 사진 URL 서명)을 다시 하면 그동안 화면이
// 비어 있다. 마지막으로 받아둔 걸 들고 있다가 먼저 그려놓고 뒤에서 갱신하는 식으로 쓴다.

import { listMeals, signedUrls } from './store.js';

let cached = null;

/** 받아둔 게 있으면 준다 (없으면 null). 네트워크를 타지 않는다. */
export function peekMeals() {
  return cached;
}

/** 내용이 바뀌었을 때 호출한다. 다음 조회는 서버에서 새로 받는다. */
export function invalidateMeals() {
  cached = null;
}

export function setMeals(next) {
  cached = next;
  return cached;
}

export async function loadMeals() {
  const rows = await listMeals();
  const urls = await signedUrls(rows.map((m) => m.photo_path));
  return setMeals(rows.map((m) => ({ ...m, url: urls.get(m.photo_path) ?? '' })));
}

/** 내용이 실제로 달라졌는지 보는 지문. 같으면 다시 그리지 않는다. */
export function stampMeals(list) {
  return (list ?? [])
    .map(
      (m) =>
        `${m.id}:${m.rating?.stars ?? ''}:${m.rating?.comment ?? ''}:${m.commentCount ?? 0}:${m.url}`,
    )
    .join('|');
}

/** taken_at 을 그 기기의 날짜(YYYY-MM-DD)로. 달력이 이 값으로 묶는다. */
export function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
