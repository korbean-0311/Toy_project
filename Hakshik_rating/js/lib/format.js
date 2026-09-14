import { DINNER_FROM_HOUR } from '../config.js';

/** 촬영 시각으로 점심/저녁을 자동 분류한다. */
export function mealTypeOf(date) {
  return date.getHours() < DINNER_FROM_HOUR ? 'lunch' : 'dinner';
}

export const MEAL_LABEL = { lunch: '점심', dinner: '저녁' };
export const MEAL_EMOJI = { lunch: '🌤️', dinner: '🌙' };

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

/** 별점 숫자를 ★★★½☆ 모양으로. */
export function starText(stars) {
  const full = Math.floor(stars);
  const half = stars % 1 >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
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
