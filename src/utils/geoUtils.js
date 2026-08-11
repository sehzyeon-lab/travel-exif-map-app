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

/** Photos taken within this radius of the registered home are treated as "not travel". */
export const HOME_RADIUS_KM = 3;
/** A trip whose centroid stays within this radius of home counts as a local outing, not a trip. */
const OUTING_RADIUS_KM = 15;

/** True when a GPS photo was taken close to the user's registered home. */
export function isAtHome(photo, home) {
  if (!home || !photo?.hasGps) return false;
  return calculateHaversineDistance(photo.latitude, photo.longitude, home.lat, home.lng) <= HOME_RADIUS_KM;
}

/** Stable key for a trip so a user's custom name survives re-clustering. */
export function tripKeyOf(startTimestamp, centerLat, centerLng) {
  const day = new Date(startTimestamp).toISOString().slice(0, 10);
  return `${day}_${centerLat.toFixed(1)}_${centerLng.toFixed(1)}`;
}

/**
 * Spatio-Temporal Trip Clustering.
 *
 * Photos are grouped into a trip while they stay close in time AND space. Compared to the old
 * per-photo pairing, two things reduce over-segmentation: the distance is measured against the
 * trip's running centroid (so a wide-area day out doesn't fragment), and the thresholds are more
 * generous. Photos taken at/near the registered home are dropped first, so "at home" gaps don't
 * artificially split neighbouring travel days.
 *
 * @param {Array}  photos
 * @param {object} [options]
 * @param {{lat:number,lng:number}} [options.home]      Registered home; nearby photos are excluded.
 * @param {Map|object} [options.nameOverrides]          tripKey -> custom title.
 * @param {Set}    [options.mergeBoundaries]            Photo ids that must NOT start a new trip
 *                                                      (user merged this trip into the previous one).
 * @param {Set}    [options.splitBoundaries]            Photo ids that MUST start a new trip
 *                                                      (user split a trip here).
 * @param {number} [options.maxDistanceKm]              Max distance from a trip's centroid (default 80).
 * @param {number} [options.maxTimeGapHours]            Max quiet gap before a new trip starts (default 36).
 */
export function clusterPhotosIntoTrips(photos, options = {}) {
  const {
    home = null,
    nameOverrides = null,
    mergeBoundaries = null,
    splitBoundaries = null,
    maxDistanceKm = 80,
    maxTimeGapHours = 36
  } = options;

  const getOverride = (key) =>
    nameOverrides instanceof Map ? nameOverrides.get(key) : nameOverrides?.[key];

  const gpsPhotos = photos
    .filter((p) => p.hasGps && !isAtHome(p, home))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (gpsPhotos.length === 0) return [];

  // Pass 1 — automatic segmentation. A photo starts a new trip when it's too far in time or space
  // from the current trip's centroid, OR when the user forced a split there.
  const groups = [];
  let current = [gpsPhotos[0]];
  let sumLat = gpsPhotos[0].latitude;
  let sumLng = gpsPhotos[0].longitude;

  for (let i = 1; i < gpsPhotos.length; i++) {
    const prev = current[current.length - 1];
    const curr = gpsPhotos[i];

    const timeGapHours = Math.abs(curr.timestamp - prev.timestamp) / (1000 * 60 * 60);
    const centroidLat = sumLat / current.length;
    const centroidLng = sumLng / current.length;
    const distFromCentroid = calculateHaversineDistance(centroidLat, centroidLng, curr.latitude, curr.longitude);

    const forceSplit = splitBoundaries?.has(curr.id);
    const keepTogether = !forceSplit && timeGapHours <= maxTimeGapHours && distFromCentroid <= maxDistanceKm;

    if (keepTogether) {
      current.push(curr);
      sumLat += curr.latitude;
      sumLng += curr.longitude;
    } else {
      groups.push(current);
      current = [curr];
      sumLat = curr.latitude;
      sumLng = curr.longitude;
    }
  }
  groups.push(current);

  // Pass 2 — apply user merges at the group level, so joining two far-apart trips pulls the WHOLE
  // later segment in (a per-photo distance check would otherwise re-split it immediately).
  const mergedGroups = [];
  for (const group of groups) {
    if (mergedGroups.length > 0 && mergeBoundaries?.has(group[0].id)) {
      mergedGroups[mergedGroups.length - 1] = mergedGroups[mergedGroups.length - 1].concat(group);
    } else {
      mergedGroups.push(group);
    }
  }

  const trips = mergedGroups.map((g) => createTripRecord(g, { home, getOverride }));

  // The route stays time-ascending inside each trip; the list shows the most recent journey first.
  return trips.reverse();
}

function createTripRecord(photos, { home, getOverride } = {}) {
  const startDate = new Date(photos[0].timestamp);
  const endDate = new Date(photos[photos.length - 1].timestamp);

  let totalDistance = 0;
  for (let i = 0; i < photos.length - 1; i++) {
    totalDistance += calculateHaversineDistance(
      photos[i].latitude, photos[i].longitude,
      photos[i + 1].latitude, photos[i + 1].longitude
    );
  }

  const avgLat = photos.reduce((sum, p) => sum + p.latitude, 0) / photos.length;
  const avgLng = photos.reduce((sum, p) => sum + p.longitude, 0) / photos.length;

  // Calendar-day span so an overnight stay reads as 2일 even if it's <24h apart.
  const startDay = new Date(startDate); startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(endDate); endDay.setHours(0, 0, 0, 0);
  const durationDays = Math.max(1, Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1);
  const nights = durationDays - 1;

  const distanceFromHome = home
    ? calculateHaversineDistance(avgLat, avgLng, home.lat, home.lng)
    : null;

  // Categorise: overnight => 여행, else near home => 나들이, else => 당일 여행.
  let kind = 'day';
  if (nights >= 1) kind = 'trip';
  else if (distanceFromHome != null && distanceFromHome <= OUTING_RADIUS_KM) kind = 'outing';

  const placeName = photos[0].locationName && photos[0].locationName !== '위치 확인 중...' && photos[0].locationName !== '위치 정보 없음'
    ? shortPlace(photos[0].locationName)
    : null;

  const durationLabel = nights >= 1 ? `${nights}박 ${durationDays}일` : '당일';
  const kindLabel = kind === 'outing' ? '나들이' : nights >= 1 ? '여행' : '나들이';

  const tripKey = tripKeyOf(photos[0].timestamp, avgLat, avgLng);
  const override = getOverride?.(tripKey);
  const autoTitle = placeName
    ? `${placeName} ${kindLabel}`
    : nights >= 1 ? '추억의 여행' : '나들이';

  return {
    // Derived from the first photo so re-clustering keeps stable React keys.
    id: 'trip_' + photos[0].id,
    tripKey,
    title: override || autoTitle,
    hasCustomName: !!override,
    kind,
    kindLabel,
    durationLabel,
    placeName,
    startTimestamp: photos[0].timestamp,
    endTimestamp: photos[photos.length - 1].timestamp,
    startDateFormatted: startDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    endDateFormatted: endDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    durationDays,
    nights,
    distanceFromHome: distanceFromHome != null ? Math.round(distanceFromHome) : null,
    totalDistanceKm: Math.round(totalDistance * 10) / 10,
    photoCount: photos.length,
    coverPhoto: photos[0],
    photos,
    centerLat: avgLat,
    centerLng: avgLng
  };
}

/** Trims a full geocoded string ("대한민국 서울특별시 종로구") down to its two most specific parts. */
function shortPlace(name) {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length <= 2) return name;
  return parts.slice(-2).join(' ');
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
