import type { ShiftState, UnitSimulationState } from "@dispatch-simulator/shared";

export type MapPointKind = "station" | "hospital" | "incident" | "unit";
export type UnitMapStatus = "available" | "active" | "held" | "unavailable";

export type MapFeature = {
  type: "Feature";
  properties: Record<string, string | boolean>;
  geometry: {
    type: "Point" | "LineString";
    coordinates: number[] | number[][];
  };
};

export interface MapFeatureCollection {
  type: "FeatureCollection";
  features: MapFeature[];
}

export function emptyFeatureCollection(): MapFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function unitMapStatus(status: UnitSimulationState["status"]): UnitMapStatus {
  if (status === "available_at_station" || status === "available_mobile") {
    return "available";
  }
  if (status === "held") {
    return "held";
  }
  if (status === "out_of_service" || status === "recovering") {
    return "unavailable";
  }
  return "active";
}

export function buildPointFeatures(
  shift: ShiftState,
  activeIncidentId?: string,
  selectedUnitIds: string[] = [],
  highlightedUnitId?: string
): MapFeature[] {
  const selected = new Set(selectedUnitIds);
  const spawnLocationsById = new Map(shift.config.spawnLocations.map((location) => [location.id, location]));
  return [
    ...shift.config.stations.map((station) => ({
      type: "Feature" as const,
      properties: { kind: "station", id: station.id, label: station.id.replace("station_", "S") },
      geometry: { type: "Point" as const, coordinates: [station.coordinates.lon, station.coordinates.lat] }
    })),
    ...shift.config.hospitals.map((hospital) => ({
      type: "Feature" as const,
      properties: { kind: "hospital", id: hospital.id, label: hospital.id },
      geometry: { type: "Point" as const, coordinates: [hospital.coordinates.lon, hospital.coordinates.lat] }
    })),
    ...shift.incidents.filter((incidentItem) => incidentItem.reportedAt !== undefined).map((incidentItem) => ({
      type: "Feature" as const,
      properties: {
        kind: "incident",
        id: incidentItem.id,
        label: `${incidentItem.selectedCode ?? "-"}-${incidentItem.selectedPriority ?? "-"}`,
        name: incidentItem.displayName,
        address: spawnLocationsById.get(incidentItem.locationId)?.address ?? incidentItem.locationId,
        active: incidentItem.id === activeIncidentId
      },
      geometry: { type: "Point" as const, coordinates: [incidentItem.location.lon, incidentItem.location.lat] }
    })),
    ...Object.values(shift.units).map((unit) => ({
      type: "Feature" as const,
      properties: {
        kind: "unit",
        id: unit.id,
        label: unit.callSign,
        status: unit.status,
        mapStatus: unitMapStatus(unit.status),
        selected: selected.has(unit.id),
        highlighted: unit.id === highlightedUnitId
      },
      geometry: { type: "Point" as const, coordinates: [unit.location.lon, unit.location.lat] }
    }))
  ];
}

export function pointFeaturesByKind(features: MapFeature[], kind: MapPointKind): MapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.filter((feature) => feature.geometry.type === "Point" && feature.properties.kind === kind)
  };
}

export function buildRouteFeatures(shift: ShiftState, activeIncidentId?: string, selectedUnitIds: string[] = []): MapFeature[] {
  const selected = new Set(selectedUnitIds);
  return Object.values(shift.units)
    .filter((unit) => unit.route && unit.status === "en_route")
    .map((unit) => ({
      type: "Feature" as const,
      properties: {
        active: unit.incidentId === activeIncidentId,
        selected: selected.has(unit.id),
        unitId: unit.id
      },
      geometry: {
        type: "LineString" as const,
        coordinates: unit.route!.geometry.map((point) => [point.lon, point.lat])
      }
    }));
}

export function featuresAtSameLocation(features: MapFeature[], coordinates: [number, number]): MapFeature[] {
  return features.filter((feature) => {
    if (feature.geometry.type !== "Point") {
      return false;
    }
    const [lon, lat] = feature.geometry.coordinates as number[];
    return lon === coordinates[0] && lat === coordinates[1];
  });
}
