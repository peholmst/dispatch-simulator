import { coordinatesKey, distanceMeters, routeDistanceMeters, type Coordinates } from "./geometry.js";

export interface RouteResult {
  provider: string;
  geometry: Coordinates[];
  distanceMeters: number;
  durationSeconds: number;
  cacheKey: string;
}

export interface RoutingService {
  route(from: Coordinates, to: Coordinates): RouteResult;
}

export class CachedRoutingService implements RoutingService {
  private readonly cache = new Map<string, RouteResult>();

  constructor(private readonly upstream: RoutingService) {}

  route(from: Coordinates, to: Coordinates): RouteResult {
    const cacheKey = `${coordinatesKey(from)}>${coordinatesKey(to)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        geometry: cached.geometry.map((point) => ({ ...point }))
      };
    }

    const result = this.upstream.route(from, to);
    const cachedResult = {
      ...result,
      cacheKey,
      geometry: result.geometry.map((point) => ({ ...point }))
    };
    this.cache.set(cacheKey, cachedResult);
    return {
      ...cachedResult,
      geometry: cachedResult.geometry.map((point) => ({ ...point }))
    };
  }
}

export class StraightLineRoutingService implements RoutingService {
  constructor(private readonly metersPerSecond: number) {}

  route(from: Coordinates, to: Coordinates): RouteResult {
    const mid: Coordinates = {
      lat: from.lat,
      lon: to.lon
    };
    const directDistance = distanceMeters(from, to);
    const geometry = directDistance < 50 ? [from, to] : [from, mid, to];
    const routeDistance = routeDistanceMeters(geometry);

    return {
      provider: "straight-line-cache",
      cacheKey: `${coordinatesKey(from)}>${coordinatesKey(to)}`,
      geometry,
      distanceMeters: routeDistance,
      durationSeconds: Math.ceil(routeDistance / this.metersPerSecond)
    };
  }
}

export function createDefaultRoutingService(metersPerSecond: number): RoutingService {
  return new CachedRoutingService(new StraightLineRoutingService(metersPerSecond));
}
