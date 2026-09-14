# Hakshik_rating

둘이서 쓰는 학식 평점 웹앱. A가 학식 사진을 올리면 B가 별점과 한줄평을 남긴다.
모바일 전용이고, 빌드 도구 없이 정적 파일만으로 돌아간다.

## 지금 되는 것

- **역할 고정** — PIN을 넣으면 `올리는 사람` / `평가하는 사람` 중 하나로 기기에 저장된다.
- **사진 올리기** — `사진 찍기`(카메라 바로 실행)와 `앨범에서 선택` 두 갈래.
- **메타데이터 추출** — 사진 EXIF에서 GPS와 촬영시각을 읽는다. GPS가 없으면 업로드 시점의
  단말 위치로 대신하고, 그것도 안 되면 식당을 직접 고른다.
- **식당 자동 매칭** — 설정에서 등록해 둔 식당 좌표의 반경 안이면 그 식당으로 매핑한다.
- **끼니 자동 분류** — 촬영시각이 16시 전이면 점심, 후면 저녁. 업로드 화면에서 고칠 수 있다.
- **공유** — 올린 직후 `공유하기`를 누르면 OS 공유 시트가 뜬다. 거기서 카톡을 고르면
  그 기록의 평가 화면으로 바로 가는 링크가 넘어간다.
- **평가** — 0.5점 간격 5점 만점 별점 + 한줄평. 화면에는 사진, 끼니, 시각, 식당만 보인다.
- **피드** — 스토리처럼 넘겨 보는 카드 목록. `최신 / 별점 / 식당` 정렬과 식당별 필터.

## 준비

### 1. Supabase 프로젝트

새 프로젝트를 하나 판 뒤 **SQL Editor** 에서 [`supabase/schema.sql`](supabase/schema.sql) 을
통째로 실행한다. 테이블 3개(`cafeterias`, `meals`, `ratings`), RLS 정책,
사진용 Storage 버킷(`meal-photos`)이 한 번에 만들어진다.

### 2. 설정값 채우기

`js/config.js` 를 열고 두 줄을 채운다. Supabase 대시보드 → Project Settings → Data API
에서 복사할 수 있다.

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

같은 파일의 `PINS` 도 원하는 숫자로 바꾼다.

### 3. 로컬에서 띄우기

```bash
python -m http.server 5173 --directory Hakshik_rating
```

`http://localhost:5173` 으로 접속. 다만 **카메라와 위치는 HTTPS 에서만 열린다.**
localhost는 예외라 PC에서는 되지만, 폰에서 `http://192.168.x.x:5173` 으로 들어가면
카메라·위치 버튼이 먹지 않는다. 폰으로 쓰려면 배포부터 해야 한다.

### 4. 배포

정적 파일이라 아무 데나 올라간다. 이 폴더를 루트로 잡고 Vercel / Netlify /
Cloudflare Pages 중 하나에 연결하면 HTTPS 주소가 나온다. 그 주소를 둘이 북마크해서 쓴다.

### 5. 식당 등록

배포한 주소로 들어가 설정 탭에서 식당을 추가한다. **식당에 실제로 서 있을 때
`📍 현재 위치 넣기`를 누르는 게 제일 정확하다.** 반경은 150m 정도가 무난하고,
식당들이 붙어 있으면 더 좁힌다.

## 알아둘 것

- **EXIF GPS는 자주 비어 있다.** 브라우저 카메라로 찍은 사진에는 거의 안 들어가고,
  iOS는 앨범 사진을 넘길 때 위치를 지우는 경우가 많다. 그래서 단말 위치를 보조로 쓴다.
  둘 다 실패하면 업로드 화면에서 식당을 직접 고르면 된다.
- **PIN은 진짜 인증이 아니다.** 클라이언트 코드에 그대로 들어가므로 소스를 보면 보인다.
  "누가 어느 쪽인지" 고정하는 스위치로만 쓴다.
- **RLS는 열려 있다.** Supabase Auth 없이 anon 키로 접근하므로, 주소와 키를 아는 사람은
  읽고 쓸 수 있다. 링크를 외부에 뿌리지 않는 선에서 쓰고, 더 조여야 하면 Auth를 붙인다.
- 사진은 올릴 때 긴 변 1600px JPEG로 다시 구워서 보낸다. 이 과정에서 EXIF가 떨어져 나가므로
  Storage에 남는 파일에는 위치 정보가 없다 (좌표는 DB 컬럼에만 들어간다).

## 구조

```
index.html            앱 셸 (앱바 / 화면 / 탭바)
css/style.css         전체 스타일
js/config.js          Supabase 키, PIN, 각종 기준값
js/app.js             해시 라우터 + 역할 가드 + 탭바
js/ui.js              토스트, 스피너, 반개 단위 별점 피커
js/lib/supabase.js    클라이언트 생성
js/lib/store.js       테이블/스토리지 접근
js/lib/photo.js       EXIF 추출 + 업로드용 리사이즈
js/lib/geo.js         거리 계산, 식당 매칭, 현재 위치
js/lib/share.js       공유 시트 / 링크 복사
js/lib/format.js      끼니 분류, 날짜·별점 표기
js/views/             login / feed / upload / rate / settings
supabase/schema.sql   테이블 + RLS + 버킷
```
