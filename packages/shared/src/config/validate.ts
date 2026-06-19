import {
  resolveLocalizationKey,
  resolveResourceCapabilities,
  type CapabilityMap,
  type Hospital,
  type IncidentProfile,
  type Resource,
  type ResourceType,
  type SpawnLocation,
  type Station
} from "./index.js";
import type { LoadedConfig } from "./load.js";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
}

export interface ValidateConfigOptions {
  strict?: boolean;
}

function addIssue(issues: ValidationIssue[], severity: ValidationSeverity, message: string): void {
  issues.push({ severity, message });
}

function duplicateIds(items: Array<{ id: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.add(item.id);
    }
    seen.add(item.id);
  }
  return [...duplicates].sort();
}

function hasAllKeys(map: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(map, key));
}

function collectCapabilityKeys(map: CapabilityMap | undefined): string[] {
  return Object.keys(map ?? {});
}

function addUnknownCapabilityIssues(
  issues: ValidationIssue[],
  knownCapabilityIds: Set<string>,
  owner: string,
  map: CapabilityMap | undefined
): void {
  for (const capability of collectCapabilityKeys(map)) {
    if (!knownCapabilityIds.has(capability)) {
      addIssue(issues, "error", `${owner} references unknown capability ${capability}`);
    }
  }
}

function getTotalDispatchableCapabilities(resources: Resource[], resourceTypesById: Map<string, ResourceType>): CapabilityMap {
  const totals: CapabilityMap = {};
  for (const resource of resources) {
    if (resource.initialStatus === "out_of_service") {
      continue;
    }

    const resourceType = resourceTypesById.get(resource.type);
    if (!resourceType) {
      continue;
    }
    const capabilities = resolveResourceCapabilities(resourceType, resource);
    for (const [capability, value] of Object.entries(capabilities)) {
      totals[capability] = (totals[capability] ?? 0) + value;
    }
  }
  return totals;
}

function requirementsCanBeMet(requirements: CapabilityMap, totals: CapabilityMap): boolean {
  return Object.entries(requirements).every(([capability, required]) => (totals[capability] ?? 0) >= required);
}

function rangeIsOrdered(range: [number, number]): boolean {
  return range[0] <= range[1];
}

function addRangeOrderIssue(
  issues: ValidationIssue[],
  owner: string,
  field: string,
  range: [number, number] | undefined
): void {
  if (range && !rangeIsOrdered(range)) {
    addIssue(issues, "error", `${owner} ${field} range start must be <= end`);
  }
}

function isInsideRegionBounds(
  coordinates: { lat: number; lon: number },
  bounds: LoadedConfig["region"]["bounds"]
): boolean {
  return coordinates.lat <= bounds.north &&
    coordinates.lat >= bounds.south &&
    coordinates.lon <= bounds.east &&
    coordinates.lon >= bounds.west;
}

function addCoordinateBoundsIssue(
  issues: ValidationIssue[],
  owner: string,
  coordinates: { lat: number; lon: number },
  bounds: LoadedConfig["region"]["bounds"]
): void {
  if (!isInsideRegionBounds(coordinates, bounds)) {
    addIssue(issues, "error", `${owner} coordinates must be inside region bounds`);
  }
}

function validateRegionBounds(issues: ValidationIssue[], config: LoadedConfig): void {
  if (config.region.bounds.north < config.region.bounds.south) {
    addIssue(issues, "error", `Region ${config.region.id} north bound must be >= south bound`);
  }
  if (config.region.bounds.east < config.region.bounds.west) {
    addIssue(issues, "error", `Region ${config.region.id} east bound must be >= west bound`);
  }
}

function validateCoordinateOwners(
  issues: ValidationIssue[],
  config: LoadedConfig,
  items: Array<Station | Hospital | SpawnLocation>,
  label: string
): void {
  for (const item of items) {
    addCoordinateBoundsIssue(issues, `${label} ${item.id}`, item.coordinates, config.region.bounds);
  }
}

function isSubset(values: string[], allowed: string[]): boolean {
  return values.every((value) => allowed.includes(value));
}

function validCodePriorityPairs(config: LoadedConfig): Set<string> {
  return new Set(config.dispatchCodes.flatMap((code) => {
    return code.validPriorities.map((priority) => `${code.id}-${priority}`);
  }));
}

function hasAnyValidClassificationPair(
  codes: string[],
  priorities: string[],
  pairs: Set<string>
): boolean {
  return codes.some((code) => priorities.some((priority) => pairs.has(`${code}-${priority}`)));
}

function validateLocalizationKeys(issues: ValidationIssue[], profile: IncidentProfile, locale: Record<string, string>): void {
  const keys = [
    resolveLocalizationKey(profile.localizationPrefix, profile.displayNameKey),
    ...profile.reports.initial.map((report) => resolveLocalizationKey(profile.localizationPrefix, report.key)),
    ...profile.reports.duplicate.map((report) => resolveLocalizationKey(profile.localizationPrefix, report.key)),
    ...profile.stages.flatMap((stage) => [
      resolveLocalizationKey(profile.localizationPrefix, stage.firstArrivalReportKey),
      stage.escalationReportKey ? resolveLocalizationKey(profile.localizationPrefix, stage.escalationReportKey) : undefined
    ]).filter((key): key is string => Boolean(key))
  ];

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(locale, key)) {
      addIssue(issues, "error", `Missing localization key ${key} for incident ${profile.id}`);
    }
  }
}

export function validateConfig(config: LoadedConfig, options: ValidateConfigOptions = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const strict = options.strict ?? false;

  const capabilityIds = new Set(config.capabilities.map((capability) => capability.id));
  const priorityIds = new Set(config.priorities.map((priority) => priority.id));
  const dispatchCodeIds = new Set(config.dispatchCodes.map((code) => code.id));
  const stationIds = new Set(config.stations.map((station) => station.id));
  const resourceTypeIds = new Set(config.resourceTypes.map((resourceType) => resourceType.id));
  const hospitalIds = new Set(config.hospitals.map((hospital) => hospital.id));
  const scoringProfileIds = new Set(config.scoringProfiles.map((profile) => profile.id));
  const spawnLocationTypes = new Set(config.spawnLocations.map((spawnLocation) => spawnLocation.locationType));
  const resourceTypesById = new Map(config.resourceTypes.map((resourceType) => [resourceType.id, resourceType]));
  const totalCapabilities = getTotalDispatchableCapabilities(config.resources, resourceTypesById);
  const codePriorityPairs = validCodePriorityPairs(config);

  validateRegionBounds(issues, config);
  validateCoordinateOwners(issues, config, config.stations, "Station");
  validateCoordinateOwners(issues, config, config.hospitals, "Hospital");
  validateCoordinateOwners(issues, config, config.spawnLocations, "Spawn location");

  for (const group of [
    ["capability", config.capabilities],
    ["dispatch code", config.dispatchCodes],
    ["hospital", config.hospitals],
    ["incident profile", config.incidents],
    ["priority", config.priorities],
    ["resource", config.resources],
    ["resource type", config.resourceTypes],
    ["response plan", config.responsePlans.map((plan) => ({ id: `${plan.code}-${plan.priority}` }))],
    ["scoring profile", config.scoringProfiles],
    ["station", config.stations],
    ["spawn location", config.spawnLocations]
  ] as const) {
    for (const duplicate of duplicateIds(group[1])) {
      addIssue(issues, "error", `Duplicate ${group[0]} id ${duplicate}`);
    }
  }

  for (const capability of config.capabilities) {
    if (!Object.prototype.hasOwnProperty.call(config.locale, capability.localizationKey)) {
      addIssue(issues, "error", `Missing localization key ${capability.localizationKey} for capability ${capability.id}`);
    }
  }

  for (const priority of config.priorities) {
    if (!Object.prototype.hasOwnProperty.call(config.locale, priority.localizationKey)) {
      addIssue(issues, "error", `Missing localization key ${priority.localizationKey} for priority ${priority.id}`);
    }
  }

  for (const code of config.dispatchCodes) {
    if (!Object.prototype.hasOwnProperty.call(config.locale, code.localizationKey)) {
      addIssue(issues, "error", `Missing localization key ${code.localizationKey} for dispatch code ${code.id}`);
    }
    for (const priority of code.validPriorities) {
      if (!priorityIds.has(priority)) {
        addIssue(issues, "error", `Dispatch code ${code.id} references unknown priority ${priority}`);
      }
    }
  }

  for (const resourceType of config.resourceTypes) {
    addUnknownCapabilityIssues(issues, capabilityIds, `Resource type ${resourceType.id}`, resourceType.capabilities);
    addRangeOrderIssue(issues, `Resource type ${resourceType.id}`, "turnout.delaySeconds", resourceType.turnout.delaySeconds);
    addRangeOrderIssue(issues, `Resource type ${resourceType.id}`, "recovery.afterIncidentSeconds", resourceType.recovery.afterIncidentSeconds);
    for (const priority of Object.keys(resourceType.turnout.priorityModifiers)) {
      if (!priorityIds.has(priority)) {
        addIssue(issues, "error", `Resource type ${resourceType.id} turnout priority modifier references unknown priority ${priority}`);
      }
    }
    if (resourceType.crew.min > resourceType.crew.max) {
      addIssue(issues, "error", `Resource type ${resourceType.id} crew.min must be <= crew.max`);
    }
    if (resourceType.crew.default < resourceType.crew.min || resourceType.crew.default > resourceType.crew.max) {
      addIssue(issues, "error", `Resource type ${resourceType.id} crew.default must be between min and max`);
    }
  }

  const callSigns = new Set<string>();
  for (const resource of config.resources) {
    if (callSigns.has(resource.callSign)) {
      addIssue(issues, "error", `Duplicate resource callSign ${resource.callSign}`);
    }
    callSigns.add(resource.callSign);

    if (!resourceTypeIds.has(resource.type)) {
      addIssue(issues, "error", `Resource ${resource.id} references unknown type ${resource.type}`);
    }
    if (!stationIds.has(resource.stationId)) {
      addIssue(issues, "error", `Resource ${resource.id} references unknown station ${resource.stationId}`);
    }
    addUnknownCapabilityIssues(issues, capabilityIds, `Resource ${resource.id} overrides`, resource.overrides.capabilities);
    addRangeOrderIssue(issues, `Resource ${resource.id} override`, "turnout.delaySeconds", resource.overrides.turnout?.delaySeconds);
    addRangeOrderIssue(issues, `Resource ${resource.id} override`, "recovery.afterIncidentSeconds", resource.overrides.recovery?.afterIncidentSeconds);
    for (const priority of Object.keys(resource.overrides.turnout?.priorityModifiers ?? {})) {
      if (!priorityIds.has(priority)) {
        addIssue(issues, "error", `Resource ${resource.id} override turnout priority modifier references unknown priority ${priority}`);
      }
    }
    if (
      resource.initialLocation?.type === "coordinates" &&
      !isInsideRegionBounds(resource.initialLocation, config.region.bounds)
    ) {
      addIssue(issues, "error", `Resource ${resource.id} initialLocation coordinates must be inside region bounds`);
    }
    if (resource.initialStatus === "available_mobile" && !resource.initialLocation) {
      addIssue(issues, "error", `Resource ${resource.id} is available_mobile and requires initialLocation`);
    }
  }

  for (const station of config.stations) {
    if (!Object.prototype.hasOwnProperty.call(config.locale, station.localizationKey)) {
      addIssue(issues, "error", `Missing localization key ${station.localizationKey} for station ${station.id}`);
    }
  }

  for (const hospital of config.hospitals) {
    if (!Object.prototype.hasOwnProperty.call(config.locale, hospital.localizationKey)) {
      addIssue(issues, "error", `Missing localization key ${hospital.localizationKey} for hospital ${hospital.id}`);
    }
  }

  for (const responsePlan of config.responsePlans) {
    const dispatchCode = config.dispatchCodes.find((code) => code.id === responsePlan.code);
    if (!dispatchCodeIds.has(responsePlan.code) || !dispatchCode) {
      addIssue(issues, "error", `Response plan ${responsePlan.code}-${responsePlan.priority} references unknown dispatch code`);
      continue;
    }
    if (!dispatchCode.validPriorities.includes(responsePlan.priority)) {
      addIssue(issues, "error", `Response plan ${responsePlan.code}-${responsePlan.priority} is not a valid priority for code ${responsePlan.code}`);
    }
    addUnknownCapabilityIssues(issues, capabilityIds, `Response plan ${responsePlan.code}-${responsePlan.priority} requires`, responsePlan.requires);
    addUnknownCapabilityIssues(issues, capabilityIds, `Response plan ${responsePlan.code}-${responsePlan.priority} desires`, responsePlan.desires);
    if (!requirementsCanBeMet(responsePlan.requires, totalCapabilities)) {
      addIssue(
        issues,
        strict ? "error" : "warning",
        `Response plan ${responsePlan.code}-${responsePlan.priority} cannot be fulfilled with dispatchable regional resources`
      );
    }
  }

  for (const code of config.dispatchCodes) {
    for (const priority of code.validPriorities) {
      const hasPlan = config.responsePlans.some((plan) => plan.code === code.id && plan.priority === priority);
      if (!hasPlan) {
        addIssue(issues, "error", `Missing response plan for valid code-priority ${code.id}-${priority}`);
      }
    }
  }

  for (const profile of config.incidents) {
    validateLocalizationKeys(issues, profile, config.locale);
    addRangeOrderIssue(issues, `Incident ${profile.id}`, "initialReportDelaySeconds", profile.initialReportDelaySeconds);
    addRangeOrderIssue(issues, `Incident ${profile.id}`, "commitment.afterControlSeconds", profile.commitment.afterControlSeconds);
    if (!scoringProfileIds.has(profile.scoring.outcomeProfile)) {
      addIssue(issues, "error", `Incident ${profile.id} references unknown scoring profile ${profile.scoring.outcomeProfile}`);
    }
    if (!hasAllKeys(Object.fromEntries(config.dispatchCodes.map((code) => [code.id, true])), profile.classification.acceptableCodes)) {
      addIssue(issues, "error", `Incident ${profile.id} references unknown acceptable dispatch code`);
    }
    if (!hasAllKeys(Object.fromEntries(config.dispatchCodes.map((code) => [code.id, true])), profile.classification.idealCodes)) {
      addIssue(issues, "error", `Incident ${profile.id} references unknown ideal dispatch code`);
    }
    for (const priority of [...profile.classification.acceptablePriorities, ...profile.classification.idealPriorities]) {
      if (!priorityIds.has(priority)) {
        addIssue(issues, "error", `Incident ${profile.id} references unknown priority ${priority}`);
      }
    }
    for (const code of profile.classification.idealCodes) {
      if (!profile.classification.acceptableCodes.includes(code)) {
        addIssue(issues, "error", `Incident ${profile.id} ideal dispatch code ${code} must also be acceptable`);
      }
    }
    for (const priority of profile.classification.idealPriorities) {
      if (!profile.classification.acceptablePriorities.includes(priority)) {
        addIssue(issues, "error", `Incident ${profile.id} ideal priority ${priority} must also be acceptable`);
      }
    }
    if (!hasAnyValidClassificationPair(profile.classification.acceptableCodes, profile.classification.acceptablePriorities, codePriorityPairs)) {
      addIssue(issues, "error", `Incident ${profile.id} has no valid acceptable code-priority pair`);
    }
    if (!hasAnyValidClassificationPair(profile.classification.idealCodes, profile.classification.idealPriorities, codePriorityPairs)) {
      addIssue(issues, "error", `Incident ${profile.id} has no valid ideal code-priority pair`);
    }
    if (!isSubset(profile.classification.idealCodes, profile.classification.acceptableCodes)) {
      addIssue(issues, "warning", `Incident ${profile.id} ideal codes are not a subset of acceptable codes`);
    }
    for (const locationType of profile.spawn.locationTypes) {
      if (!spawnLocationTypes.has(locationType)) {
        addIssue(issues, "error", `Incident ${profile.id} spawn location type ${locationType} has no matching spawn locations`);
      }
    }
    const spawnCandidates = config.spawnLocations.filter((spawnLocation) => {
      const include = profile.spawn.regionTags?.include ?? [];
      const exclude = profile.spawn.regionTags?.exclude ?? [];
      return profile.spawn.locationTypes.includes(spawnLocation.locationType) &&
        include.every((tag) => spawnLocation.regionTags.includes(tag)) &&
        exclude.every((tag) => !spawnLocation.regionTags.includes(tag));
    });
    if (spawnCandidates.length === 0) {
      addIssue(issues, "error", `Incident ${profile.id} has no spawn locations after applying region tag filters`);
    }
    if (profile.stages[0]?.startsAt !== 0) {
      addIssue(issues, "error", `Incident ${profile.id} first stage must start at 0`);
    }
    for (const [stageIndex, stage] of profile.stages.entries()) {
      if (stageIndex > 0 && stage.startsAt <= profile.stages[stageIndex - 1]!.startsAt) {
        addIssue(issues, "error", `Incident ${profile.id} stage ${stage.id} starts before previous stage`);
      }
      if (stageIndex > 0 && !stage.transition) {
        addIssue(issues, "warning", `Incident ${profile.id} stage ${stage.id} has no transition probability and is unreachable from the simulation core`);
      }
      if (stage.startsAt > 0 && !stage.escalationReportKey) {
        addIssue(issues, "error", `Incident ${profile.id} stage ${stage.id} starts after 0 and requires escalationReportKey`);
      }
      addRangeOrderIssue(issues, `Incident ${profile.id} stage ${stage.id} commitment`, "afterControlSeconds", stage.commitment?.afterControlSeconds);
      addUnknownCapabilityIssues(issues, capabilityIds, `Incident ${profile.id} stage ${stage.id} controlRequires`, stage.controlRequires);
      addUnknownCapabilityIssues(issues, capabilityIds, `Incident ${profile.id} stage ${stage.id} controlDesires`, stage.controlDesires);
      addUnknownCapabilityIssues(issues, capabilityIds, `Incident ${profile.id} stage ${stage.id} containmentRequires`, stage.containmentRequires);
      addUnknownCapabilityIssues(issues, capabilityIds, `Incident ${profile.id} stage ${stage.id} containmentDesires`, stage.containmentDesires);
      for (const [capability, containmentValue] of Object.entries(stage.containmentRequires)) {
        const controlValue = stage.controlRequires[capability] ?? 0;
        if (containmentValue > controlValue) {
          addIssue(issues, "error", `Incident ${profile.id} stage ${stage.id} containment ${capability} exceeds control requirement`);
        }
      }
      if (!requirementsCanBeMet(stage.controlRequires, totalCapabilities)) {
        addIssue(
          issues,
          strict ? "error" : "warning",
          `Incident ${profile.id} stage ${stage.id} cannot be controlled with available regional resources`
        );
      }
      for (const emsTransport of [profile.emsTransport, stage.emsTransport].filter(Boolean)) {
        if (emsTransport && emsTransport.mode !== "none") {
          if (!capabilityIds.has(emsTransport.requiresCapability)) {
            addIssue(issues, "error", `Incident ${profile.id} references unknown EMS capability ${emsTransport.requiresCapability}`);
          }
          if (hospitalIds.size === 0) {
            addIssue(issues, "error", `Incident ${profile.id} requires EMS transport but no hospitals are configured`);
          }
        }
      }
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  return { issues, errorCount, warningCount };
}
