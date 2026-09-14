// 업로드용으로 사진을 줄인다. EXIF 읽기는 exif.js 에 따로 있다 —
// 그쪽이 26KB 짜리 라이브러리를 끌고 오기 때문에, 리사이즈만 필요한 곳이
// 그걸 같이 받지 않도록 갈라뒀다.

import { IMAGE_MAX_EDGE, IMAGE_QUALITY } from '../config.js';

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
