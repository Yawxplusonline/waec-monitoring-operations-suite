import { ExamCenter, EscortRoute } from '../types/sentinel';

const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Calculates distance in meters between two GPS coordinates using the Haversine formula.
 * Equivalent to Turf.js distance() / Flutter latlong2 Distance().
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Phase 4: Calculates forward compass bearing (0°–360°) between two GPS coordinates (Turf.bearing equivalent).
 */
export function calculateBearingDegrees(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lng2 - lng1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return Math.round((toDegrees(theta) + 360) % 360);
}

/**
 * Checks whether a coordinate is inside any WAEC Exam Center's circular geofence (default 100m).
 */
export function checkCenterGeofence(
  lat: number,
  lng: number,
  centers: Record<string, ExamCenter>
): {
  insideCenter: ExamCenter | null;
  nearestCenter: ExamCenter | null;
  nearestDistance: number;
  bearingToNearest: number;
} {
  let insideCenter: ExamCenter | null = null;
  let nearestCenter: ExamCenter | null = null;
  let nearestDistance = Infinity;
  let bearingToNearest = 0;

  for (const center of Object.values(centers)) {
    const dist = calculateDistanceMeters(lat, lng, center.lat, center.lng);
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestCenter = center;
      bearingToNearest = calculateBearingDegrees(lat, lng, center.lat, center.lng);
    }
    if (dist <= center.radius_meters) {
      insideCenter = center;
    }
  }

  return { insideCenter, nearestCenter, nearestDistance, bearingToNearest };
}

/**
 * Calculates minimum perpendicular distance in meters from a point to a multi-segment Escort Route polyline.
 * Triggers a yellow warning if officer deviates by > 200 meters during Transit Escort Mode.
 */
export function calculateRouteDeviationMeters(
  lat: number,
  lng: number,
  route: EscortRoute
): number {
  if (!route.waypoints || route.waypoints.length === 0) return 0;
  if (route.waypoints.length === 1) {
    return calculateDistanceMeters(lat, lng, route.waypoints[0][0], route.waypoints[0][1]);
  }

  let minDistance = Infinity;

  for (let i = 0; i < route.waypoints.length - 1; i++) {
    const [latA, lngA] = route.waypoints[i];
    const [latB, lngB] = route.waypoints[i + 1];
    const segDist = pointToSegmentDistanceMeters(lat, lng, latA, lngA, latB, lngB);
    if (segDist < minDistance) {
      minDistance = segDist;
    }
  }

  return Math.round(minDistance);
}

/**
 * Phase 4: Calculates total corridor length in kilometers and officer completion percentage along the route.
 */
export function calculateRouteProgress(
  lat: number,
  lng: number,
  route: EscortRoute
): { totalLengthKm: number; progressPct: number; distanceToDestinationMeters: number } {
  if (!route.waypoints || route.waypoints.length < 2) {
    return { totalLengthKm: 0, progressPct: 0, distanceToDestinationMeters: 0 };
  }

  let totalMeters = 0;
  for (let i = 0; i < route.waypoints.length - 1; i++) {
    totalMeters += calculateDistanceMeters(
      route.waypoints[i][0],
      route.waypoints[i][1],
      route.waypoints[i + 1][0],
      route.waypoints[i + 1][1]
    );
  }

  const dest = route.waypoints[route.waypoints.length - 1];
  const distToDest = calculateDistanceMeters(lat, lng, dest[0], dest[1]);
  const progressPct =
    totalMeters > 0
      ? Math.max(0, Math.min(100, Math.round(((totalMeters - distToDest) / totalMeters) * 100)))
      : 0;

  return {
    totalLengthKm: Number((totalMeters / 1000).toFixed(2)),
    progressPct,
    distanceToDestinationMeters: distToDest,
  };
}

function pointToSegmentDistanceMeters(
  pLat: number,
  pLng: number,
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dx = lat2 - lat1;
  const dy = lng2 - lng1;
  if (dx === 0 && dy === 0) {
    return calculateDistanceMeters(pLat, pLng, lat1, lng1);
  }

  const t = Math.max(
    0,
    Math.min(1, ((pLat - lat1) * dx + (pLng - lng1) * dy) / (dx * dx + dy * dy))
  );
  const projLat = lat1 + t * dx;
  const projLng = lng1 + t * dy;
  return calculateDistanceMeters(pLat, pLng, projLat, projLng);
}
