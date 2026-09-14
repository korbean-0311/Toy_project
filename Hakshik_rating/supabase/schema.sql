-- Hakshik_rating 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 실행하세요.

-- ---------------------------------------------------------------
-- 1. 식당 (설정 화면에서 GPS 좌표를 직접 등록/수정한다)
-- ---------------------------------------------------------------
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

-- ---------------------------------------------------------------
-- 2. 학식 기록 (업로더가 올린 사진 1장 = 1행)
-- ---------------------------------------------------------------
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

-- ---------------------------------------------------------------
-- 3. 평가 (평가자가 남긴 별점 + 한줄평, 기록당 1개)
-- ---------------------------------------------------------------
create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null unique references public.meals(id) on delete cascade,
  -- 0.5 ~ 5.0, 0.5 간격만 허용
  stars      numeric(2, 1) not null
             check (stars >= 0.5 and stars <= 5.0 and (stars * 2) = floor(stars * 2)),
  comment    text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 4. RLS
--    두 명만 쓰는 사이트라 Supabase Auth 없이 anon 키로 접근한다.
--    즉 URL과 anon 키를 아는 사람은 누구나 읽고 쓸 수 있다는 뜻이므로,
--    링크를 외부에 뿌리지 말 것. (나중에 Auth 붙이면 여기를 조인다)
-- ---------------------------------------------------------------
alter table public.cafeterias enable row level security;
alter table public.meals      enable row level security;
alter table public.ratings    enable row level security;

drop policy if exists "anon full access" on public.cafeterias;
drop policy if exists "anon full access" on public.meals;
drop policy if exists "anon full access" on public.ratings;

create policy "anon full access" on public.cafeterias
  for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.meals
  for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.ratings
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------
-- 5. 사진 저장용 Storage 버킷
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;

drop policy if exists "meal photos read"   on storage.objects;
drop policy if exists "meal photos write"  on storage.objects;
drop policy if exists "meal photos delete" on storage.objects;

create policy "meal photos read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'meal-photos');
create policy "meal photos write" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'meal-photos');
create policy "meal photos delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'meal-photos');
