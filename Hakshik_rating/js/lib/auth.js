// 역할 선점 방식의 로그인.
//
// 기기는 익명 로그인으로 신분증(auth.uid)을 하나 받고, PIN을 맞히면 그 신분증이
// 역할 슬롯을 선점한다. 슬롯은 역할당 하나뿐이라 먼저 잡은 기기로 잠긴다.
// 판정은 전부 DB의 claim_role() 안에서 일어나므로 PIN은 여기 없다.

import { supabase } from './supabase.js';

const KEY = 'hakshik.role';

export const ROLES = {
  uploader: { id: 'uploader', label: '올리는 사람', emoji: '📸' },
  rater: { id: 'rater', label: '평가하는 사람', emoji: '⭐' },
};

// 라우팅용 캐시. 실제 권한은 어차피 RLS가 막으므로 이 값은 화면 분기에만 쓴다.
let cached = localStorage.getItem(KEY);

export const getRole = () => (cached && ROLES[cached] ? cached : null);
export const isUploader = () => getRole() === 'uploader';
export const isRater = () => getRole() === 'rater';

/** 저장된 세션에 붙은 역할을 서버에 다시 물어 캐시를 맞춘다. 앱 시작 때 한 번. */
export async function refreshRole() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return setRole(null);

  const { data: role, error } = await supabase.rpc('my_role');
  if (error) return getRole(); // 네트워크 문제면 캐시를 믿고 넘어간다
  return setRole(role);
}

/**
 * PIN으로 역할을 선점한다.
 * @returns {{ok: true, role: string} | {ok: false, reason: string}}
 */
export async function signInWithPin(pin) {
  const { data: current } = await supabase.auth.getSession();

  if (!current.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      return {
        ok: false,
        reason:
          error.message?.includes('disabled') || error.status === 422
            ? 'Supabase에서 익명 로그인이 꺼져 있어요. 대시보드에서 켜주세요.'
            : `로그인에 실패했어요: ${error.message}`,
      };
    }
  }

  const { data: role, error } = await supabase.rpc('claim_role', { pin: String(pin).trim() });
  if (error) return { ok: false, reason: error.message };

  setRole(role);
  return { ok: true, role };
}

/**
 * 이 기기의 슬롯을 놓아준다. 다른 기기가 같은 PIN으로 다시 잡을 수 있게 된다.
 * 브라우저 데이터를 지우기 전에 이걸 눌러야 잠금이 풀린다.
 */
export async function releaseDevice() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await supabase.from('role_claims').delete().eq('user_id', data.session.user.id);
    await supabase.auth.signOut();
  }
  setRole(null);
}

function setRole(role) {
  cached = role && ROLES[role] ? role : null;
  if (cached) localStorage.setItem(KEY, cached);
  else localStorage.removeItem(KEY);
  return cached;
}
