import {
  resolveResourceCapabilities,
  type CapabilityMap,
  type LoadedConfig,
  type Resource
} from "../config/index.js";

export interface DispatchSuggestionInput {
  code: string;
  priority: string;
  incidentLocation: {
    lat: number;
    lon: number;
  };
  unitStates?: Record<string, {
    status: Resource["initialStatus"] | "held" | "assigned" | "en_route" | "on_scene" | "committed_on_scene" | "recovering";
    location?: {
      lat: number;
      lon: number;
    };
  }>;
}

export interface SuggestedUnit {
  unitId: string;
  callSign: string;
  distanceMeters: number;
  contributes: CapabilityMap;
  satisfies: "requires" | "desires";
}

export interface CapabilityCoverage {
  required: number;
  provided: number;
}

export interface DispatchSuggestion {
  suggestedUnits: SuggestedUnit[];
  coverage: Record<string, CapabilityCoverage>;
  desiredCoverage: Record<string, CapabilityCoverage>;
  shortage: CapabilityMap;
  desiredShortage: CapabilityMap;
}

interface Candidate {
  resource: Resource;
  capabilities: CapabilityMap;
  distanceMeters: number;
}

const dispatchableStatuses = new Set(["available_at_station", "available_mobile"]);

function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
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

function positiveEntries(map: CapabilityMap): Array<[string, number]> {
  return Object.entries(map).filter(([, value]) => value > 0);
}

function getContribution(capabilities: CapabilityMap, remaining: CapabilityMap): CapabilityMap {
  const contribution: CapabilityMap = {};
  for (const [capability, needed] of positiveEntries(remaining)) {
    const provided = capabilities[capability] ?? 0;
    if (provided > 0 && needed > 0) {
      contribution[capability] = provided;
    }
  }
  return contribution;
}

function contributionScore(capabilities: CapabilityMap, remaining: CapabilityMap): number {
  return positiveEntries(remaining).reduce((total, [capability, needed]) => {
    return total + Math.min(capabilities[capability] ?? 0, needed);
  }, 0);
}

function overfillScore(capabilities: CapabilityMap, remaining: CapabilityMap): number {
  return positiveEntries(remaining).reduce((total, [capability, needed]) => {
    return total + Math.max((capabilities[capability] ?? 0) - needed, 0);
  }, 0);
}

function isUseful(candidate: Candidate, remaining: CapabilityMap): boolean {
  return positiveEntries(remaining).some(([capability, needed]) => {
    return needed > 0 && (candidate.capabilities[capability] ?? 0) > 0;
  });
}

function subtractAndClamp(remaining: CapabilityMap, capabilities: CapabilityMap): CapabilityMap {
  const next = { ...remaining };
  for (const [capability, needed] of Object.entries(next)) {
    next[capability] = Math.max(needed - (capabilities[capability] ?? 0), 0);
  }
  return next;
}

function buildCoverage(required: CapabilityMap, selected: SuggestedUnit[]): Record<string, CapabilityCoverage> {
  return Object.fromEntries(
    Object.entries(required).map(([capability, required]) => {
      const provided = selected.reduce((total, unit) => total + (unit.contributes[capability] ?? 0), 0);
      return [capability, { required, provided }];
    })
  );
}

function selectGreedy(
  candidates: Candidate[],
  requirement: CapabilityMap,
  satisfies: "requires" | "desires"
): { selected: SuggestedUnit[]; remaining: CapabilityMap; unusedCandidates: Candidate[] } {
  let remaining = { ...requirement };
  const selected: SuggestedUnit[] = [];
  const unusedCandidates = [...candidates];

  while (positiveEntries(remaining).length > 0) {
    const usefulCandidates = unusedCandidates.filter((candidate) => isUseful(candidate, remaining));
    if (usefulCandidates.length === 0) {
      break;
    }

    usefulCandidates.sort((a, b) => {
      const distanceDelta = a.distanceMeters - b.distanceMeters;
      if (distanceDelta !== 0) {
        return distanceDelta;
      }

      const contributionDelta = contributionScore(b.capabilities, remaining) - contributionScore(a.capabilities, remaining);
      if (contributionDelta !== 0) {
        return contributionDelta;
      }

      const overfillDelta = overfillScore(a.capabilities, remaining) - overfillScore(b.capabilities, remaining);
      if (overfillDelta !== 0) {
        return overfillDelta;
      }

      const callSignDelta = a.resource.callSign.localeCompare(b.resource.callSign);
      if (callSignDelta !== 0) {
        return callSignDelta;
      }

      return a.resource.id.localeCompare(b.resource.id);
    });

    const chosen = usefulCandidates[0]!;
    selected.push({
      unitId: chosen.resource.id,
      callSign: chosen.resource.callSign,
      distanceMeters: chosen.distanceMeters,
      contributes: getContribution(chosen.capabilities, remaining),
      satisfies
    });
    remaining = subtractAndClamp(remaining, chosen.capabilities);
    unusedCandidates.splice(unusedCandidates.findIndex((candidate) => candidate.resource.id === chosen.resource.id), 1);
  }

  return { selected, remaining, unusedCandidates };
}

function subtractSelectedCapabilities(remaining: CapabilityMap, selected: SuggestedUnit[], candidates: Candidate[]): CapabilityMap {
  let next = { ...remaining };
  const candidatesById = new Map(candidates.map((candidate) => [candidate.resource.id, candidate]));
  for (const unit of selected) {
    const candidate = candidatesById.get(unit.unitId);
    if (candidate) {
      next = subtractAndClamp(next, candidate.capabilities);
    }
  }
  return next;
}

function isCoordinateLocation(location: unknown): location is { lat: number; lon: number } {
  return Boolean(
    location &&
    typeof location === "object" &&
    "lat" in location &&
    "lon" in location &&
    typeof (location as { lat: unknown }).lat === "number" &&
    typeof (location as { lon: unknown }).lon === "number"
  );
}

export function suggestDispatch(config: LoadedConfig, input: DispatchSuggestionInput): DispatchSuggestion {
  const responsePlan = config.responsePlans.find((plan) => plan.code === input.code && plan.priority === input.priority);
  if (!responsePlan) {
    throw new Error(`No response plan for ${input.code}-${input.priority}`);
  }

  const resourceTypesById = new Map(config.resourceTypes.map((resourceType) => [resourceType.id, resourceType]));
  const stationsById = new Map(config.stations.map((station) => [station.id, station]));
  const candidates: Candidate[] = [];

  for (const resource of config.resources) {
    const unitState = input.unitStates?.[resource.id];
    const status = unitState?.status ?? resource.initialStatus;
    if (!dispatchableStatuses.has(status)) {
      continue;
    }

    const resourceType = resourceTypesById.get(resource.type);
    if (!resourceType) {
      continue;
    }

    const station = stationsById.get(resource.stationId);
    const rawLocation = status === "available_mobile" ? unitState?.location ?? resource.initialLocation : station?.coordinates;
    if (!isCoordinateLocation(rawLocation)) {
      continue;
    }

    candidates.push({
      resource,
      capabilities: resolveResourceCapabilities(resourceType, resource),
      distanceMeters: distanceMeters(rawLocation, input.incidentLocation)
    });
  }

  const requiredSelection = selectGreedy(candidates, responsePlan.requires, "requires");
  const desiredRemaining = subtractSelectedCapabilities(responsePlan.desires, requiredSelection.selected, candidates);
  const desiredSelection = selectGreedy(requiredSelection.unusedCandidates, desiredRemaining, "desires");
  const suggestedUnits = [...requiredSelection.selected, ...desiredSelection.selected];

  return {
    suggestedUnits,
    coverage: buildCoverage(responsePlan.requires, suggestedUnits),
    desiredCoverage: buildCoverage(responsePlan.desires, suggestedUnits),
    shortage: requiredSelection.remaining,
    desiredShortage: desiredSelection.remaining
  };
}
