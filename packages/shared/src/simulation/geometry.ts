export interface Coordinates {
  lat: number;
  lon: number;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const earthRadiusMeters = 6_371_000;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * Math.PI / 180;
  const deltaLon = (b.lon - a.lon) * Math.PI / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

export function routeDistanceMeters(geometry: Coordinates[]): number {
  return geometry.slice(1).reduce((total, point, index) => {
    return total + distanceMeters(geometry[index]!, point);
  }, 0);
}

export function interpolateCoordinates(a: Coordinates, b: Coordinates, ratio: number): Coordinates {
  const clamped = Math.max(0, Math.min(1, ratio));
  return {
    lat: a.lat + ((b.lat - a.lat) * clamped),
    lon: a.lon + ((b.lon - a.lon) * clamped)
  };
}

export function pointAlongRoute(geometry: Coordinates[], progress: number): Coordinates {
  if (geometry.length === 0) {
    throw new Error("Route geometry must contain at least one point");
  }
  if (geometry.length === 1 || progress <= 0) {
    return geometry[0]!;
  }
  if (progress >= 1) {
    return geometry.at(-1)!;
  }

  const totalDistance = routeDistanceMeters(geometry);
  if (totalDistance === 0) {
    return geometry.at(-1)!;
  }

  const targetDistance = totalDistance * progress;
  let covered = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    const start = geometry[index - 1]!;
    const end = geometry[index]!;
    const segmentDistance = distanceMeters(start, end);
    if (segmentDistance === 0) {
      continue;
    }
    if (covered + segmentDistance >= targetDistance) {
      return interpolateCoordinates(start, end, (targetDistance - covered) / segmentDistance);
    }
    covered += segmentDistance;
  }

  return geometry.at(-1)!;
}

export function coordinatesKey(coordinates: Coordinates): string {
  return `${coordinates.lat.toFixed(5)},${coordinates.lon.toFixed(5)}`;
}
