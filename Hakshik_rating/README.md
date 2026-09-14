# Hakshik_rating

둘이서 쓰는 학식 평점 웹앱. A가 학식 사진을 올리면 B가 별점과 한줄평을 남긴다.
모바일 전용이고, 빌드 도구 없이 정적 파일만으로 돌아간다.

## 지금 되는 것

- **역할 자리 잡기** — PIN을 넣으면 그 기기가 `올리는 사람` / `평가하는 사람` 자리를 가져간다.
  역할당 한 기기만 쓸 수 있고, 자리가 차 있으면 "이 기기로 옮길까요?" 를 먼저 묻는다.
- **사진 올리기** — `사진 찍기`(카메라 바로 실행)와 `앨범에서 선택` 두 갈래.
- **메타데이터 추출** — 사진 EXIF에서 GPS와 촬영시각을 읽는다. GPS가 없으면 업로드 시점의
  단말 위치로 대신하고, 그것도 안 되면 식당을 직접 고른다.
- **식당 자동 매칭** — 설정에서 등록해 둔 식당 좌표의 반경 안이면 그 식당으로 매핑한다.
- **끼니 자동 분류** — 촬영시각이 16시 전이면 점심, 후면 저녁. 업로드 화면에서 고칠 수 있다.
- **공유** — 올린 직후 `공유하기`를 누르면 OS 공유 시트가 뜬다. 거기서 카톡을 고르면
  그 기록의 평가 화면으로 바로 가는 링크가 넘어간다.
- **평가** — 0.5점 간격 5점 만점 별점 + 한줄평. 화면에는 사진, 끼니, 시각, 식당만 보인다.
- **피드** — 스토리처럼 넘겨 보는 카드 목록. `최신 / 별점 / 식당` 정렬과 식당별 필터.
- **밝게 / 어둡게** — 기본은 기기 설정을 따라가고, 설정 탭에서 직접 고를 수도 있다.

## 준비

### 1. Supabase 프로젝트

새 프로젝트를 하나 판 뒤 **SQL Editor** 에서 [`supabase/schema.sql`](supabase/schema.sql) 을
통째로 실행한다. 테이블 3개(`cafeterias`, `meals`, `ratings`), RLS 정책,
사진용 Storage 버킷(`meal-photos`)이 한 번에 만들어진다.

### 2. 익명 로그인 켜기

**Authentication → Sign In / Providers → Anonymous sign-ins** 를 켠다.
이메일도 비밀번호도 쓰지 않고, 기기에 신분증만 하나 발급하기 위한 것이다.
이게 꺼져 있으면 PIN 화면에서 로그인이 실패한다.

### 3. 설정값 채우기

`js/config.js` 의 두 줄. Supabase 대시보드 → Project Settings → Data API / API Keys
에서 복사한다.

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_...';
```

PIN은 여기 없다. 클라이언트 어디에도 없고, DB의 `app_pins` 테이블에만 있다.

### 4. PIN 넣기

**이 레포는 공개돼 있으므로 PIN 값을 파일에 적지 말 것.** SQL Editor 에서 직접 넣는다.

```sql
insert into public.app_pins (role, pin) values
  ('uploader', '여기에-업로더-PIN'),
  ('rater',    '여기에-평가자-PIN')
on conflict (role) do update set pin = excluded.pin;
```

`hakshik-xxxx-xxxx-xxxx-xxxx` 같은 긴 값을 쓴다. 기기당 평생 한 번만 입력하므로 길어도
부담이 없고, 짧으면 슬롯이 비어 있는 동안 자동 대입에 뚫린다. 바꾸고 싶을 때도 같은
문장을 값만 바꿔 다시 실행하면 된다.

### 5. 로컬에서 띄우기

```bash
python -m http.server 5173 --directory Hakshik_rating
```

`http://localhost:5173` 으로 접속. 다만 **카메라와 위치는 HTTPS 에서만 열린다.**
localhost는 예외라 PC에서는 되지만, 폰에서 `http://192.168.x.x:5173` 으로 들어가면
카메라·위치 버튼이 먹지 않는다. 폰으로 쓰려면 배포부터 해야 한다.

### 6. 배포

정적 파일이라 아무 데나 올라간다. 이 폴더를 루트로 잡고 Vercel / Netlify /
Cloudflare Pages 중 하나에 연결하면 HTTPS 주소가 나온다. 그 주소를 둘이 북마크해서 쓴다.

### 7. 식당 등록

배포한 주소로 들어가 설정 탭에서 식당을 추가한다. **식당에 실제로 서 있을 때
`📍 현재 위치 넣기`를 누르는 게 제일 정확하다.** 반경은 150m 정도가 무난하고,
식당들이 붙어 있으면 더 좁힌다.

## 알아둘 것

- **EXIF GPS는 자주 비어 있다.** 브라우저 카메라로 찍은 사진에는 거의 안 들어가고,
  iOS는 앨범 사진을 넘길 때 위치를 지우는 경우가 많다. 그래서 단말 위치를 보조로 쓴다.
  둘 다 실패하면 업로드 화면에서 식당을 직접 고르면 된다.
- **잠금은 DB가 건다.** `role_claims.role` 이 PRIMARY KEY라 역할당 행이 하나뿐이고, 그 INSERT는
  `claim_role()` 안에서만 일어난다. 클라이언트에는 INSERT 권한 자체가 없다. 슬롯이 없으면
  `my_role()` 이 null이라 모든 테이블과 사진이 거부된다. 그래서 publishable 키가 공개돼도
  키만으로는 아무것도 못 한다.
- **PIN 자릿수가 곧 강도다.** PIN은 코드에 없지만, 슬롯이 아직 비어 있는 동안에는 남이 PIN을
  맞히면 그 자리를 가져갈 수 있다. 4자리 숫자는 1만 가지라 자동 대입에 뚫린다. 평생 한 번
  입력하는 값이니 길게 잡는 게 좋다. 두 자리가 모두 채워진 뒤에는 PIN을 맞혀도 무의미해진다.
- **로그인은 안 풀린다.** 익명 세션이 `localStorage` 에 남고 토큰은 자동 갱신된다.
  Supabase 무료 플랜은 세션 만료·유휴 타임아웃이 기본으로 꺼져 있어서 시간이 지나도 유지된다.
  풀리는 경우는 브라우저 저장소가 비워질 때뿐이다 — 시크릿 모드, 수동 삭제, 또는 iOS가
  한동안 안 쓴 사이트의 저장소를 회수하는 경우. **홈 화면에 추가해서 쓰면 이 회수를 피한다.**
- **세션을 잃어도 PIN으로 돌아올 수 있다.** 저장소가 날아가면 자리는 잡혀 있는데 신분증이
  없어진 상태가 되는데, 이때 PIN을 다시 넣으면 `이 기기로 옮기기` 가 뜬다. 기기를 바꿀 때도
  같은 방법으로 옮긴다. 즉 PIN 이 곧 열쇠다 — 자리가 다 찼어도 PIN 을 아는 사람은 가져올 수
  있고, 모르는 사람은 키가 있어도 아무것도 못 한다. 동시에 두 기기가 같은 역할을 쓰는 일은
  여전히 불가능하다.
- **고친 게 반영이 안 될 때.** GitHub Pages 가 파일을 10분 캐시한다. 설정 탭의 `새 버전 받기`
  를 누르면 캐시를 무시하고 다시 받아온다 — 로그인은 유지된다. 지금 버전은 설정 탭에 찍힌다.
- 사진은 올릴 때 긴 변 1600px JPEG로 다시 구워서 보낸다. 이 과정에서 EXIF가 떨어져 나가므로
  Storage에 남는 파일에는 위치 정보가 없다 (좌표는 DB 컬럼에만 들어간다).

## 구조

```
index.html            앱 셸 (앱바 / 화면 / 탭바)
css/style.css         전체 스타일
js/config.js          Supabase 키, 각종 기준값 (PIN은 DB에 있다)
js/app.js             해시 라우터 + 역할 가드 + 탭바
js/theme.js           밝게/어둡게 (html[data-theme] 를 찍는다)
js/ui.js              토스트, 스피너, 반개 단위 별점 피커
js/lib/supabase.js    클라이언트 생성
js/lib/store.js       테이블/스토리지 접근
js/lib/photo.js       EXIF 추출 + 업로드용 리사이즈
js/lib/geo.js         거리 계산, 식당 매칭, 현재 위치
js/lib/share.js       공유 시트 / 링크 복사
js/lib/format.js      끼니 분류, 날짜·별점 표기
js/views/             login / feed / upload / rate / settings
manifest.webmanifest  홈 화면 추가용
apple-touch-icon.png  iOS 홈 화면 아이콘 (iOS 는 SVG 를 안 읽는다)
icon-192/512.png      안드로이드·데스크톱 아이콘
supabase/schema.sql   테이블 + RLS + 버킷
```
