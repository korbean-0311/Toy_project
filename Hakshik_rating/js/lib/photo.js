// 사진에서 메타데이터(GPS/촬영시각)를 뽑고, 업로드용으로 줄인다.

import exifr from 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs';
import { IMAGE_MAX_EDGE, IMAGE_QUALITY } from '../config.js';

/**
 * EXIF에서 좌표와 촬영시각을 읽는다.
 * 브라우저 카메라로 방금 찍은 사진에는 GPS가 거의 없고,
 * iOS는 앨범 사진도 GPS를 지워서 넘기는 경우가 많다. 둘 다 null일 수 있다.
 * @returns {{coords: {lat, lng} | null, takenAt: Date | null}}
 */
export async function readExif(file) {
  let coords = null;
  let takenAt = null;

  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      coords = { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {
    // EXIF가 없거나 못 읽는 포맷 — 조용히 넘어간다
  }

  try {
    const tags = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] });
    const raw = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) takenAt = raw;
  } catch {
    // 위와 같음
  }

  return { coords, takenAt };
}

/**
 * 긴 변을 IMAGE_MAX_EDGE 로 줄여 JPEG Blob 으로 다시 굽는다.
 * 폰 원본은 3~5MB라 그대로 올리면 느리고, 다시 굽는 과정에서 EXIF도 떨어져 나간다
 * (좌표는 이미 readExif 로 따로 빼둔 뒤다).
 * 디코딩이 안 되는 포맷이면 원본을 그대로 돌려준다.
 */
export async function shrink(file) {
  const bitmap = await decode(file);
  if (!bitmap) return { blob: file, type: file.type || 'image/jpeg' };

  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  if (bitmap.dataset?.objectUrl) URL.revokeObjectURL(bitmap.dataset.objectUrl);

  const blob = await new Promise((res) =>
    canvas.toBlob(res, 'image/jpeg', IMAGE_QUALITY),
  );

  return blob ? { blob, type: 'image/jpeg' } : { blob: file, type: file.type || 'image/jpeg' };
}

async function decode(file) {
  // createImageBitmap 이 EXIF 회전까지 반영해준다
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* 아래 <img> 경로로 */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    img.dataset.objectUrl = url; // 그리고 난 뒤 shrink() 에서 해제한다
    return img;
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}
