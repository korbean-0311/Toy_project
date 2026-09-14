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
    .select('*, cafeteria:cafeterias(*), rating:ratings(*)')
    .order('taken_at', { ascending: false });
  if (error) throw error;

  // ratings 는 1:1이지만 PostgREST가 배열로 줄 때가 있어 평탄화한다
  return (data ?? []).map((m) => ({
    ...m,
    rating: Array.isArray(m.rating) ? (m.rating[0] ?? null) : m.rating,
  }));
}

export async function getMeal(id) {
  const { data, error } = await supabase
    .from('meals')
    .select('*, cafeteria:cafeterias(*), rating:ratings(*)')
    .eq('id', id)
    .single();
  if (error) throw error;

  return { ...data, rating: Array.isArray(data.rating) ? (data.rating[0] ?? null) : data.rating };
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

/**
 * 버킷이 비공개라 사진은 만료되는 서명 URL로만 읽는다.
 * 여러 장이면 한 번에 서명한다.
 * @returns {Promise<Map<string, string>>} photo_path → url
 */
export async function signedUrls(paths) {
  const unique = [...new Set(paths)].filter(Boolean);
  if (!unique.length) return new Map();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL);
  if (error) throw error;

  return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

export async function signedUrl(path) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
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
