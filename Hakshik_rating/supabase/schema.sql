-- Hakshik_rating 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 실행한다.
-- 여러 번 실행해도 안전하다 (기존 데이터는 그대로).
--
-- 접근 통제 요약
--   · 기기는 익명 로그인으로 신분증(auth.uid)을 하나 받는다.
--   · PIN을 맞히면 그 신분증이 역할 슬롯(uploader / rater)을 선점한다.
--   · 슬롯은 각각 하나뿐이라, 먼저 들어온 기기가 잡으면 그걸로 잠긴다.
--   · 슬롯이 없는 사용자는 모든 테이블과 사진에 접근할 수 없다.
--   → publishable 키가 공개돼도 키만으로는 아무것도 못 한다.

-- ===============================================================
-- 1. 식당 (설정 화면에서 GPS 좌표를 직접 등록/수정한다)
-- ===============================================================
create table if not exists public.cafeterias (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  building    text,
  lat         double precision not null,
  lng         double precision not null,
  -- 이 반경(m) 안에 찍힌 사진이면 이 식당으로 매핑한다
  radius_m    integer not null default 150 check (radius_m between 10 and 2000),
  created_at  timestamptz not null default now()
);

-- ===============================================================
-- 2. 학식 기록 (업로더가 올린 사진 1장 = 1행)
-- ===============================================================
create table if not exists public.meals (
  id           uuid primary key default gen_random_uuid(),
  photo_path   text not null,                 -- storage 버킷 내 경로
  taken_at     timestamptz not null,          -- EXIF 촬영시각, 없으면 업로드 시각
  meal_type    text not null check (meal_type in ('lunch', 'dinner')),
  lat          double precision,
  lng          double precision,
  -- 위치를 어디서 얻었는지: 사진 EXIF / 단말 위치권한 / 직접 선택 / 없음
  gps_source   text not null default 'none'
               check (gps_source in ('exif', 'device', 'manual', 'none')),
  cafeteria_id uuid references public.cafeterias(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists meals_taken_at_idx on public.meals (taken_at desc);
create index if not exists meals_cafeteria_idx on public.meals (cafeteria_id);

-- ===============================================================
-- 3. 평가 (평가자가 남긴 별점 + 한줄평, 기록당 1개)
-- ===============================================================
create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null unique references public.meals(id) on delete cascade,
  -- 0.5 ~ 5.0, 0.5 간격만 허용
  stars      numeric(2, 1) not null
             check (stars >= 0.5 and stars <= 5.0 and (stars * 2) = floor(stars * 2)),
  comment    text,
  created_at timestamptz not null default now()
);

-- ===============================================================
-- 4. PIN 표 — 서버에만 둔다. 클라이언트 코드에는 PIN이 없다.
--    정책을 하나도 안 만들었으므로 anon/authenticated 모두 읽을 수 없고,
--    아래 SECURITY DEFINER 함수만 들여다볼 수 있다.
--
--    ⚠ 실제 PIN 값은 이 파일에 넣지 말 것. 이 레포는 공개돼 있고,
--      여기 적는 순간 PIN이 공개된다. 값은 SQL Editor 에서 따로 넣는다:
--
--        insert into public.app_pins (role, pin) values
--          ('uploader', '여기에-업로더-PIN'),
--          ('rater',    '여기에-평가자-PIN')
--        on conflict (role) do update set pin = excluded.pin;
--
--      PIN을 바꾸고 싶을 때도 같은 문장을 값만 바꿔 다시 실행하면 된다.
-- ===============================================================
create table if not exists public.app_pins (
  role text primary key check (role in ('uploader', 'rater')),
  pin  text not null unique
);

alter table public.app_pins enable row level security;

-- ===============================================================
-- 5. 역할 슬롯 — 역할당 한 기기. 선착순으로 잠긴다.
-- ===============================================================
create table if not exists public.role_claims (
  role       text primary key check (role in ('uploader', 'rater')),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.role_claims enable row level security;

drop policy if exists "read own claim" on public.role_claims;
drop policy if exists "release own claim" on public.role_claims;

-- 자기 슬롯만 보고, 자기 슬롯만 놓을 수 있다 (남의 슬롯은 못 건드린다).
create policy "read own claim" on public.role_claims
  for select to authenticated using (user_id = auth.uid());
create policy "release own claim" on public.role_claims
  for delete to authenticated using (user_id = auth.uid());

-- 지금 사용자의 역할. 슬롯이 없으면 null.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.role_claims where user_id = auth.uid();
$$;

-- PIN을 맞히면 해당 역할 슬롯을 선점한다.
-- 이미 잡아둔 슬롯이 있으면 그걸 그대로 돌려준다 (재로그인).
create or replace function public.claim_role(pin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  mine text;
  want text;
begin
  if auth.uid() is null then
    raise exception '세션이 없습니다';
  end if;

  select r.role into mine from public.role_claims r where r.user_id = auth.uid();
  if mine is not null then
    return mine;
  end if;

  select p.role into want from public.app_pins p where p.pin = claim_role.pin;
  if want is null then
    raise exception 'PIN이 맞지 않습니다';
  end if;

  begin
    insert into public.role_claims (role, user_id) values (want, auth.uid());
  exception when unique_violation then
    raise exception '이 PIN은 이미 다른 기기가 쓰고 있습니다';
  end;

  return want;
end;
$$;

revoke all on function public.claim_role(text) from public, anon;
grant execute on function public.claim_role(text) to authenticated;
grant execute on function public.my_role() to authenticated;

-- ===============================================================
-- 6. 데이터 RLS — 슬롯을 가진 사용자만, 역할에 맞는 것만.
-- ===============================================================
alter table public.cafeterias enable row level security;
alter table public.meals      enable row level security;
alter table public.ratings    enable row level security;

drop policy if exists "anon full access" on public.cafeterias;
drop policy if exists "anon full access" on public.meals;
drop policy if exists "anon full access" on public.ratings;
drop policy if exists "cafeterias members" on public.cafeterias;
drop policy if exists "meals read"     on public.meals;
drop policy if exists "meals insert"   on public.meals;
drop policy if exists "meals delete"   on public.meals;
drop policy if exists "ratings read"   on public.ratings;
drop policy if exists "ratings insert" on public.ratings;
drop policy if exists "ratings update" on public.ratings;

-- 식당 정보는 둘 다 등록/수정할 수 있게 둔다.
create policy "cafeterias members" on public.cafeterias
  for all to authenticated
  using (public.my_role() is not null)
  with check (public.my_role() is not null);

-- 기록은 둘 다 보지만, 올리고 지우는 건 업로더만.
create policy "meals read" on public.meals
  for select to authenticated using (public.my_role() is not null);
create policy "meals insert" on public.meals
  for insert to authenticated with check (public.my_role() = 'uploader');
create policy "meals delete" on public.meals
  for delete to authenticated using (public.my_role() = 'uploader');

-- 평가는 둘 다 보지만, 남기고 고치는 건 평가자만.
create policy "ratings read" on public.ratings
  for select to authenticated using (public.my_role() is not null);
create policy "ratings insert" on public.ratings
  for insert to authenticated with check (public.my_role() = 'rater');
create policy "ratings update" on public.ratings
  for update to authenticated
  using (public.my_role() = 'rater')
  with check (public.my_role() = 'rater');

-- ===============================================================
-- 7. 사진 버킷 — 비공개. 앱은 만료되는 서명 URL로만 읽는다.
-- ===============================================================
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "meal photos read"   on storage.objects;
drop policy if exists "meal photos write"  on storage.objects;
drop policy if exists "meal photos delete" on storage.objects;

create policy "meal photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos' and public.my_role() is not null);
create policy "meal photos write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos' and public.my_role() = 'uploader');
create policy "meal photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos' and public.my_role() = 'uploader');
