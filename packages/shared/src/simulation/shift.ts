import {
  resolveLocalizationKey,
  resolveResourceCapabilities,
  type CapabilityMap,
  type IncidentProfile,
  type LoadedConfig,
  type Resource,
  type ResourceType
} from "../config/index.js";
import { suggestDispatch } from "../dispatch/suggest.js";
import { distanceMeters, type Coordinates } from "./geometry.js";
import { createRandomStream } from "./random.js";
import type {
  CapabilityCheck,
  DebriefIncident,
  DispatchCommand,
  IncidentSimulationState,
  ReportCommand,
  ShiftDebrief,
  ShiftState,
  StartShiftOptions,
  TimelineEvent,
  UnitSimulationState
} from "./types.js";

const averageResponseSpeedMetersPerSecond = 13.9;

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
    units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, { ...unit }])),
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
  createdAt: number
): IncidentSimulationState {
  const random = createRandomStream(`${options.seed}:incident:${incidentNumber}`);
  const profile = random.pickWeighted(config.incidents, (incident) => incident.spawn.weight);
  const spawnCandidates = config.spawnLocations.filter((location) => matchesSpawn(profile, location));
  const spawnLocation = random.pickWeighted(spawnCandidates, () => 1);
  const report = random.pickWeighted(profile.reports.initial, (entry) => entry.weight);
  const initialStage = profile.stages[0]!;
  const escalationStage = profile.stages[1];
  const willEscalate = Boolean(escalationStage?.transition && random.next() < escalationStage.transition.probability);
  const stageTransport = initialStage.emsTransport ?? profile.emsTransport;
  const emsTransportRequired = stageTransport.mode === "required" ||
    (stageTransport.mode === "possible" && random.next() < stageTransport.probability);
  const reportDueAt = createdAt + rangeValue(profile.initialReportDelaySeconds, random);

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

function createIncidents(config: LoadedConfig, options: StartShiftOptions): IncidentSimulationState[] {
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
  const now = options.startTimeSeconds ?? 0;
  const state: ShiftState = {
    seed: options.seed,
    clock: { now, mode: "running", speed: 1 },
    status: "active",
    config,
    incidents: createIncidents(config, options),
    units: createUnits(config),
    timeline: []
  };

  addEvent(state, { type: "shift_started", message: `Shift started with seed ${options.seed}` });
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
  unit.arrivalAt = undefined;
  unit.availableAt = undefined;
  addEvent(state, {
    at,
    type: "unit_available",
    unitIds: [unit.id],
    message: `${unit.callSign} available`
  });
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

function travelSeconds(state: ShiftState, unit: UnitSimulationState, incident: IncidentSimulationState): number {
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
  const travel = distanceMeters(unit.location, incident.location) /
    averageResponseSpeedMetersPerSecond *
    resourceType.travel.timeMultiplier *
    (priorityConfig?.travelTimeMultiplier ?? 1);
  return Math.ceil(turnout + travel);
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

    const seconds = travelSeconds(next, unit, incident);
    unit.status = "en_route";
    unit.incidentId = incident.id;
    unit.destination = incident.location;
    unit.dispatchedAt = next.clock.now;
    unit.arrivalAt = next.clock.now + seconds;
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
    unit.arrivalAt = undefined;
    unit.availableAt = undefined;
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
    return {
      incidentId: incident.id,
      profileId: incident.profileId,
      hiddenTruth: localized(state.config, resolveLocalizationKey(profile.localizationPrefix, profile.displayNameKey)),
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
      assignedUnitIds: [...incident.assignedUnitIds]
    };
  });

  return {
    seed: state.seed,
    startedAt,
    finishedAt,
    incidents,
    timeline: state.timeline.map((event) => ({ ...event, unitIds: event.unitIds ? [...event.unitIds] : undefined }))
  };
}
