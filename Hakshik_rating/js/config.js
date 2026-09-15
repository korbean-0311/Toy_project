// ── 채워 넣어야 하는 값 ──────────────────────────────────────────
// Supabase 대시보드 > Project Settings > Data API / API Keys 에서 복사한다.
// publishable(anon) 키는 공개용으로 설계된 값이라 여기 그대로 둬도 된다.
// 접근 통제는 DB의 RLS가 한다. secret / service_role 키는 절대 넣지 말 것.
export const SUPABASE_URL = 'https://opzhnmggxnjlhlhaiile.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9PaMPeCvBzlEo0Yw-kjdCg_iRHhkRTz';
// ───────────────────────────────────────────────────────────────

// PIN은 클라이언트에 없다. DB의 app_pins 테이블에 있고,
// 맞는지 판정은 서버(claim_role 함수)가 한다. 바꾸려면 schema.sql 을 고쳐 다시 실행.

// 배포할 때마다 올린다. 설정 화면에 그대로 찍히므로, 폰이 새 버전을 받았는지
// 눈으로 바로 확인할 수 있다 (GitHub Pages 가 파일을 10분간 캐시한다).
export const APP_VERSION = '2026-09-15.3';

export const BUCKET = 'meal-photos';

// 사진 서명 URL 유효시간 (초). 버킷이 비공개라 이걸로만 읽는다.
// 피드 이미지는 lazy 로딩이라, 앱을 켜둔 채 한참 뒤에 스크롤하면 그때 URL을 쓴다.
// 너무 짧으면 그 사진이 깨지므로 넉넉히 잡는다.
export const SIGNED_URL_TTL = 4 * 60 * 60;

// 업로드 전 리사이즈 기준 (긴 변 픽셀, JPEG 품질).
// 폰 원본은 4000px 넘고 3~5MB라 그대로 올리면 느리고 용량만 먹는다.
// 화면에서 가장 크게 쓰이는 곳이 전체폭 사진 카드라, 3배 밀도 기준으로도 1080이면 충분하다.
export const IMAGE_MAX_EDGE = 1080;
export const IMAGE_QUALITY = 0.82;

// 이 시각 이전이면 점심, 이후면 저녁으로 자동 분류한다 (24시간제).
export const DINNER_FROM_HOUR = 16;
