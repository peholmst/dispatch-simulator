import type { CapabilityMap, LoadedConfig } from "../config/index.js";
import type { Coordinates } from "./geometry.js";
import type { RouteResult } from "./routing.js";

export type SimulationClockMode = "running" | "paused";

export type UnitStatus =
  | "available_at_station"
  | "available_mobile"
  | "held"
  | "out_of_service"
  | "en_route"
  | "on_scene"
  | "committed_on_scene"
  | "recovering";

export type IncidentStatus = "pending_report" | "reported" | "contained" | "controlled" | "escalated";

export type TimelineEventType =
  | "shift_started"
  | "report_received"
  | "duplicate_report_received"
  | "incident_classified"
  | "units_dispatched"
  | "units_held"
  | "units_released"
  | "units_recalled"
  | "units_rerouted"
  | "report_linked"
  | "report_split"
  | "unit_arrived"
  | "windshield_report"
  | "incident_contained"
  | "incident_escalated"
  | "incident_controlled"
  | "ems_transport_completed"
  | "unit_available"
  | "shift_finished";

export interface TimelineEvent {
  at: number;
  type: TimelineEventType;
  incidentId?: string;
  unitIds?: string[];
  message: string;
}

export interface UnitSimulationState {
  id: string;
  callSign: string;
  status: UnitStatus;
  stationId: string;
  location: Coordinates;
  destination?: Coordinates;
  route?: RouteResult;
  routeStartedAt?: number;
  locationUpdatedAt?: number;
  incidentId?: string;
  dispatchedAt?: number;
  arrivalAt?: number;
  availableAt?: number;
}

export interface ScheduledIncidentReport {
  id: string;
  dueAt: number;
  text: string;
  deliveredAt?: number;
}

export interface IncidentSimulationState {
  id: string;
  profileId: string;
  displayName: string;
  locationId: string;
  location: Coordinates;
  status: IncidentStatus;
  createdAt: number;
  reportDueAt: number;
  reportedAt?: number;
  reportText?: string;
  duplicateReports: ScheduledIncidentReport[];
  selectedCode?: string;
  selectedPriority?: string;
  stageId: string;
  stageIndex: number;
  willEscalate: boolean;
  escalatesAt?: number;
  escalatedAt?: number;
  firstArrivalAt?: number;
  windshieldReport?: string;
  containedAt?: number;
  controlledAt?: number;
  emsTransportRequired: boolean;
  emsTransportCompletedAt?: number;
  commitmentClearsAt?: number;
  assignedUnitIds: string[];
  linkedReportIds: string[];
  splitFromReportId?: string;
}

export interface SimulationClockState {
  now: number;
  mode: SimulationClockMode;
  speed: number;
}

export interface ShiftState {
  seed: string;
  scenarioId?: string;
  difficultyPresetId?: string;
  clock: SimulationClockState;
  status: "active" | "finished";
  config: LoadedConfig;
  incidents: IncidentSimulationState[];
  units: Record<string, UnitSimulationState>;
  timeline: TimelineEvent[];
}

export interface StartShiftOptions {
  seed: string;
  scenarioId?: string;
  startTimeSeconds?: number;
  incidentCount?: number;
  incidentSpacingSeconds?: number;
}

export interface DispatchCommand {
  incidentId: string;
  unitIds: string[];
}

export interface ReportCommand {
  incidentId: string;
  reportId: string;
}

export interface DebriefIncident {
  incidentId: string;
  profileId: string;
  hiddenTruth: string;
  score: number;
  maxScore: number;
  dimensions: ScoreDimension[];
  selectedCode?: string;
  selectedPriority?: string;
  idealCodes: string[];
  idealPriorities: string[];
  reportedAt?: number;
  firstArrivalAt?: number;
  containedAt?: number;
  controlledAt?: number;
  escalatedAt?: number;
  emsTransportRequired: boolean;
  emsTransportCompletedAt?: number;
  commitmentClearsAt?: number;
  assignedUnitIds: string[];
  controlRequires: CapabilityMap;
  controlDesires: CapabilityMap;
  containmentRequires: CapabilityMap;
  containmentDesires: CapabilityMap;
  escalationPath: Array<{
    stageId: string;
    startsAt: number;
    occurred: boolean;
    reportKey?: string;
  }>;
  deteriorationReasons: string[];
}

export interface ScoreDimension {
  id:
    | "classification"
    | "priority"
    | "duplicateHandling"
    | "dispatchAdequacy"
    | "timeToControl"
    | "escalationPrevention"
    | "emsTransport"
    | "overDispatch";
  label: string;
  score: number;
  maxScore: number;
  explanation: string;
}

export interface ShiftDebrief {
  seed: string;
  scenarioId?: string;
  difficultyPresetId?: string;
  configVersion: string;
  regionVersion: string;
  startedAt: number;
  finishedAt: number;
  score: number;
  maxScore: number;
  percentage: number;
  incidents: DebriefIncident[];
  timeline: TimelineEvent[];
}

export interface CapabilityCheck {
  provided: CapabilityMap;
  missingControl: CapabilityMap;
  missingContainment: CapabilityMap;
}
