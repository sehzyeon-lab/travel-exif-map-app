import exifr from 'exifr';

const SCREENSHOT_KEYWORDS = [
  'screenshot', 'screen_shot', 'screen_record', 'screenrecord',
  '스크린샷', '캡처', '캡쳐', 'capture'
];

/**
 * Detects screenshots / screen recordings from the filename, and from the absence of camera EXIF
 * on a PNG (phone cameras write JPEG/HEIC, screen captures write PNG).
 */
export function checkIsScreenshot(fileName, rawData, fileType) {
  const name = (fileName || '').toLowerCase();
  if (SCREENSHOT_KEYWORDS.some((kw) => name.includes(kw))) return true;

  const isPng = fileType === 'image/png' || name.endsWith('.png');
  const hasCameraHardware = rawData && (rawData.Make || rawData.Model || rawData.FNumber || rawData.ISO);
  return isPng && !hasCameraHardware;
}

/**
 * True when a record looks like a genuine captured photo — it carries GPS, a camera make/model,
 * or shutter settings (ISO/aperture/altitude). Screenshots, saved web images, memes, and messenger
 * downloads with every EXIF tag stripped carry none of these, so they are kept out of the library.
 */
export function isImportablePhoto(photo) {
  if (!photo) return false;
  return !!(
    photo.hasGps ||
    photo.cameraMake ||
    photo.cameraModel ||
    photo.iso ||
    photo.aperture ||
    typeof photo.altitude === 'number'
  );
}

export function getPhotoFingerprint(file) {
  if (typeof file === 'string') return file;
  const name = file.name || 'unnamed';
  const size = file.size || 0;
  const lastMod = file.lastModified || 0;
  return `${name}_${size}_${lastMod}`;
}

export function formatPhotoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  });
  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

/** Degrees/Minutes/Seconds arrays or plain decimals -> decimal degrees. */
function parseCoordinate(val, ref) {
  if (typeof val === 'number' && !Number.isNaN(val)) {
    return ref === 'S' || ref === 'W' ? -Math.abs(val) : val;
  }
  if (Array.isArray(val) && val.length >= 3) {
    const dd = (Number(val[0]) || 0) + (Number(val[1]) || 0) / 60 + (Number(val[2]) || 0) / 3600;
    return ref === 'S' || ref === 'W' ? -dd : dd;
  }
  return null;
}

function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    !Number.isNaN(lat) && !Number.isNaN(lng) &&
    !(lat === 0 && lng === 0) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

/**
 * Parses EXIF from a File/Blob picked through the web file input.
 *
 * Note for Android: the system picker hands back a redacted copy with GPS tags stripped unless the
 * app holds ACCESS_MEDIA_LOCATION and reads the original URI, which a WebView file input cannot do.
 * The native MediaStore scan (see mediaStore.js) is the path that actually recovers GPS on device.
 */
export async function parsePhotoExif(imageInput) {
  const fileName = imageInput.name || 'Photo';
  const fileType = imageInput.type || '';
  const fingerprint = getPhotoFingerprint(imageInput);
  const isBlob = imageInput instanceof Blob;

  if (checkIsScreenshot(fileName, null, fileType)) return null;

  let latitude = null;
  let longitude = null;
  let altitude = null;
  let rawData = null;

  try {
    const gpsData = await exifr.gps(imageInput);
    if (gpsData && isValidCoordinate(gpsData.latitude, gpsData.longitude)) {
      latitude = gpsData.latitude;
      longitude = gpsData.longitude;
      if (typeof gpsData.altitude === 'number') altitude = Math.round(gpsData.altitude);
    }
  } catch {
    // exifr throws on files with no APP1 segment at all; the full parse below still runs.
  }

  try {
    rawData = await exifr.parse(imageInput, { gps: true, exif: true, tiff: true, mergeOutput: true });
  } catch {
    rawData = null;
  }

  if (checkIsScreenshot(fileName, rawData, fileType)) return null;

  let date = null;
  let cameraMake = null;
  let cameraModel = null;
  let iso = null;
  let aperture = null;

  if (rawData) {
    if (latitude === null) {
      if (isValidCoordinate(rawData.latitude, rawData.longitude)) {
        latitude = rawData.latitude;
        longitude = rawData.longitude;
      } else if (rawData.GPSLatitude) {
        const lat = parseCoordinate(rawData.GPSLatitude, rawData.GPSLatitudeRef);
        const lng = parseCoordinate(rawData.GPSLongitude, rawData.GPSLongitudeRef);
        if (isValidCoordinate(lat, lng)) {
          latitude = lat;
          longitude = lng;
        }
      }
    }

    if (altitude === null) {
      const alt = typeof rawData.altitude === 'number' ? rawData.altitude : rawData.GPSAltitude;
      if (typeof alt === 'number') altitude = Math.round(alt);
    }

    const rawDate = rawData.DateTimeOriginal || rawData.CreateDate || rawData.ModifyDate;
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!Number.isNaN(parsed.getTime())) date = parsed;
    }

    if (rawData.Make) cameraMake = String(rawData.Make).trim();
    if (rawData.Model) cameraModel = String(rawData.Model).trim();
    if (rawData.ISO) iso = rawData.ISO;
    if (rawData.FNumber) aperture = `f/${rawData.FNumber}`;
  }

  if (!date && imageInput.lastModified) date = new Date(imageInput.lastModified);
  if (!date) date = new Date();

  const hasGps = isValidCoordinate(latitude, longitude);

  return {
    id: 'file_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
    source: 'file',
    mediaId: null,
    fingerprint,
    name: fileName,
    album: null,
    // Kept so the preview survives an app restart; storage.js recreates the object URL on load.
    blob: isBlob ? imageInput : null,
    url: isBlob ? URL.createObjectURL(imageInput) : String(imageInput),
    hasGps,
    latitude: hasGps ? latitude : null,
    longitude: hasGps ? longitude : null,
    altitude,
    timestamp: date.getTime(),
    dateFormatted: formatPhotoDate(date),
    cameraMake,
    cameraModel,
    iso,
    aperture,
    locationName: hasGps ? '위치 확인 중...' : '위치 정보 없음'
  };
}
