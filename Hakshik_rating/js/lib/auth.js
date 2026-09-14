// PIN으로 역할을 정하고 기기에 기억시킨다.
// 진짜 인증이 아니라 "누가 어느 쪽인지" 고정해두는 스위치에 가깝다.

import { PINS } from '../config.js';

const KEY = 'hakshik.role';

export const ROLES = {
  uploader: { id: 'uploader', label: '올리는 사람', emoji: '📸' },
  rater: { id: 'rater', label: '평가하는 사람', emoji: '⭐' },
};

export function getRole() {
  const saved = localStorage.getItem(KEY);
  return saved && ROLES[saved] ? saved : null;
}

/** PIN에 해당하는 역할을 저장한다. 맞는 역할이 없으면 null. */
export function signInWithPin(pin) {
  const entry = Object.entries(PINS).find(([, value]) => String(value) === String(pin).trim());
  if (!entry) return null;

  const role = entry[0];
  localStorage.setItem(KEY, role);
  return role;
}

export function signOut() {
  localStorage.removeItem(KEY);
}

export const isUploader = () => getRole() === 'uploader';
export const isRater = () => getRole() === 'rater';
