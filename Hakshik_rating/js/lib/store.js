// Supabase 접근은 전부 여기를 거친다.

import { supabase } from './supabase.js';
import { BUCKET, SIGNED_URL_TTL } from '../config.js';

/* ── 식당 ─────────────────────────────────────────────────────── */

export async function listCafeterias() {
  const { data, error } = await supabase
    .from('cafeterias')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function saveCafeteria(cafeteria) {
  const row = {
    name: cafeteria.name,
    building: cafeteria.building || null,
    lat: cafeteria.lat,
    lng: cafeteria.lng,
    radius_m: cafeteria.radius_m,
  };

  const query = cafeteria.id
    ? supabase.from('cafeterias').update(row).eq('id', cafeteria.id)
    : supabase.from('cafeterias').insert(row);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteCafeteria(id) {
  const { error } = await supabase.from('cafeterias').delete().eq('id', id);
  if (error) throw error;
}

/* ── 학식 기록 ────────────────────────────────────────────────── */

export async function listMeals() {
  const { data, error } = await supabase
    .from('meals')
    .select('*, cafeteria:cafeterias(*), rating:ratings(*), comments(count)')
    .order('taken_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map(flattenMeal);
}

// ratings 는 1:1이지만 PostgREST가 배열로 줄 때가 있어 평탄화한다.
// comments(count) 는 [{count: n}] 모양으로 온다.
function flattenMeal(m) {
  return {
    ...m,
    rating: Array.isArray(m.rating) ? (m.rating[0] ?? null) : m.rating,
    commentCount: Array.isArray(m.comments) ? (m.comments[0]?.count ?? 0) : 0,
  };
}

export async function getMeal(id) {
  const { data, error } = await supabase
    .from('meals')
    .select('*, cafeteria:cafeterias(*), rating:ratings(*), comments(count)')
    .eq('id', id)
    .single();
  if (error) throw error;

  return flattenMeal(data);
}

export async function uploadPhoto(blob, type) {
  const ext = type === 'image/png' ? 'png' : 'jpg';
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: type, cacheControl: '31536000' });
  if (error) throw error;

  return path;
}

/* ── 사진 URL ─────────────────────────────────────────────────
   버킷이 비공개라 사진은 만료되는 서명 URL로만 읽는다.

   서명할 때마다 토큰이 달라지므로 URL 도 매번 바뀐다. 그대로 두면 피드에 들어올
   때마다 브라우저가 "처음 보는 주소" 로 여겨서 사진을 전부 다시 받는다. 그래서
   발급한 URL 을 만료 시각과 함께 기억해뒀다가 재사용한다 — 주소가 같아야 캐시가 산다.
   ──────────────────────────────────────────────────────────── */

const URL_CACHE_KEY = 'hakshik.photoUrls';
const EXPIRY_SKEW = 90_000; // 만료 직전 것은 새로 받는다

const urlCache = loadUrlCache();

function loadUrlCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(URL_CACHE_KEY) ?? '{}');
    const now = Date.now();
    return new Map(Object.entries(raw).filter(([, v]) => v?.expiresAt > now + EXPIRY_SKEW));
  } catch {
    return new Map();
  }
}

function saveUrlCache() {
  try {
    localStorage.setItem(URL_CACHE_KEY, JSON.stringify(Object.fromEntries(urlCache)));
  } catch {
    /* 저장 공간이 없으면 이번 세션 동안만 쓴다 */
  }
}

/** 사진을 갈아끼웠을 때 호출한다. 안 그러면 옛 사진이 캐시에서 계속 나온다. */
export function forgetPhotoUrl(path) {
  urlCache.delete(path);
  saveUrlCache();
}

/**
 * @returns {Promise<Map<string, string>>} photo_path → url
 */
export async function signedUrls(paths) {
  const unique = [...new Set(paths)].filter(Boolean);
  if (!unique.length) return new Map();

  const now = Date.now();
  const out = new Map();
  const missing = [];

  for (const path of unique) {
    const hit = urlCache.get(path);
    if (hit && hit.expiresAt > now + EXPIRY_SKEW) out.set(path, hit.url);
    else missing.push(path);
  }

  if (missing.length) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(missing, SIGNED_URL_TTL);
    if (error) throw error;

    const expiresAt = now + SIGNED_URL_TTL * 1000;
    for (const row of data ?? []) {
      if (!row.signedUrl) continue;
      urlCache.set(row.path, { url: row.signedUrl, expiresAt });
      out.set(row.path, row.signedUrl);
    }
    saveUrlCache();
  }

  return out;
}

export async function signedUrl(path) {
  return (await signedUrls([path])).get(path) ?? '';
}

/** 이미 있는 경로에 파일을 올린다 (사진 교체용). */
export async function uploadPhotoAt(path, blob, type) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: type, cacheControl: '31536000' });
  if (error) throw error;
}

export async function deletePhoto(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function createMeal(meal) {
  const { data, error } = await supabase.from('meals').insert(meal).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMeal(meal) {
  const { error } = await supabase.from('meals').delete().eq('id', meal.id);
  if (error) throw error;

  forgetPhotoUrl(meal.photo_path);

  // 사진이 안 지워져도 기록 삭제를 되돌리진 않는다. 다만 조용히 넘기면
  // 버킷에 고아 파일이 쌓이는 걸 알 길이 없으므로 콘솔에는 남긴다.
  // (storage 는 reject 대신 {error} 를 돌려주므로 catch 로는 못 잡는다)
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([meal.photo_path]);
  if (storageError) {
    console.warn('사진을 지우지 못했습니다:', meal.photo_path, storageError.message);
  }
}

/* ── 평가 ─────────────────────────────────────────────────────── */

export async function saveRating({ mealId, stars, comment }) {
  const { data, error } = await supabase
    .from('ratings')
    .upsert({ meal_id: mealId, stars, comment: comment || null }, { onConflict: 'meal_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ── 댓글 ─────────────────────────────────────────────────────
   평가의 한줄평이 스레드의 뿌리다. parent_id 가 null 인 댓글은 그 한줄평에
   직접 단 답글이고, 값이 있으면 그 답글에 다시 단 답글이다. */

export async function listComments(mealId) {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('meal_id', mealId)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function addComment({ mealId, parentId = null, body }) {
  // author 는 서버가 my_role() 로 채운다 — 남의 이름으로 못 쓴다
  const { data, error } = await supabase
    .from('comments')
    .insert({ meal_id: mealId, parent_id: parentId, body })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}
