/**
 * Calculates Haversine distance in kilometers between two GPS coordinates
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Spatio-Temporal Trip Clustering Algorithm
 * Clusters photos into discrete "Trips" based on distance (<50km) and time gap (<48 hours)
 * @param {Array} photos List of photo metadata objects
 * @param {number} maxDistanceKm Maximum distance threshold (default 50km)
 * @param {number} maxTimeGapHours Maximum time gap threshold (default 48h)
 * @returns {Array} List of Trip objects
 */
export function clusterPhotosIntoTrips(photos, maxDistanceKm = 50, maxTimeGapHours = 48) {
  const gpsPhotos = photos.filter(p => p.hasGps).sort((a, b) => a.timestamp - b.timestamp);
  if (gpsPhotos.length === 0) return [];

  const trips = [];
  let currentTripPhotos = [gpsPhotos[0]];

  for (let i = 1; i < gpsPhotos.length; i++) {
    const prev = currentTripPhotos[currentTripPhotos.length - 1];
    const curr = gpsPhotos[i];

    const timeGapHours = Math.abs(curr.timestamp - prev.timestamp) / (1000 * 60 * 60);
    const distKm = calculateHaversineDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);

    // If photos are close in time AND space, group into same trip
    if (timeGapHours <= maxTimeGapHours && distKm <= maxDistanceKm) {
      currentTripPhotos.push(curr);
    } else {
      // Finalize previous trip
      trips.push(createTripRecord(currentTripPhotos));
      currentTripPhotos = [curr];
    }
  }

  if (currentTripPhotos.length > 0) {
    trips.push(createTripRecord(currentTripPhotos));
  }

  // The route itself stays time-ascending inside each trip, while the record list presents the
  // most recent journey first.
  return trips.reverse();
}

function createTripRecord(photos) {
  const startDate = new Date(photos[0].timestamp);
  const endDate = new Date(photos[photos.length - 1].timestamp);
  
  // Calculate total route distance
  let totalDistance = 0;
  for (let i = 0; i < photos.length - 1; i++) {
    totalDistance += calculateHaversineDistance(
      photos[i].latitude, photos[i].longitude,
      photos[i + 1].latitude, photos[i + 1].longitude
    );
  }

  // Calculate centroid
  const avgLat = photos.reduce((sum, p) => sum + p.latitude, 0) / photos.length;
  const avgLng = photos.reduce((sum, p) => sum + p.longitude, 0) / photos.length;

  const durationDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));

  return {
    // Derived from the first photo so re-clustering keeps stable React keys.
    id: 'trip_' + photos[0].id,
    title: photos[0].locationName !== '위치 확인 중...' ? photos[0].locationName + ' 여행' : '추억의 여행',
    startDateFormatted: startDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    endDateFormatted: endDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    durationDays,
    totalDistanceKm: Math.round(totalDistance * 10) / 10,
    photoCount: photos.length,
    coverPhoto: photos[0],
    photos,
    centerLat: avgLat,
    centerLng: avgLng
  };
}

/**
 * Reverse Geocoding via OpenStreetMap Nominatim with local browser cache
 */
const geocodeCache = new Map();

/** ~1km grid cell. Photos sharing a cell resolve to the same place name and one lookup. */
export function geocodeKey(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export async function reverseGeocode(lat, lng) {
  const key = geocodeKey(lat, lng);
  if (geocodeCache.has(key)) {
    return geocodeCache.get(key);
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko`,
      { headers: { 'User-Agent': 'TravelExifMapApp/1.0' } }
    );
    if (!response.ok) throw new Error('Geocoding API HTTP error');
    const data = await response.json();
    
    let locationStr = '알 수 없는 장소';
    if (data.address) {
      const city = data.address.city || data.address.county || data.address.state || data.address.town || '';
      const country = data.address.country || '';
      const suburb = data.address.suburb || data.address.village || data.address.neighbourhood || '';
      locationStr = [country, city, suburb].filter(Boolean).join(' ');
    } else if (data.display_name) {
      locationStr = data.display_name.split(',').slice(0, 2).join(' ');
    }

    geocodeCache.set(key, locationStr);
    return locationStr;
  } catch (error) {
    console.warn('Reverse geocoding failed:', error);
    const fallback = `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
    geocodeCache.set(key, fallback);
    return fallback;
  }
}
