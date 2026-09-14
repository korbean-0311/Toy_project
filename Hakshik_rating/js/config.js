// ── 채워 넣어야 하는 값 ──────────────────────────────────────────
// Supabase 대시보드 > Project Settings > Data API 에서 복사한다.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// 역할별 PIN. 두 명이 각자 하나씩 외워서 쓴다.
// 주의: 클라이언트 코드에 그대로 들어가므로 소스를 보면 보인다.
//       외부에 새면 곤란한 값(다른 서비스 비밀번호 등)은 절대 쓰지 말 것.
export const PINS = {
  uploader: '1111', // A — 사진 올리는 사람
  rater: '2222',    // B — 별점 주는 사람
};
// ───────────────────────────────────────────────────────────────

export const BUCKET = 'meal-photos';

// 업로드 전 리사이즈 기준 (긴 변 픽셀, JPEG 품질)
export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_QUALITY = 0.85;

// 이 시각 이전이면 점심, 이후면 저녁으로 자동 분류한다 (24시간제).
export const DINNER_FROM_HOUR = 16;
