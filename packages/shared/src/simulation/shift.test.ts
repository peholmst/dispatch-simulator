import { describe, expect, it } from "vitest";
import { loadConfig, type LoadedConfig } from "../config/index.js";
import {
  advanceSimulation,
  classifyIncident,
  createDebrief,
  dispatchSuggestedUnits,
  dispatchUnits,
  finishShift,
  setPaused,
  setSpeed,
  startShift
} from "./index.js";

function withOnlyIncident(config: LoadedConfig, profileId: string): LoadedConfig {
  return {
    ...config,
    incidents: config.incidents.filter((incident) => incident.id === profileId)
  };
}

describe("simulation shift vertical slice", () => {
  it("starts a deterministic shift and delivers an ambiguous report", async () => {
    const config = await loadConfig(process.cwd());

    const first = startShift(config, { seed: "milestone-0", startTimeSeconds: 0 });
    const second = startShift(config, { seed: "milestone-0", startTimeSeconds: 0 });

    expect(first.incidents).toEqual(second.incidents);
    expect(first.incidents).toHaveLength(1);
    expect(first.incidents[0]!.status).toBe("pending_report");

    const withReport = advanceSimulation(first, first.incidents[0]!.reportDueAt);

    expect(withReport.incidents[0]!.status).toBe("reported");
    expect(withReport.incidents[0]!.reportText).toBeTruthy();
    expect(withReport.timeline.some((event) => event.type === "report_received")).toBe(true);
  });

  it("supports clock pause and speed controls", async () => {
    const config = await loadConfig(process.cwd());
    const started = startShift(config, { seed: "clock", startTimeSeconds: 0 });

    const paused = setPaused(started, true);
    expect(advanceSimulation(paused, 60).clock.now).toBe(0);

    const fast = setSpeed(setPaused(paused, false), 4);
    expect(advanceSimulation(fast, 15).clock.now).toBe(60);
  });

  it("classifies, dispatches, arrives, controls, finishes, and debriefs a medical incident", async () => {
    const config = withOnlyIncident(await loadConfig(process.cwd()), "chest_pain");
    let state = startShift(config, { seed: "medical-loop", startTimeSeconds: 0 });
    const incident = state.incidents[0]!;

    state = advanceSimulation(state, incident.reportDueAt);
    state = classifyIncident(state, incident.id, "704", "B");
    state = dispatchUnits(state, {
      incidentId: incident.id,
      unitIds: ["tampere_epi121"]
    });

    const arrivalAt = state.units.tampere_epi121!.arrivalAt;
    expect(arrivalAt).toBeGreaterThan(state.clock.now);

    state = advanceSimulation(state, arrivalAt! - state.clock.now);

    expect(state.units.tampere_epi121!.status).toMatch(/on_scene|committed_on_scene/);
    expect(state.incidents[0]!.firstArrivalAt).toBe(arrivalAt);
    expect(state.incidents[0]!.controlledAt).toBe(arrivalAt);
    expect(state.timeline.some((event) => event.type === "windshield_report")).toBe(true);

    state = finishShift(state);
    const debrief = createDebrief(state);

    expect(debrief.incidents[0]!.hiddenTruth).toBeTruthy();
    expect(debrief.incidents[0]!.selectedCode).toBe("704");
    expect(debrief.incidents[0]!.controlledAt).toBe(arrivalAt);
    expect(debrief.timeline.at(-1)!.type).toBe("shift_finished");
  });

  it("can use assisted dispatch to control a structural fire response", async () => {
    const config = withOnlyIncident(await loadConfig(process.cwd()), "apartment_fire");
    let state = startShift(config, { seed: "fire-loop", startTimeSeconds: 0 });
    const incident = state.incidents[0]!;

    state = advanceSimulation(state, incident.reportDueAt);
    state = classifyIncident(state, incident.id, "402", "B");
    state = dispatchSuggestedUnits(state, incident.id);

    const assigned = state.incidents[0]!.assignedUnitIds;
    expect(assigned.length).toBeGreaterThanOrEqual(5);
    expect(state.timeline.some((event) => event.type === "units_dispatched")).toBe(true);

    const latestArrival = Math.max(...assigned.map((unitId) => state.units[unitId]!.arrivalAt ?? 0));
    state = advanceSimulation(state, latestArrival - state.clock.now);

    expect(state.incidents[0]!.controlledAt).toBe(latestArrival);
    expect(state.incidents[0]!.assignedUnitIds).toEqual(assigned);
  });
});
