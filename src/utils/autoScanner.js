import { scanGallery, isNative } from './mediaStore';
import { formatPhotoDate } from './exifParser';

/**
 * Maps one native MediaStore row into the app's photo shape.
 * Native photos carry no `url` — the grid resolves a thumbnail lazily from `mediaId`.
 */
function toPhoto(item) {
  const timestamp = item.timestamp > 0 ? item.timestamp : Date.now();
  const hasGps =
    item.hasGps === true &&
    typeof item.latitude === 'number' &&
    typeof item.longitude === 'number';

  return {
    id: 'ms_' + item.id,
    source: 'mediastore',
    mediaId: String(item.id),
    fingerprint: `${item.name}_${item.size || 0}_${timestamp}`,
    name: item.name,
    album: item.album || null,
    url: null,
    hasGps,
    latitude: hasGps ? item.latitude : null,
    longitude: hasGps ? item.longitude : null,
    altitude: typeof item.altitude === 'number' ? item.altitude : null,
    timestamp,
    dateFormatted: formatPhotoDate(new Date(timestamp)),
    cameraMake: item.cameraMake || null,
    cameraModel: item.cameraModel || null,
    iso: typeof item.iso === 'number' ? item.iso : null,
    aperture: item.aperture || null,
    locationName: hasGps ? '위치 확인 중...' : '위치 정보 없음'
  };
}

/**
 * Scans the device gallery through the native MediaStore plugin.
 *
 * @param {object}  [options]
 * @param {number}  [options.since] Only read images modified after this epoch-ms. Reading a full
 *                                  gallery means opening every file to parse its EXIF header, so
 *                                  routine refreshes should pass the previous scan time.
 */
export async function scanDeviceGallery({
  onProgress,
  limit = 0,
  since = 0,
  requestLocationPermission = true
} = {}) {
  if (!isNative()) {
    return { photos: [], total: 0, skipped: 0, withGps: 0, mediaLocationGranted: false, scannedAt: 0 };
  }

  const result = await scanGallery({ onProgress, limit, since, requestLocationPermission });
  const photos = (result.photos || []).map(toPhoto);

  return {
    photos,
    total: result.total || photos.length,
    skipped: result.skipped || 0,
    withGps: result.withGps ?? photos.filter((p) => p.hasGps).length,
    mediaLocationGranted: result.mediaLocationGranted !== false,
    scannedAt: result.scannedAt || Date.now()
  };
}
