import {
  resolveLocalizationKey,
  resolveResourceCapabilities,
  type CapabilityMap,
  type IncidentProfile,
  type LoadedConfig,
  type Resource,
  type ResourceType,
  type ScoringProfile,
  type TrainingScenario
} from "../config/index.js";
import { suggestDispatch } from "../dispatch/suggest.js";
import { pointAlongRoute, type Coordinates } from "./geometry.js";
import { createRandomStream } from "./random.js";
import { createDefaultRoutingService, type RouteResult } from "./routing.js";
import type {
  CapabilityCheck,
  DebriefIncident,
  DispatchCommand,
  IncidentSimulationState,
  ReportCommand,
  ScoreDimension,
  ShiftDebrief,
  ShiftState,
  StartShiftOptions,
  TimelineEvent,
  UnitSimulationState
} from "./types.js";

const averageResponseSpeedMetersPerSecond = 13.9;
const locationUpdateIntervalSeconds = 15;
const routingService = createDefaultRoutingService(averageResponseSpeedMetersPerSecond);

function cloneState(state: ShiftState): ShiftState {
  return {
    ...state,
    clock: { ...state.clock },
    incidents: state.incidents.map((incident) => ({
      ...incident,
      assignedUnitIds: [...incident.assignedUnitIds],
      linkedReportIds: [...incident.linkedReportIds],
      duplicateReports: incident.duplicateReports.map((report) => ({ ...report }))
    })),
    units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, {
      ...unit,
      route: unit.route ? { ...unit.route, geometry: unit.route.geometry.map((point) => ({ ...point })) } : undefined
    }])),
    timeline: state.timeline.map((event) => ({ ...event, unitIds: event.unitIds ? [...event.unitIds] : undefined }))
  };
}

function addEvent(state: ShiftState, event: Omit<TimelineEvent, "at"> & { at?: number }): void {
  state.timeline.push({
    at: event.at ?? state.clock.now,
    type: event.type,
    incidentId: event.incidentId,
    unitIds: event.unitIds,
    message: event.message
  });
}

function localized(config: LoadedConfig, key: string): string {
  return config.locale[key] ?? key;
}

function rangeValue(range: [number, number], random: ReturnType<typeof createRandomStream>): number {
  return random.integer(range[0], range[1]);
}

function matchesSpawn(profile: IncidentProfile, location: LoadedConfig["spawnLocations"][number]): boolean {
  if (!profile.spawn.locationTypes.includes(location.locationType)) {
    return false;
  }

  const include = profile.spawn.regionTags?.include ?? [];
  const exclude = profile.spawn.regionTags?.exclude ?? [];
  return include.every((tag) => location.regionTags.includes(tag)) &&
    exclude.every((tag) => !location.regionTags.includes(tag));
}

interface IncidentCreationOverrides {
  profile?: IncidentProfile;
  locationId?: string;
  reportDelaySeconds?: [number, number];
}

function createDuplicateReports(
  profile: IncidentProfile,
  config: LoadedConfig,
  reportDueAt: number,
  random: ReturnType<typeof createRandomStream>
): IncidentSimulationState["duplicateReports"] {
  return profile.reports.duplicate
    .filter((report) => report.delaySeconds)
    .map((report, index) => ({
      id: `duplicate_${index + 1}`,
      dueAt: reportDueAt + rangeValue(report.delaySeconds!, random),
      text: localized(config, resolveLocalizationKey(profile.localizationPrefix, report.key))
    }))
    .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));
}

function createIncident(
  config: LoadedConfig,
  options: StartShiftOptions,
  incidentNumber: number,
  createdAt: number,
  overrides: IncidentCreationOverrides = {}
): IncidentSimulationState {
  const random = createRandomStream(`${options.seed}:incident:${incidentNumber}`);
  const profile = overrides.profile ?? random.pickWeighted(config.incidents, (incident) => incident.spawn.weight);
  const spawnCandidates = config.spawnLocations.filter((location) => matchesSpawn(profile, location));
  const spawnLocation = overrides.locationId
    ? spawnCandidates.find((location) => location.id === overrides.locationId)
    : random.pickWeighted(spawnCandidates, () => 1);
  if (!spawnLocation) {
    throw new Error(`No spawn location available for incident profile ${profile.id}`);
  }
  const report = random.pickWeighted(profile.reports.initial, (entry) => entry.weight);
  const initialStage = profile.stages[0]!;
  const escalationStage = profile.stages[1];
  const willEscalate = Boolean(escalationStage?.transition && random.next() < escalationStage.transition.probability);
  const stageTransport = initialStage.emsTransport ?? profile.emsTransport;
  const emsTransportRequired = stageTransport.mode === "required" ||
    (stageTransport.mode === "possible" && random.next() < stageTransport.probability);
  const reportDueAt = createdAt + rangeValue(overrides.reportDelaySeconds ?? profile.initialReportDelaySeconds, random);

  return {
    id: `incident_${incidentNumber}`,
    profileId: profile.id,
    displayName: localized(config, resolveLocalizationKey(profile.localizationPrefix, profile.displayNameKey)),
    locationId: spawnLocation.id,
    location: spawnLocation.coordinates,
    status: "pending_report",
    createdAt,
    reportDueAt,
    reportText: localized(config, resolveLocalizationKey(profile.localizationPrefix, report.key)),
    duplicateReports: createDuplicateReports(profile, config, reportDueAt, random),
    stageId: initialStage.id,
    stageIndex: 0,
    willEscalate,
    escalatesAt: willEscalate && escalationStage ? createdAt + escalationStage.startsAt : undefined,
    emsTransportRequired,
    assignedUnitIds: [],
    linkedReportIds: []
  };
}

function createScenarioIncidents(
  config: LoadedConfig,
  options: StartShiftOptions,
  scenario: TrainingScenario
): IncidentSimulationState[] {
  return scenario.incidents.map((scenarioIncident, index) => {
    const profile = config.incidents.find((candidate) => candidate.id === scenarioIncident.profileId);
    if (!profile) {
      throw new Error(`Training scenario ${scenario.id} references missing incident profile ${scenarioIncident.profileId}`);
    }
    return createIncident(config, options, index + 1, scenarioIncident.createdAt, {
      profile,
      locationId: scenarioIncident.locationId,
      reportDelaySeconds: scenarioIncident.reportDelaySeconds
    });
  });
}

function createIncidents(config: LoadedConfig, options: StartShiftOptions): IncidentSimulationState[] {
  if (options.scenarioId) {
    const scenario = config.trainingScenarios.find((candidate) => candidate.id === options.scenarioId);
    if (!scenario) {
      throw new Error(`Unknown training scenario ${options.scenarioId}`);
    }
    return createScenarioIncidents(config, { ...options, seed: options.seed || scenario.seed }, scenario);
  }

  const startTime = options.startTimeSeconds ?? 0;
  const incidentCount = options.incidentCount ?? 1;
  const incidentSpacingSeconds = options.incidentSpacingSeconds ?? 900;

  return Array.from({ length: incidentCount }, (_, index) => {
    return createIncident(config, options, index + 1, startTime + (index * incidentSpacingSeconds));
  });
}

function unitStartLocation(config: LoadedConfig, resource: Resource): Coordinates {
  const station = config.stations.find((candidate) => candidate.id === resource.stationId);
  if (!station) {
    throw new Error(`Resource ${resource.id} references missing station ${resource.stationId}`);
  }

  if (resource.initialStatus === "available_mobile" && resource.initialLocation?.type === "coordinates") {
    return { lat: resource.initialLocation.lat, lon: resource.initialLocation.lon };
  }

  return station.coordinates;
}

function createUnits(config: LoadedConfig): Record<string, UnitSimulationState> {
  return Object.fromEntries(config.resources.map((resource) => [
    resource.id,
    {
      id: resource.id,
      callSign: resource.callSign,
      status: resource.initialStatus,
      stationId: resource.stationId,
      location: unitStartLocation(config, resource)
    }
  ]));
}

export function startShift(config: LoadedConfig, options: StartShiftOptions): ShiftState {
  const scenario = options.scenarioId
    ? config.trainingScenarios.find((candidate) => candidate.id === options.scenarioId)
    : undefined;
  if (options.scenarioId && !scenario) {
    throw new Error(`Unknown training scenario ${options.scenarioId}`);
  }
  const difficultyPresetId = scenario?.difficultyPreset;
  const now = options.startTimeSeconds ?? scenario?.startTimeSeconds ?? 0;
  const seed = options.seed || scenario?.seed || "demo-shift";
  const state: ShiftState = {
    seed,
    scenarioId: scenario?.id,
    difficultyPresetId,
    clock: { now, mode: "running", speed: 1 },
    status: "active",
    config,
    incidents: createIncidents(config, { ...options, seed, startTimeSeconds: now }),
    units: createUnits(config),
    timeline: []
  };

  addEvent(state, {
    type: "shift_started",
    message: scenario ? `Training scenario ${scenario.id} started with seed ${seed}` : `Shift started with seed ${seed}`
  });
  return advanceSimulation(state, 0);
}

export function setPaused(state: ShiftState, paused: boolean): ShiftState {
  const next = cloneState(state);
  next.clock.mode = paused ? "paused" : "running";
  return next;
}

export function setSpeed(state: ShiftState, speed: number): ShiftState {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error("Simulation speed must be a positive number");
  }
  const next = cloneState(state);
  next.clock.speed = speed;
  return next;
}

function missingCapabilities(required: CapabilityMap, provided: CapabilityMap): CapabilityMap {
  return Object.fromEntries(
    Object.entries(required)
      .map(([capability, requiredValue]) => [capability, Math.max(requiredValue - (provided[capability] ?? 0), 0)] as const)
      .filter(([, missing]) => missing > 0)
  );
}

function hasRequirements(required: CapabilityMap, provided: CapabilityMap): boolean {
  return Object.keys(missingCapabilities(required, provided)).length === 0;
}

function hasAnyRequirement(required: CapabilityMap): boolean {
  return Object.values(required).some((value) => value > 0);
}

function addCapabilities(total: CapabilityMap, capabilities: CapabilityMap): void {
  for (const [capability, value] of Object.entries(capabilities)) {
    total[capability] = (total[capability] ?? 0) + value;
  }
}

function sumCapabilities(capabilities: CapabilityMap): number {
  return Object.values(capabilities).reduce((total, value) => total + value, 0);
}

function capabilityCoverage(required: CapabilityMap, provided: CapabilityMap): number {
  const requirements = Object.entries(required).filter(([, value]) => value > 0);
  if (requirements.length === 0) {
    return 1;
  }

  const covered = requirements.reduce((total, [capability, requiredValue]) => {
    return total + Math.min((provided[capability] ?? 0) / requiredValue, 1);
  }, 0);
  return covered / requirements.length;
}

function assignedCapabilities(
  state: ShiftState,
  incident: IncidentSimulationState,
  includeUnit: (unit: UnitSimulationState) => boolean = () => true
): CapabilityMap {
  const provided: CapabilityMap = {};
  for (const unitId of incident.assignedUnitIds) {
    const unit = state.units[unitId];
    if (!unit || !includeUnit(unit)) {
      continue;
    }
    const resource = state.config.resources.find((candidate) => candidate.id === unitId);
    if (!resource) {
      continue;
    }
    addCapabilities(provided, resolveResourceCapabilities(resourceTypeFor(state.config, resource), resource));
  }
  return provided;
}

function linearCredit(value: number | undefined, fullCredit: number, zeroCredit: number): number {
  if (value === undefined) {
    return 0;
  }
  if (value <= fullCredit) {
    return 1;
  }
  if (value >= zeroCredit) {
    return 0;
  }
  return 1 - ((value - fullCredit) / (zeroCredit - fullCredit));
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function scoreDimension(
  id: ScoreDimension["id"],
  label: string,
  maxScore: number,
  credit: number,
  explanation: string
): ScoreDimension {
  return {
    id,
    label,
    score: roundScore(maxScore * Math.max(0, Math.min(1, credit))),
    maxScore,
    explanation
  };
}

function formatCapabilities(capabilities: CapabilityMap): string {
  const entries = Object.entries(capabilities);
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([capability, value]) => `${capability} ${value}`).join(", ");
}

function scoreClassification(incident: IncidentSimulationState, profile: IncidentProfile, scoring: ScoringProfile): ScoreDimension {
  const selected = incident.selectedCode;
  const credit = selected && profile.classification.idealCodes.includes(selected)
    ? 1
    : selected && profile.classification.acceptableCodes.includes(selected)
      ? 0.7
      : 0;
  const explanation = selected
    ? `Selected ${selected}; ideal ${profile.classification.idealCodes.join("/")}, acceptable ${profile.classification.acceptableCodes.join("/")}.`
    : `No classification selected; ideal ${profile.classification.idealCodes.join("/")}.`;
  return scoreDimension("classification", "Classification", scoring.dimensions.classification, credit, explanation);
}

function scorePriority(incident: IncidentSimulationState, profile: IncidentProfile, scoring: ScoringProfile): ScoreDimension {
  const selected = incident.selectedPriority;
  const credit = selected && profile.classification.idealPriorities.includes(selected)
    ? 1
    : selected && profile.classification.acceptablePriorities.includes(selected)
      ? 0.7
      : 0;
  const explanation = selected
    ? `Selected ${selected}; ideal ${profile.classification.idealPriorities.join("/")}, acceptable ${profile.classification.acceptablePriorities.join("/")}.`
    : `No priority selected; ideal ${profile.classification.idealPriorities.join("/")}.`;
  return scoreDimension("priority", "Priority", scoring.dimensions.priority, credit, explanation);
}

function scoreDuplicateHandling(
  state: ShiftState,
  incident: IncidentSimulationState,
  scoring: ScoringProfile
): ScoreDimension {
  const deliveredDuplicates = incident.duplicateReports.filter((report) => report.deliveredAt !== undefined);
  if (deliveredDuplicates.length === 0) {
    return scoreDimension(
      "duplicateHandling",
      "Duplicate Handling",
      scoring.dimensions.duplicateHandling,
      1,
      "No duplicate reports were delivered."
    );
  }

  const linked = deliveredDuplicates.filter((report) => incident.linkedReportIds.includes(report.id)).length;
  const incorrectlySplit = deliveredDuplicates.filter((report) => {
    return state.incidents.some((candidate) => candidate.splitFromReportId === report.id);
  }).length;
  const credit = Math.max(0, (linked - incorrectlySplit) / deliveredDuplicates.length);
  return scoreDimension(
    "duplicateHandling",
    "Duplicate Handling",
    scoring.dimensions.duplicateHandling,
    credit,
    `${linked}/${deliveredDuplicates.length} duplicate report(s) linked; ${incorrectlySplit} split away from the hidden incident.`
  );
}

function scoreDispatchAdequacy(
  incident: IncidentSimulationState,
  profile: IncidentProfile,
  scoring: ScoringProfile,
  provided: CapabilityMap
): ScoreDimension {
  const stage = profile.stages[incident.stageIndex]!;
  const requiredCredit = capabilityCoverage(stage.controlRequires, provided);
  const desiredCredit = hasAnyRequirement(stage.controlDesires)
    ? capabilityCoverage(stage.controlDesires, provided)
    : requiredCredit;
  const credit = requiredCredit * (0.8 + (0.2 * desiredCredit));
  const missing = missingCapabilities(stage.controlRequires, provided);
  const desiredMissing = missingCapabilities(stage.controlDesires, provided);
  const explanation = `Initial dispatch provided ${formatCapabilities(provided)}; required ${formatCapabilities(stage.controlRequires)}; missing ${formatCapabilities(missing)}; desired missing ${formatCapabilities(desiredMissing)}.`;
  return scoreDimension("dispatchAdequacy", "Dispatch Adequacy", scoring.dimensions.dispatchAdequacy, credit, explanation);
}

function scoreTimeToControl(
  incident: IncidentSimulationState,
  scoring: ScoringProfile
): ScoreDimension {
  const start = incident.reportedAt ?? incident.createdAt;
  const elapsed = incident.controlledAt === undefined ? undefined : incident.controlledAt - start;
  const credit = linearCredit(elapsed, scoring.timeToControl.fullCreditSeconds, scoring.timeToControl.zeroCreditSeconds);
  const explanation = elapsed === undefined
    ? `Incident was not controlled; full credit by ${scoring.timeToControl.fullCreditSeconds}s, zero by ${scoring.timeToControl.zeroCreditSeconds}s.`
    : `Controlled ${Math.round(elapsed)}s after report; full credit by ${scoring.timeToControl.fullCreditSeconds}s, zero by ${scoring.timeToControl.zeroCreditSeconds}s.`;
  return scoreDimension("timeToControl", "Time To Control", scoring.dimensions.timeToControl, credit, explanation);
}

function scoreEscalationPrevention(
  incident: IncidentSimulationState,
  scoring: ScoringProfile
): ScoreDimension {
  const credit = incident.escalatedAt === undefined ? 1 : 0;
  const explanation = incident.escalatedAt === undefined
    ? "No escalation occurred before control."
    : `Incident escalated at ${Math.round(incident.escalatedAt)}s.`;
  return scoreDimension("escalationPrevention", "Escalation Prevention", scoring.dimensions.escalationPrevention, credit, explanation);
}

function scoreEmsTransport(
  incident: IncidentSimulationState,
  scoring: ScoringProfile
): ScoreDimension {
  if (!incident.emsTransportRequired) {
    return scoreDimension("emsTransport", "EMS Transport", scoring.dimensions.emsTransport, 1, "Transport was not required.");
  }

  const start = incident.controlledAt ?? incident.firstArrivalAt ?? incident.reportedAt ?? incident.createdAt;
  const elapsed = incident.emsTransportCompletedAt === undefined ? undefined : incident.emsTransportCompletedAt - start;
  const credit = linearCredit(elapsed, scoring.emsTransport.fullCreditSeconds, scoring.emsTransport.zeroCreditSeconds);
  const explanation = elapsed === undefined
    ? `Required transport was not completed; full credit by ${scoring.emsTransport.fullCreditSeconds}s, zero by ${scoring.emsTransport.zeroCreditSeconds}s.`
    : `Transport completed ${Math.round(elapsed)}s after control/arrival; full credit by ${scoring.emsTransport.fullCreditSeconds}s, zero by ${scoring.emsTransport.zeroCreditSeconds}s.`;
  return scoreDimension("emsTransport", "EMS Transport", scoring.dimensions.emsTransport, credit, explanation);
}

function scoreOverDispatch(
  incident: IncidentSimulationState,
  profile: IncidentProfile,
  scoring: ScoringProfile,
  provided: CapabilityMap
): ScoreDimension {
  const stage = profile.stages[incident.stageIndex]!;
  const baseline: CapabilityMap = { ...stage.controlRequires };
  for (const [capability, value] of Object.entries(stage.controlDesires)) {
    baseline[capability] = (baseline[capability] ?? 0) + value;
  }
  const requiredTotal = sumCapabilities(baseline);
  const surplus = Object.entries(provided).reduce((total, [capability, value]) => {
    return total + Math.max(0, value - (baseline[capability] ?? 0));
  }, 0);
  const surplusRatio = requiredTotal === 0 ? 0 : surplus / requiredTotal;
  const credit = surplusRatio <= scoring.overDispatch.freeSurplusRatio
    ? 1
    : linearCredit(surplusRatio, scoring.overDispatch.freeSurplusRatio, scoring.overDispatch.zeroCreditSurplusRatio);
  const explanation = `Surplus capability ratio ${surplusRatio.toFixed(2)}; free up to ${scoring.overDispatch.freeSurplusRatio}, zero at ${scoring.overDispatch.zeroCreditSurplusRatio}.`;
  return scoreDimension("overDispatch", "Over-Dispatch", scoring.dimensions.overDispatch, credit, explanation);
}

function initialDispatchCapabilities(state: ShiftState, incident: IncidentSimulationState): CapabilityMap {
  if (incident.firstArrivalAt === undefined) {
    return {};
  }

  return assignedCapabilities(state, incident, (unit) => {
    return unit.dispatchedAt !== undefined && unit.dispatchedAt <= incident.firstArrivalAt!;
  });
}

function escalationPath(profile: IncidentProfile, incident: IncidentSimulationState): DebriefIncident["escalationPath"] {
  return profile.stages.map((stage, index) => ({
    stageId: stage.id,
    startsAt: stage.startsAt,
    occurred: index <= incident.stageIndex,
    reportKey: stage.escalationReportKey
  }));
}

function deteriorationReasons(incident: IncidentSimulationState): string[] {
  const reasons: string[] = [];
  if (incident.escalatedAt !== undefined) {
    reasons.push(`Escalated at ${Math.round(incident.escalatedAt)}s before control.`);
  }
  if (incident.controlledAt === undefined) {
    reasons.push("Incident was not controlled before shift finish.");
  }
  if (incident.emsTransportRequired && incident.emsTransportCompletedAt === undefined) {
    reasons.push("Required EMS transport was not completed.");
  }
  return reasons;
}

function resourceTypeFor(config: LoadedConfig, resource: Resource): ResourceType {
  const resourceType = config.resourceTypes.find((candidate) => candidate.id === resource.type);
  if (!resourceType) {
    throw new Error(`Resource ${resource.id} references missing type ${resource.type}`);
  }
  return resourceType;
}

function releaseUnit(state: ShiftState, unit: UnitSimulationState, at = state.clock.now): void {
  unit.status = "available_mobile";
  unit.incidentId = undefined;
  unit.destination = undefined;
  unit.route = undefined;
  unit.routeStartedAt = undefined;
  unit.arrivalAt = undefined;
  unit.availableAt = undefined;
  unit.locationUpdatedAt = at;
  addEvent(state, {
    at,
    type: "unit_available",
    unitIds: [unit.id],
    message: `${unit.callSign} available`
  });
}

function updateUnitRouteLocation(unit: UnitSimulationState, at: number): void {
  if (unit.status !== "en_route" || !unit.route || unit.routeStartedAt === undefined || unit.arrivalAt === undefined) {
    return;
  }

  if (at <= unit.routeStartedAt) {
    unit.location = unit.route.geometry[0]!;
    unit.locationUpdatedAt = at;
    return;
  }

  if (at >= unit.arrivalAt) {
    unit.location = unit.route.geometry.at(-1)!;
    unit.locationUpdatedAt = unit.arrivalAt;
    return;
  }

  const travelDuration = unit.arrivalAt - unit.routeStartedAt;
  const sampledAt = unit.routeStartedAt +
    (Math.floor((at - unit.routeStartedAt) / locationUpdateIntervalSeconds) * locationUpdateIntervalSeconds);
  unit.location = pointAlongRoute(unit.route.geometry, (sampledAt - unit.routeStartedAt) / travelDuration);
  unit.locationUpdatedAt = sampledAt;
}

function updateEnRouteLocations(state: ShiftState): void {
  for (const unit of Object.values(state.units)) {
    updateUnitRouteLocation(unit, state.clock.now);
  }
}

function removeAssignedUnit(incident: IncidentSimulationState | undefined, unitId: string): void {
  if (!incident) {
    return;
  }
  incident.assignedUnitIds = incident.assignedUnitIds.filter((assignedUnitId) => assignedUnitId !== unitId);
}

function commitUnitAfterControl(state: ShiftState, incident: IncidentSimulationState, unit: UnitSimulationState): void {
  if (incident.commitmentClearsAt === undefined) {
    return;
  }

  if (incident.commitmentClearsAt <= state.clock.now) {
    releaseUnit(state, unit);
    return;
  }

  unit.status = "committed_on_scene";
  unit.availableAt = incident.commitmentClearsAt;
}

export function getIncidentCapabilityCheck(state: ShiftState, incidentId: string): CapabilityCheck {
  const incident = state.incidents.find((candidate) => candidate.id === incidentId);
  if (!incident) {
    throw new Error(`Unknown incident ${incidentId}`);
  }

  const profile = state.config.incidents.find((candidate) => candidate.id === incident.profileId);
  if (!profile) {
    throw new Error(`Unknown incident profile ${incident.profileId}`);
  }

  const stage = profile.stages[incident.stageIndex]!;
  const provided: CapabilityMap = {};
  for (const unit of Object.values(state.units)) {
    if (unit.incidentId !== incidentId || (unit.status !== "on_scene" && unit.status !== "committed_on_scene")) {
      continue;
    }

    const resource = state.config.resources.find((candidate) => candidate.id === unit.id);
    if (!resource) {
      continue;
    }
    addCapabilities(provided, resolveResourceCapabilities(resourceTypeFor(state.config, resource), resource));
  }

  return {
    provided,
    missingControl: missingCapabilities(stage.controlRequires, provided),
    missingContainment: missingCapabilities(stage.containmentRequires, provided)
  };
}

function evaluateIncident(state: ShiftState, incident: IncidentSimulationState): void {
  if (incident.controlledAt !== undefined) {
    return;
  }

  const profile = state.config.incidents.find((candidate) => candidate.id === incident.profileId)!;
  if (
    incident.willEscalate &&
    incident.escalatesAt !== undefined &&
    state.clock.now >= incident.escalatesAt &&
    incident.stageIndex === 0 &&
    incident.controlledAt === undefined
  ) {
    const nextStage = profile.stages[1]!;
    incident.stageIndex = 1;
    incident.stageId = nextStage.id;
    incident.status = "escalated";
    incident.escalatedAt = state.clock.now;
    addEvent(state, {
      type: "incident_escalated",
      incidentId: incident.id,
      message: localized(state.config, resolveLocalizationKey(profile.localizationPrefix, nextStage.escalationReportKey ?? nextStage.firstArrivalReportKey))
    });
  }

  const stage = profile.stages[incident.stageIndex]!;
  const check = getIncidentCapabilityCheck(state, incident.id);
  if (
    incident.containedAt === undefined &&
    hasAnyRequirement(stage.containmentRequires) &&
    hasRequirements(stage.containmentRequires, check.provided)
  ) {
    incident.containedAt = state.clock.now;
    incident.status = "contained";
    addEvent(state, {
      type: "incident_contained",
      incidentId: incident.id,
      message: `${incident.displayName} contained`
    });
  }

  if (hasRequirements(stage.controlRequires, check.provided)) {
    incident.controlledAt = state.clock.now;
    incident.status = "controlled";
    const commitmentRange = stage.commitment?.afterControlSeconds ?? profile.commitment.afterControlSeconds;
    const random = createRandomStream(`${state.seed}:${incident.id}:commitment`);
    const availableAt = state.clock.now + rangeValue(commitmentRange, random);
    incident.commitmentClearsAt = availableAt;
    for (const unit of Object.values(state.units)) {
      if (unit.incidentId === incident.id && unit.status === "on_scene") {
        commitUnitAfterControl(state, incident, unit);
      }
    }
    addEvent(state, {
      type: "incident_controlled",
      incidentId: incident.id,
      message: `${incident.displayName} controlled`
    });

    if (incident.emsTransportRequired && check.provided.ems) {
      const transport = stage.emsTransport ?? profile.emsTransport;
      const handoffRange = transport.mode === "none" ? [0, 0] as [number, number] : transport.handoffSeconds;
      incident.emsTransportCompletedAt = state.clock.now + rangeValue(handoffRange, random);
    }
  }
}

function processDueEvents(state: ShiftState): void {
  updateEnRouteLocations(state);

  for (const incident of state.incidents) {
    if (incident.reportedAt === undefined && state.clock.now >= incident.reportDueAt) {
      incident.reportedAt = incident.reportDueAt;
      incident.status = "reported";
      addEvent(state, {
        at: incident.reportDueAt,
        type: "report_received",
        incidentId: incident.id,
        message: incident.reportText ?? `${incident.displayName} reported`
      });
    }

    for (const report of incident.duplicateReports) {
      if (report.deliveredAt === undefined && state.clock.now >= report.dueAt) {
        report.deliveredAt = report.dueAt;
        addEvent(state, {
          at: report.dueAt,
          type: "duplicate_report_received",
          incidentId: incident.id,
          message: report.text
        });
      }
    }

    evaluateIncident(state, incident);
  }

  for (const unit of Object.values(state.units)) {
    if (unit.status === "en_route" && unit.arrivalAt !== undefined && state.clock.now >= unit.arrivalAt) {
      unit.status = "on_scene";
      unit.location = unit.destination ?? unit.location;
      unit.locationUpdatedAt = unit.arrivalAt;
      const incident = state.incidents.find((candidate) => candidate.id === unit.incidentId);
      addEvent(state, {
        at: unit.arrivalAt,
        type: "unit_arrived",
        incidentId: unit.incidentId,
        unitIds: [unit.id],
        message: `${unit.callSign} arrived`
      });

      if (incident && incident.firstArrivalAt === undefined) {
        const profile = state.config.incidents.find((candidate) => candidate.id === incident.profileId)!;
        const stage = profile.stages[incident.stageIndex]!;
        incident.firstArrivalAt = unit.arrivalAt;
        incident.windshieldReport = localized(state.config, resolveLocalizationKey(profile.localizationPrefix, stage.firstArrivalReportKey));
        addEvent(state, {
          at: unit.arrivalAt,
          type: "windshield_report",
          incidentId: incident.id,
          unitIds: [unit.id],
          message: incident.windshieldReport
        });
      }

      if (incident) {
        if (incident.controlledAt !== undefined) {
          commitUnitAfterControl(state, incident, unit);
        } else {
          evaluateIncident(state, incident);
        }
      }
    }

    if (
      (unit.status === "committed_on_scene" || unit.status === "recovering") &&
      unit.availableAt !== undefined &&
      state.clock.now >= unit.availableAt
    ) {
      releaseUnit(state, unit, unit.availableAt);
    }
  }

  for (const incident of state.incidents) {
    if (
      incident.emsTransportCompletedAt !== undefined &&
      state.clock.now >= incident.emsTransportCompletedAt &&
      !state.timeline.some((event) => event.type === "ems_transport_completed" && event.incidentId === incident.id)
    ) {
      addEvent(state, {
        at: incident.emsTransportCompletedAt,
        type: "ems_transport_completed",
        incidentId: incident.id,
        message: `${incident.displayName} EMS transport completed`
      });
    }
  }

  state.timeline.sort((a, b) => a.at - b.at || a.type.localeCompare(b.type));
}

export function advanceSimulation(state: ShiftState, seconds: number): ShiftState {
  if (seconds < 0) {
    throw new Error("Cannot advance simulation by negative time");
  }
  const next = cloneState(state);
  if (next.status === "finished" || next.clock.mode === "paused") {
    return next;
  }

  next.clock.now += seconds * next.clock.speed;
  processDueEvents(next);
  return next;
}

export function classifyIncident(state: ShiftState, incidentId: string, code: string, priority: string): ShiftState {
  const next = cloneState(state);
  const incident = next.incidents.find((candidate) => candidate.id === incidentId);
  if (!incident) {
    throw new Error(`Unknown incident ${incidentId}`);
  }
  const dispatchCode = next.config.dispatchCodes.find((candidate) => candidate.id === code);
  if (!dispatchCode?.validPriorities.includes(priority)) {
    throw new Error(`Invalid code-priority ${code}-${priority}`);
  }

  incident.selectedCode = code;
  incident.selectedPriority = priority;
  addEvent(next, {
    type: "incident_classified",
    incidentId,
    message: `${incident.displayName} classified as ${code}-${priority}`
  });
  return next;
}

interface TravelPlan {
  turnoutSeconds: number;
  route: RouteResult;
  totalSeconds: number;
}

function travelPlan(state: ShiftState, unit: UnitSimulationState, incident: IncidentSimulationState): TravelPlan {
  const resource = state.config.resources.find((candidate) => candidate.id === unit.id);
  if (!resource) {
    throw new Error(`Unknown resource ${unit.id}`);
  }
  const resourceType = resourceTypeFor(state.config, resource);
  const priority = incident.selectedPriority ?? "B";
  const priorityConfig = state.config.priorities.find((candidate) => candidate.id === priority);
  const turnoutRange = resource.overrides.turnout?.delaySeconds ?? resourceType.turnout.delaySeconds;
  const turnoutRandom = createRandomStream(`${state.seed}:${unit.id}:${incident.id}:turnout`);
  const turnout = rangeValue(turnoutRange, turnoutRandom) * (resourceType.turnout.priorityModifiers[priority] ?? 1);
  const baseRoute = routingService.route(unit.location, incident.location);
  const route = {
    ...baseRoute,
    durationSeconds: Math.ceil(baseRoute.durationSeconds *
      resourceType.travel.timeMultiplier *
      (priorityConfig?.travelTimeMultiplier ?? 1))
  };
  return {
    turnoutSeconds: turnout,
    route,
    totalSeconds: Math.ceil(turnout + route.durationSeconds)
  };
}

export function dispatchUnits(state: ShiftState, command: DispatchCommand): ShiftState {
  const next = cloneState(state);
  const incident = next.incidents.find((candidate) => candidate.id === command.incidentId);
  if (!incident) {
    throw new Error(`Unknown incident ${command.incidentId}`);
  }
  if (!incident.selectedCode || !incident.selectedPriority) {
    throw new Error(`Incident ${command.incidentId} must be classified before dispatch`);
  }

  const dispatched: string[] = [];
  for (const unitId of command.unitIds) {
    const unit = next.units[unitId];
    if (!unit) {
      throw new Error(`Unknown unit ${unitId}`);
    }
    if (unit.status !== "available_at_station" && unit.status !== "available_mobile") {
      continue;
    }

    const plan = travelPlan(next, unit, incident);
    unit.status = "en_route";
    unit.incidentId = incident.id;
    unit.destination = incident.location;
    unit.route = plan.route;
    unit.dispatchedAt = next.clock.now;
    unit.routeStartedAt = next.clock.now + plan.turnoutSeconds;
    unit.arrivalAt = next.clock.now + plan.totalSeconds;
    unit.locationUpdatedAt = next.clock.now;
    incident.assignedUnitIds.push(unit.id);
    dispatched.push(unit.id);
  }

  if (dispatched.length > 0) {
    addEvent(next, {
      type: "units_dispatched",
      incidentId: incident.id,
      unitIds: dispatched,
      message: `Dispatched ${dispatched.map((unitId) => next.units[unitId]!.callSign).join(", ")}`
    });
  }
  return next;
}

export function holdUnits(state: ShiftState, unitIds: string[]): ShiftState {
  const next = cloneState(state);
  const held: string[] = [];
  for (const unitId of unitIds) {
    const unit = next.units[unitId];
    if (!unit || (unit.status !== "available_at_station" && unit.status !== "available_mobile")) {
      continue;
    }

    unit.status = "held";
    held.push(unit.id);
  }

  if (held.length > 0) {
    addEvent(next, {
      type: "units_held",
      unitIds: held,
      message: `Held ${held.map((unitId) => next.units[unitId]!.callSign).join(", ")}`
    });
  }
  return next;
}

export function releaseHeldUnits(state: ShiftState, unitIds: string[]): ShiftState {
  const next = cloneState(state);
  const released: string[] = [];
  for (const unitId of unitIds) {
    const unit = next.units[unitId];
    if (!unit || unit.status !== "held") {
      continue;
    }

    unit.status = "available_mobile";
    released.push(unit.id);
  }

  if (released.length > 0) {
    addEvent(next, {
      type: "units_released",
      unitIds: released,
      message: `Released ${released.map((unitId) => next.units[unitId]!.callSign).join(", ")}`
    });
  }
  return next;
}

export function recallUnits(state: ShiftState, unitIds: string[]): ShiftState {
  const next = cloneState(state);
  const recalled: string[] = [];
  for (const unitId of unitIds) {
    const unit = next.units[unitId];
    if (!unit || !["en_route", "on_scene", "committed_on_scene", "recovering"].includes(unit.status)) {
      continue;
    }

    const incident = next.incidents.find((candidate) => candidate.id === unit.incidentId);
    removeAssignedUnit(incident, unit.id);
    unit.status = "available_mobile";
    unit.incidentId = undefined;
    unit.destination = undefined;
    unit.route = undefined;
    unit.routeStartedAt = undefined;
    unit.arrivalAt = undefined;
    unit.availableAt = undefined;
    unit.locationUpdatedAt = next.clock.now;
    recalled.push(unit.id);
  }

  if (recalled.length > 0) {
    addEvent(next, {
      type: "units_recalled",
      unitIds: recalled,
      message: `Recalled ${recalled.map((unitId) => next.units[unitId]!.callSign).join(", ")}`
    });
  }
  return next;
}

export function rerouteUnits(state: ShiftState, command: DispatchCommand): ShiftState {
  let next = recallUnits(state, command.unitIds);
  const target = next.incidents.find((candidate) => candidate.id === command.incidentId);
  if (!target) {
    throw new Error(`Unknown incident ${command.incidentId}`);
  }
  if (!target.selectedCode || !target.selectedPriority) {
    throw new Error(`Incident ${command.incidentId} must be classified before rerouting units`);
  }

  next = dispatchUnits(next, command);
  addEvent(next, {
    type: "units_rerouted",
    incidentId: command.incidentId,
    unitIds: command.unitIds,
    message: `Rerouted ${command.unitIds.map((unitId) => next.units[unitId]?.callSign ?? unitId).join(", ")} to ${target.displayName}`
  });
  return next;
}

function findReportIncident(state: ShiftState, incidentId: string, reportId: string): {
  incident: IncidentSimulationState;
  report: NonNullable<IncidentSimulationState["duplicateReports"][number]>;
} {
  const incident = state.incidents.find((candidate) => candidate.id === incidentId);
  if (!incident) {
    throw new Error(`Unknown incident ${incidentId}`);
  }
  const report = incident.duplicateReports.find((candidate) => candidate.id === reportId);
  if (!report) {
    throw new Error(`Unknown report ${reportId}`);
  }
  if (report.deliveredAt === undefined) {
    throw new Error(`Report ${reportId} has not been delivered yet`);
  }
  return { incident, report };
}

export function linkReport(state: ShiftState, command: ReportCommand): ShiftState {
  const next = cloneState(state);
  const { incident, report } = findReportIncident(next, command.incidentId, command.reportId);
  if (!incident.linkedReportIds.includes(report.id)) {
    incident.linkedReportIds.push(report.id);
    addEvent(next, {
      type: "report_linked",
      incidentId: incident.id,
      message: `Linked report to ${incident.displayName}: ${report.text}`
    });
  }
  return next;
}

export function splitReport(state: ShiftState, command: ReportCommand): ShiftState {
  const next = cloneState(state);
  const { incident, report } = findReportIncident(next, command.incidentId, command.reportId);
  const splitId = `${incident.id}_split_${next.incidents.length + 1}`;
  if (next.incidents.some((candidate) => candidate.splitFromReportId === report.id)) {
    return next;
  }

  const splitIncident: IncidentSimulationState = {
    ...incident,
    id: splitId,
    createdAt: next.clock.now,
    reportDueAt: report.dueAt,
    reportedAt: next.clock.now,
    reportText: report.text,
    duplicateReports: [],
    selectedCode: undefined,
    selectedPriority: undefined,
    firstArrivalAt: undefined,
    windshieldReport: undefined,
    containedAt: undefined,
    controlledAt: undefined,
    escalatedAt: undefined,
    emsTransportCompletedAt: undefined,
    commitmentClearsAt: undefined,
    assignedUnitIds: [],
    linkedReportIds: [],
    splitFromReportId: report.id,
    status: "reported"
  };
  next.incidents.push(splitIncident);
  addEvent(next, {
    type: "report_split",
    incidentId: splitIncident.id,
    message: `Split report into new incident: ${report.text}`
  });
  return next;
}

export function dispatchSuggestedUnits(state: ShiftState, incidentId: string): ShiftState {
  const incident = state.incidents.find((candidate) => candidate.id === incidentId);
  if (!incident?.selectedCode || !incident.selectedPriority) {
    throw new Error(`Incident ${incidentId} must be classified before assisted dispatch`);
  }
  const suggestion = suggestDispatch(state.config, {
    code: incident.selectedCode,
    priority: incident.selectedPriority,
    incidentLocation: incident.location,
    unitStates: Object.fromEntries(Object.values(state.units).map((unit) => [
      unit.id,
      { status: unit.status, location: unit.location }
    ]))
  });
  return dispatchUnits(state, {
    incidentId,
    unitIds: suggestion.suggestedUnits.map((unit) => unit.unitId)
  });
}

export function finishShift(state: ShiftState): ShiftState {
  const next = cloneState(state);
  next.status = "finished";
  addEvent(next, { type: "shift_finished", message: "Shift finished" });
  return next;
}

export function createDebrief(state: ShiftState): ShiftDebrief {
  const startedAt = state.timeline.find((event) => event.type === "shift_started")?.at ?? 0;
  let finishedAt = state.clock.now;
  for (let index = state.timeline.length - 1; index >= 0; index -= 1) {
    if (state.timeline[index]!.type === "shift_finished") {
      finishedAt = state.timeline[index]!.at;
      break;
    }
  }
  const incidents: DebriefIncident[] = state.incidents.map((incident) => {
    const profile = state.config.incidents.find((candidate) => candidate.id === incident.profileId)!;
    const scoring = state.config.scoringProfiles.find((candidate) => candidate.id === profile.scoring.outcomeProfile);
    if (!scoring) {
      throw new Error(`Unknown scoring profile ${profile.scoring.outcomeProfile}`);
    }
    const stage = profile.stages[incident.stageIndex]!;
    const provided = initialDispatchCapabilities(state, incident);
    const dimensions = [
      scoreClassification(incident, profile, scoring),
      scorePriority(incident, profile, scoring),
      scoreDuplicateHandling(state, incident, scoring),
      scoreDispatchAdequacy(incident, profile, scoring, provided),
      scoreTimeToControl(incident, scoring),
      scoreEscalationPrevention(incident, scoring),
      scoreEmsTransport(incident, scoring),
      scoreOverDispatch(incident, profile, scoring, provided)
    ];
    const score = roundScore(dimensions.reduce((total, dimension) => total + dimension.score, 0));
    const maxScore = roundScore(dimensions.reduce((total, dimension) => total + dimension.maxScore, 0));
    return {
      incidentId: incident.id,
      profileId: incident.profileId,
      hiddenTruth: localized(state.config, resolveLocalizationKey(profile.localizationPrefix, profile.displayNameKey)),
      score,
      maxScore,
      dimensions,
      selectedCode: incident.selectedCode,
      selectedPriority: incident.selectedPriority,
      idealCodes: profile.classification.idealCodes,
      idealPriorities: profile.classification.idealPriorities,
      reportedAt: incident.reportedAt,
      firstArrivalAt: incident.firstArrivalAt,
      containedAt: incident.containedAt,
      controlledAt: incident.controlledAt,
      escalatedAt: incident.escalatedAt,
      emsTransportRequired: incident.emsTransportRequired,
      emsTransportCompletedAt: incident.emsTransportCompletedAt,
      commitmentClearsAt: incident.commitmentClearsAt,
      assignedUnitIds: [...incident.assignedUnitIds],
      controlRequires: { ...stage.controlRequires },
      controlDesires: { ...stage.controlDesires },
      containmentRequires: { ...stage.containmentRequires },
      containmentDesires: { ...stage.containmentDesires },
      escalationPath: escalationPath(profile, incident),
      deteriorationReasons: deteriorationReasons(incident)
    };
  });
  const weightedScore = roundScore(incidents.reduce((total, incident) => {
    const profile = state.config.incidents.find((candidate) => candidate.id === incident.profileId)!;
    const scoring = state.config.scoringProfiles.find((candidate) => candidate.id === profile.scoring.outcomeProfile)!;
    return total + (incident.score * scoring.incidentWeight);
  }, 0));
  const weightedMaxScore = roundScore(incidents.reduce((total, incident) => {
    const profile = state.config.incidents.find((candidate) => candidate.id === incident.profileId)!;
    const scoring = state.config.scoringProfiles.find((candidate) => candidate.id === profile.scoring.outcomeProfile)!;
    return total + (incident.maxScore * scoring.incidentWeight);
  }, 0));

  return {
    seed: state.seed,
    scenarioId: state.scenarioId,
    difficultyPresetId: state.difficultyPresetId,
    configVersion: "config-v1",
    regionVersion: `${state.config.region.id}-v1`,
    startedAt,
    finishedAt,
    score: weightedScore,
    maxScore: weightedMaxScore,
    percentage: weightedMaxScore === 0 ? 0 : roundScore((weightedScore / weightedMaxScore) * 100),
    incidents,
    timeline: state.timeline.map((event) => ({ ...event, unitIds: event.unitIds ? [...event.unitIds] : undefined }))
  };
}
