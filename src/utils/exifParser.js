import exifr from 'exifr';

/**
 * Extracts EXIF metadata from an uploaded image File, Blob, or URL
 * @param {File|Blob|string} imageInput 
 * @returns {Promise<Object>} Formatted photo metadata object
 */
export async function parsePhotoExif(imageInput) {
  try {
    // Extract full EXIF tags using exifr
    const rawData = await exifr.parse(imageInput, {
      gps: true,
      exif: true,
      tiff: true,
      pick: ['latitude', 'longitude', 'altitude', 'DateTimeOriginal', 'Make', 'Model', 'ISO', 'FNumber', 'ExposureTime', 'FocalLength']
    });

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

    // Generate object URL for image preview if File object
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
      id: 'photo_' + Math.random().toString(36).substr(2, 9),
      name: imageInput.name || 'Photo',
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
    let url = typeof imageInput === 'string' ? imageInput : URL.createObjectURL(imageInput);
    return {
      id: 'photo_' + Math.random().toString(36).substr(2, 9),
      name: imageInput.name || 'Photo',
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
