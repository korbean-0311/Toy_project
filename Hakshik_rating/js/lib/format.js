import { DINNER_FROM_HOUR } from '../config.js';

/** 촬영 시각으로 점심/저녁을 자동 분류한다. */
export function mealTypeOf(date) {
  return date.getHours() < DINNER_FROM_HOUR ? 'lunch' : 'dinner';
}

export const MEAL_LABEL = { lunch: '점심', dinner: '저녁' };
export const MEAL_EMOJI = { lunch: '☀️', dinner: '🌙' };

export function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(d);
}

export function formatTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 별점을 별 다섯 개로 그린다. 반 점은 '½' 글자가 아니라 별 하나를 절반만 칠해서 낸다.
 * (유니코드에 쓸 만한 반쪽 별 글자가 없어서, 꽉 찬 별을 너비로 잘라 쓴다.)
 * 별마다 따로 칠하므로 자간이 있어도 경계가 어긋나지 않는다.
 */
export function starBar(stars, cls = 'stars') {
  const value = Math.max(0, Math.min(5, Number(stars) || 0));
  const items = [0, 1, 2, 3, 4]
    .map((i) => {
      const fill = Math.max(0, Math.min(1, value - i)) * 100;
      return `<span class="starbar-item"><i style="width:${fill}%"></i></span>`;
    })
    .join('');

  return `<span class="starbar ${cls}" role="img" aria-label="5점 만점에 ${value.toFixed(1)}점">${items}</span>`;
}

/** HTML 조각에 값을 끼워 넣을 때 쓰는 이스케이프. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}
