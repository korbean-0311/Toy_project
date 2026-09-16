import { MEAL_LABEL } from './format.js';
import { toast } from '../ui.js';

/** 이 기록의 평가 화면으로 바로 가는 링크. */
export function rateLink(mealId) {
  const { origin, pathname } = location;
  return `${origin}${pathname}#/rate/${mealId}`;
}

/**
 * OS 공유 시트를 띄운다. 목록에서 카톡을 고르면 링크가 그대로 넘어간다.
 * 공유 시트를 못 쓰는 환경이면 링크를 클립보드에 복사한다.
 */
export async function shareMeal(meal) {
  const url = rateLink(meal.id);
  const place = meal.cafeteria?.name ?? '학식';
  const text = `${place} ${MEAL_LABEL[meal.meal_type]} 나왔다. 별점 좀 줘 🍚`;

  if (navigator.share) {
    try {
      await navigator.share({ title: '자기는 뭘 먹을까?', text, url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // 사용자가 취소
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('링크를 복사했어요. 카톡에 붙여넣기 하세요');
  } catch {
    prompt('이 링크를 카톡에 붙여넣으세요', url);
  }
}
