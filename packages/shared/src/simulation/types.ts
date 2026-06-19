import type { CapabilityMap, LoadedConfig } from "../config/index.js";
import type { Coordinates } from "./geometry.js";

export type SimulationClockMode = "running" | "paused";

export type UnitStatus =
  | "available_at_station"
  | "available_mobile"
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
}

export interface SimulationClockState {
  now: number;
  mode: SimulationClockMode;
  speed: number;
}

export interface ShiftState {
  seed: string;
  clock: SimulationClockState;
  status: "active" | "finished";
  config: LoadedConfig;
  incidents: IncidentSimulationState[];
  units: Record<string, UnitSimulationState>;
  timeline: TimelineEvent[];
}

export interface StartShiftOptions {
  seed: string;
  startTimeSeconds?: number;
  incidentCount?: number;
  incidentSpacingSeconds?: number;
}

export interface DispatchCommand {
  incidentId: string;
  unitIds: string[];
}

export interface DebriefIncident {
  incidentId: string;
  profileId: string;
  hiddenTruth: string;
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
}

export interface ShiftDebrief {
  seed: string;
  startedAt: number;
  finishedAt: number;
  incidents: DebriefIncident[];
  timeline: TimelineEvent[];
}

export interface CapabilityCheck {
  provided: CapabilityMap;
  missingControl: CapabilityMap;
  missingContainment: CapabilityMap;
}
