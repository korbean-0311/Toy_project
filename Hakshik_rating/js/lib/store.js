// Supabase 접근은 전부 여기를 거친다.

import { supabase } from './supabase.js';
import { BUCKET } from '../config.js';

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

export function photoUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function createMeal(meal) {
  const { data, error } = await supabase.from('meals').insert(meal).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMeal(meal) {
  const { error } = await supabase.from('meals').delete().eq('id', meal.id);
  if (error) throw error;
  // 사진 삭제는 실패해도 기록 삭제를 되돌리지 않는다
  await supabase.storage.from(BUCKET).remove([meal.photo_path]).catch(() => {});
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
