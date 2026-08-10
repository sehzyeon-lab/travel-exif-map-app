import exifr from 'exifr';

/**
 * Detects if a file is a screenshot, screen recording, or capture based on filename and EXIF data.
 */
export function checkIsScreenshot(fileName, rawData, fileType) {
  const name = (fileName || '').toLowerCase();
  
  // 1. Filename keyword checks (Korean & English)
  const keywords = [
    'screenshot', 'screen_shot', 'screen_record', 'screenrecord',
    '스크린샷', '캡처', 'capture', 'frame_', 'kakaotalk_photo', 'edit_'
  ];
  if (keywords.some(kw => name.includes(kw))) {
    return true;
  }

  // 2. PNG images without hardware camera EXIF tags are screenshots
  const isPng = fileType === 'image/png' || name.endsWith('.png');
  const hasCameraHardware = rawData && (rawData.Make || rawData.Model || rawData.FNumber || rawData.ISO);
  if (isPng && !hasCameraHardware) {
    return true;
  }

  return false;
}

/**
 * Generates a unique fingerprint for a file to prevent duplicates.
 */
export function getPhotoFingerprint(file) {
  if (typeof file === 'string') return file;
  const name = file.name || 'unnamed';
  const size = file.size || 0;
  const lastMod = file.lastModified || 0;
  return `${name}_${size}_${lastMod}`;
}

/**
 * Converts Degrees/Minutes/Seconds (DMS) GPS arrays or raw values to Decimal Degrees (DD).
 */
function parseCoordinate(val, ref) {
  if (typeof val === 'number' && !isNaN(val)) {
    if (ref === 'S' || ref === 'W') return -Math.abs(val);
    return val;
  }
  if (Array.isArray(val) && val.length >= 3) {
    const deg = Number(val[0]) || 0;
    const min = Number(val[1]) || 0;
    const sec = Number(val[2]) || 0;
    let dd = deg + (min / 60) + (sec / 3600);
    if (ref === 'S' || ref === 'W') dd = -dd;
    return dd;
  }
  return null;
}

/**
 * Extracts EXIF metadata from an uploaded image File, Blob, or URL.
 * Full EXIF header parsing supporting Samsung Galaxy, iPhone, Sony, etc.
 * @param {File|Blob|string} imageInput 
 * @returns {Promise<Object|null>} Formatted photo metadata object or null if screenshot
 */
export async function parsePhotoExif(imageInput) {
  const fileName = imageInput.name || '';
  const fileType = imageInput.type || '';
  const fingerprint = getPhotoFingerprint(imageInput);

  // Quick initial filename check for screenshots before parsing
  if (checkIsScreenshot(fileName, null, fileType)) {
    return null;
  }

  try {
    let latitude = null;
    let longitude = null;
    let altitude = null;

    // 1. Dedicated exifr.gps() call with default chunking for full APP1 EXIF segment read
    try {
      const gpsData = await exifr.gps(imageInput);
      if (gpsData && typeof gpsData.latitude === 'number' && !isNaN(gpsData.latitude)) {
        latitude = gpsData.latitude;
        longitude = gpsData.longitude;
        if (typeof gpsData.altitude === 'number') {
          altitude = Math.round(gpsData.altitude);
        }
      }
    } catch (gpsErr) {
      console.warn('exifr.gps parse warning:', gpsErr);
    }

    // 2. Comprehensive EXIF tag parse (Full APP1 header)
    const rawData = await exifr.parse(imageInput, {
      gps: true,
      exif: true,
      tiff: true,
      mergeOutput: true
    });

    // Deep screenshot check using parsed EXIF data
    if (checkIsScreenshot(fileName, rawData, fileType)) {
      return null;
    }

    let date = new Date();
    let cameraMake = 'Camera';
    let cameraModel = 'Smartphone/Camera';
    let iso = null;
    let aperture = null;

    if (rawData) {
      // Fallback GPS parsing if exifr.gps didn't populate latitude/longitude
      if (latitude === null) {
        if (typeof rawData.latitude === 'number' && !isNaN(rawData.latitude)) {
          latitude = rawData.latitude;
          longitude = rawData.longitude;
        } else if (rawData.GPSLatitude || rawData.latitude) {
          latitude = parseCoordinate(rawData.GPSLatitude || rawData.latitude, rawData.GPSLatitudeRef);
          longitude = parseCoordinate(rawData.GPSLongitude || rawData.longitude, rawData.GPSLongitudeRef);
        }
      }

      if (altitude === null && typeof rawData.altitude === 'number') {
        altitude = Math.round(rawData.altitude);
      } else if (altitude === null && typeof rawData.GPSAltitude === 'number') {
        altitude = Math.round(rawData.GPSAltitude);
      }

      if (rawData.DateTimeOriginal) {
        date = new Date(rawData.DateTimeOriginal);
      } else if (rawData.CreateDate) {
        date = new Date(rawData.CreateDate);
      } else if (rawData.ModifyDate) {
        date = new Date(rawData.ModifyDate);
      }

      if (rawData.Make) cameraMake = String(rawData.Make).trim();
      if (rawData.Model) cameraModel = String(rawData.Model).trim();
      if (rawData.ISO) iso = rawData.ISO;
      if (rawData.FNumber) aperture = `f/${rawData.FNumber}`;
    }

    // Fallback to File.lastModified if no EXIF date
    if ((!rawData || !rawData.DateTimeOriginal) && imageInput.lastModified) {
      date = new Date(imageInput.lastModified);
    }

    // Generate preview URL
    let url = '';
    if (typeof imageInput === 'string') {
      url = imageInput;
    } else if (imageInput instanceof Blob || imageInput instanceof File) {
      url = URL.createObjectURL(imageInput);
    }

    const hasGps = latitude !== null && longitude !== null &&
                   latitude >= -90 && latitude <= 90 &&
                   longitude >= -180 && longitude <= 180;

    return {
      id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7),
      fingerprint,
      name: fileName || 'Photo',
      url,
      hasGps,
      latitude,
      longitude,
      altitude,
      timestamp: date.getTime(),
      dateFormatted: date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
      }) + ' ' + date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      cameraMake,
      cameraModel,
      iso,
      aperture,
      locationName: hasGps ? '위치 확인 중...' : '위치 정보 없음'
    };
  } catch (error) {
    if (checkIsScreenshot(fileName, null, fileType)) {
      return null;
    }
    let url = typeof imageInput === 'string' ? imageInput : URL.createObjectURL(imageInput);
    return {
      id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7),
      fingerprint,
      name: fileName || 'Photo',
      url,
      hasGps: false,
      latitude: null,
      longitude: null,
      altitude: null,
      timestamp: Date.now(),
      dateFormatted: new Date().toLocaleDateString('ko-KR'),
      cameraMake: 'Unknown',
      cameraModel: 'Standard Image',
      locationName: '위치 정보 없음'
    };
  }
}
