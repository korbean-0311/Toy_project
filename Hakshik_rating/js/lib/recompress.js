// 이미 올라간 사진을 지금 기준(config.js 의 IMAGE_MAX_EDGE / IMAGE_QUALITY)으로
// 다시 구워서 같은 자리에 덮어쓴다. 압축 기준을 바꿨을 때 과거 사진까지 맞추는 용도.
//
// 경로를 그대로 두는 이유: meals.photo_path 를 건드릴 필요가 없어서 (meals 에는
// update 정책이 없다) 사진만 갈아끼우면 기록도 평가도 그대로 남는다.

import { listMeals, signedUrl, uploadPhotoAt, deletePhoto, forgetPhotoUrl } from './store.js';
import { shrink } from './photo.js';

// 이만큼도 안 줄면 그냥 둔다. 괜히 지웠다 올리는 위험만 진다.
const WORTH_IT = 0.9;

/**
 * @param {(p: {done: number, total: number}) => void} [onProgress]
 * @returns {Promise<{total, changed, skipped, failed, saved}>}
 */
export async function recompressAll(onProgress) {
  const meals = await listMeals();
  const result = { total: meals.length, changed: 0, skipped: 0, failed: 0, saved: 0 };

  for (const [i, meal] of meals.entries()) {
    onProgress?.({ done: i, total: meals.length });

    try {
      const url = await signedUrl(meal.photo_path);
      const original = await (await fetch(url)).blob();
      const { blob } = await shrink(original);

      if (blob.size >= original.size * WORTH_IT) {
        result.skipped += 1;
        continue;
      }

      // 덮어쓰기 권한이 없어서 지우고 다시 올린다. 그 사이에 실패하면 사진이
      // 사라지므로, 원본을 손에 쥔 채로 하고 실패하면 되돌린다.
      await deletePhoto(meal.photo_path);
      try {
        await uploadPhotoAt(meal.photo_path, blob, 'image/jpeg');
      } catch (err) {
        await uploadPhotoAt(meal.photo_path, original, original.type || 'image/jpeg');
        throw err;
      }

      // 경로가 그대로라 기억해둔 서명 URL 이 옛 사진을 계속 내어준다. 버린다.
      forgetPhotoUrl(meal.photo_path);

      result.changed += 1;
      result.saved += original.size - blob.size;
    } catch (err) {
      console.warn('다시 압축 실패:', meal.photo_path, err);
      result.failed += 1;
    }
  }

  onProgress?.({ done: meals.length, total: meals.length });
  return result;
}
