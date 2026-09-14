// EXIF 읽기만 담당한다.
//
// photo.js 와 나눠둔 이유: exifr 이 26KB 라서, 사진을 줄이기만 하면 되는 쪽
// (설정의 '사진 다시 압축') 까지 이걸 끌고 오면 앱 시작이 그만큼 느려진다.
// 그쪽은 photo.js 만 쓰고, 이 파일은 올리기 화면에서만 불린다.

import exifr from 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs';

/**
 * 사진에서 좌표와 촬영시각을 읽는다.
 * 브라우저 카메라로 방금 찍은 사진에는 GPS가 거의 없고, iOS는 앨범 사진도 GPS를
 * 지워서 넘기는 경우가 많다. 둘 다 null 일 수 있다.
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
