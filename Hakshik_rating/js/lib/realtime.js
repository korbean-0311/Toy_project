// 상대가 답글을 달면 새로고침 없이 바로 뜨게 한다.
//
// 바뀐 내용을 이벤트 payload 에서 꺼내 쓰지 않고, "뭔가 바뀌었다" 는 신호로만 쓰고
// 목록을 다시 받아온다. 삭제로 딸려 사라진 답글까지 한 번에 맞출 수 있고,
// 이벤트를 놓쳐도 다음 신호에서 복구되기 때문이다.

import { supabase } from './supabase.js';

/**
 * 이 기록의 댓글이 바뀌면 onChange 를 부른다.
 * @returns {() => void} 구독 해제
 */
export function watchComments(mealId, onChange) {
  let channel = null;
  let stopped = false;

  // 탭을 다시 열었을 때는 실시간이 끊겨 있었을 수도 있으니 한 번 맞춰준다.
  const onVisible = () => {
    if (document.visibilityState === 'visible') onChange();
  };
  document.addEventListener('visibilitychange', onVisible);

  (async () => {
    try {
      // RLS 를 통과하려면 실시간 연결도 지금 세션의 토큰을 들고 있어야 한다
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
    } catch {
      /* 토큰을 못 실어도 구독 자체는 시도해본다 */
    }

    if (stopped) return;

    channel = supabase
      .channel(`comments-${mealId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `meal_id=eq.${mealId}` },
        () => onChange(),
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // 실시간이 안 되더라도 화면은 그대로 쓸 수 있다. 새로고침하면 보인다.
          console.warn('댓글 실시간 구독 실패:', status);
        }
      });
  })();

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    if (channel) supabase.removeChannel(channel);
  };
}
