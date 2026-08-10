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
 * Extracts EXIF metadata from an uploaded image File, Blob, or URL.
 * Automatically filters out screenshots and returns null if a screenshot is detected.
 * @param {File|Blob|string} imageInput 
 * @returns {Promise<Object|null>} Formatted photo metadata object or null if screenshot
 */
export async function parsePhotoExif(imageInput) {
  const fileName = imageInput.name || '';
  const fileType = imageInput.type || '';

  // Quick initial filename check for screenshots before parsing
  if (checkIsScreenshot(fileName, null, fileType)) {
    console.log(`[Filtered Screenshot]: ${fileName}`);
    return null;
  }

  try {
    // Extract EXIF tags using exifr with fast header read
    const rawData = await exifr.parse(imageInput, {
      gps: true,
      exif: true,
      tiff: true,
      pick: ['latitude', 'longitude', 'altitude', 'DateTimeOriginal', 'Make', 'Model', 'ISO', 'FNumber', 'ExposureTime', 'FocalLength']
    });

    // Deep screenshot check using parsed EXIF data
    if (checkIsScreenshot(fileName, rawData, fileType)) {
      console.log(`[Filtered Screenshot via EXIF]: ${fileName}`);
      return null;
    }

    let latitude = null;
    let longitude = null;
    let altitude = null;
    let date = new Date();
    let cameraMake = 'Camera';
    let cameraModel = 'Smartphone/Camera';
    let iso = null;
    let aperture = null;

    if (rawData) {
      if (typeof rawData.latitude === 'number' && !isNaN(rawData.latitude)) {
        latitude = rawData.latitude;
      }
      if (typeof rawData.longitude === 'number' && !isNaN(rawData.longitude)) {
        longitude = rawData.longitude;
      }
      if (typeof rawData.altitude === 'number') {
        altitude = Math.round(rawData.altitude);
      }
      if (rawData.DateTimeOriginal) {
        date = new Date(rawData.DateTimeOriginal);
      }
      if (rawData.Make) cameraMake = String(rawData.Make).trim();
      if (rawData.Model) cameraModel = String(rawData.Model).trim();
      if (rawData.ISO) iso = rawData.ISO;
      if (rawData.FNumber) aperture = `f/${rawData.FNumber}`;
    }

    // Generate object URL for preview
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
      locationName: '위치 확인 중...'
    };
  } catch (error) {
    console.warn('EXIF parsing fallback for image:', error);
    if (checkIsScreenshot(fileName, null, fileType)) {
      return null;
    }
    let url = typeof imageInput === 'string' ? imageInput : URL.createObjectURL(imageInput);
    return {
      id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7),
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
