import type { LoadedConfig, ShiftDebrief, ShiftState } from "@dispatch-simulator/shared";

export interface CompletedShiftSummary {
  id: string;
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
  incidentCount: number;
}

export interface ApiState {
  config?: LoadedConfig;
  shift?: ShiftState;
  debrief?: ShiftDebrief;
  completedShiftSummaries?: CompletedShiftSummary[];
}

export type MainTab = "incidents" | "timeline";

export interface UnitMapFocusRequest {
  unitId: string;
  token: number;
}
