import { describe, expect, it } from "vitest";
import { loadConfig, type LoadedConfig } from "../config/index.js";
import {
  advanceSimulation,
  classifyIncident,
  createDebrief,
  dispatchSuggestedUnits,
  dispatchUnits,
  finishShift,
  holdUnits,
  linkReport,
  recallUnits,
  releaseHeldUnits,
  rerouteUnits,
  setPaused,
  setSpeed,
  splitReport,
  startShift
} from "./index.js";

function withOnlyIncident(config: LoadedConfig, profileId: string): LoadedConfig {
  return {
    ...config,
    incidents: config.incidents.filter((incident) => incident.id === profileId)
  };
}

describe("simulation shift vertical slice", () => {
  it("starts a deterministic shift with an incident queue and delivers ambiguous reports", async () => {
    const config = await loadConfig(process.cwd());

    const first = startShift(config, { seed: "milestone-0", startTimeSeconds: 0, incidentCount: 2 });
    const second = startShift(config, { seed: "milestone-0", startTimeSeconds: 0, incidentCount: 2 });

    expect(first.incidents).toEqual(second.incidents);
    expect(first.incidents).toHaveLength(2);
    expect(first.incidents[0]!.status).toBe("pending_report");
    expect(first.incidents[1]!.createdAt).toBeGreaterThan(first.incidents[0]!.createdAt);

    const withReport = advanceSimulation(first, first.incidents[1]!.reportDueAt);

    expect(withReport.incidents[0]!.status).toBe("reported");
    expect(withReport.incidents[1]!.status).toBe("reported");
    expect(withReport.incidents[0]!.reportText).toBeTruthy();
    expect(withReport.timeline.filter((event) => event.type === "report_received")).toHaveLength(2);
  });

  it("delivers deterministic duplicate reports from incident profiles", async () => {
    const config = withOnlyIncident(await loadConfig(process.cwd()), "apartment_fire");
    const started = startShift(config, { seed: "duplicate-report", startTimeSeconds: 0 });
    const incident = started.incidents[0]!;

    expect(incident.duplicateReports).toHaveLength(1);
    expect(incident.duplicateReports[0]!.dueAt).toBeGreaterThan(incident.reportDueAt);

    const withDuplicate = advanceSimulation(started, incident.duplicateReports[0]!.dueAt);

    expect(withDuplicate.incidents[0]!.duplicateReports[0]!.deliveredAt).toBe(incident.duplicateReports[0]!.dueAt);
    expect(withDuplicate.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "duplicate_report_received",
        incidentId: incident.id,
        message: expect.stringContaining("flames")
      })
    ]));
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

  it("assigns cached routes and updates en-route unit locations on coarse ticks", async () => {
    const config = withOnlyIncident(await loadConfig(process.cwd()), "chest_pain");
    let state = startShift(config, { seed: "routed-movement", startTimeSeconds: 0 });
    const incident = state.incidents[0]!;
    const startLocation = state.units.tampere_epi121!.location;

    state = advanceSimulation(state, incident.reportDueAt);
    state = classifyIncident(state, incident.id, "704", "B");
    state = dispatchUnits(state, {
      incidentId: incident.id,
      unitIds: ["tampere_epi121", "tampere_epi131"]
    });

    const advancedUnit = state.units.tampere_epi121!;
    const basicUnit = state.units.tampere_epi131!;
    expect(advancedUnit.route).toEqual(expect.objectContaining({
      provider: "straight-line-cache",
      cacheKey: basicUnit.route!.cacheKey
    }));
    expect(advancedUnit.route!.geometry.length).toBeGreaterThanOrEqual(2);
    expect(advancedUnit.routeStartedAt).toBeGreaterThanOrEqual(advancedUnit.dispatchedAt!);

    const afterTurnout = advanceSimulation(state, advancedUnit.routeStartedAt! - state.clock.now + 20);
    expect(afterTurnout.units.tampere_epi121!.locationUpdatedAt).toBe(advancedUnit.routeStartedAt! + 15);
    expect(afterTurnout.units.tampere_epi121!.location).not.toEqual(startLocation);
    expect(afterTurnout.units.tampere_epi121!.status).toBe("en_route");

    const arrived = advanceSimulation(afterTurnout, advancedUnit.arrivalAt! - afterTurnout.clock.now);
    expect(arrived.units.tampere_epi121!.location).toEqual(incident.location);
    expect(arrived.units.tampere_epi121!.status).toMatch(/on_scene|committed_on_scene/);
  });

  it("commits and releases units that arrive after an incident was already controlled", async () => {
    const config = withOnlyIncident(await loadConfig(process.cwd()), "apartment_fire");
    let state = startShift(config, { seed: "staggered-release", startTimeSeconds: 0 });
    const incident = state.incidents[0]!;

    state = advanceSimulation(state, incident.reportDueAt);
    state = classifyIncident(state, incident.id, "402", "B");
    state = dispatchSuggestedUnits(state, incident.id);

    const assigned = state.incidents[0]!.assignedUnitIds;
    const earliestArrival = Math.min(...assigned.map((unitId) => state.units[unitId]!.arrivalAt ?? Number.POSITIVE_INFINITY));
    const latestArrival = Math.max(...assigned.map((unitId) => state.units[unitId]!.arrivalAt ?? 0));

    state = advanceSimulation(state, earliestArrival - state.clock.now);
    expect(state.incidents[0]!.controlledAt).toBe(earliestArrival);

    state = advanceSimulation(state, latestArrival - state.clock.now);
    expect(assigned.every((unitId) => state.units[unitId]!.status === "committed_on_scene")).toBe(true);

    const commitmentClearsAt = state.incidents[0]!.commitmentClearsAt;
    expect(commitmentClearsAt).toBeGreaterThan(latestArrival);

    state = advanceSimulation(state, commitmentClearsAt! - state.clock.now);
    expect(assigned.every((unitId) => state.units[unitId]!.status === "available_mobile")).toBe(true);
  });

  it("supports hold, recall, reroute, link report, and split report dispatcher commands", async () => {
    const config = withOnlyIncident(await loadConfig(process.cwd()), "apartment_fire");
    let state = startShift(config, {
      seed: "dispatch-ui-actions",
      startTimeSeconds: 0,
      incidentCount: 2,
      incidentSpacingSeconds: 300
    });

    state = holdUnits(state, ["tampere_rpi106"]);
    expect(state.units.tampere_rpi106!.status).toBe("held");

    state = releaseHeldUnits(state, ["tampere_rpi106"]);
    expect(state.units.tampere_rpi106!.status).toBe("available_mobile");

    const first = state.incidents[0]!;
    const second = state.incidents[1]!;
    state = advanceSimulation(state, second.reportDueAt);
    state = classifyIncident(state, first.id, "402", "B");
    state = classifyIncident(state, second.id, "402", "B");
    state = dispatchUnits(state, { incidentId: first.id, unitIds: ["tampere_rpi101"] });
    expect(state.units.tampere_rpi101!.incidentId).toBe(first.id);

    state = rerouteUnits(state, { incidentId: second.id, unitIds: ["tampere_rpi101"] });
    expect(state.units.tampere_rpi101!.incidentId).toBe(second.id);
    expect(state.incidents.find((incident) => incident.id === first.id)!.assignedUnitIds).not.toContain("tampere_rpi101");
    expect(state.timeline.some((event) => event.type === "units_rerouted")).toBe(true);

    state = recallUnits(state, ["tampere_rpi101"]);
    expect(state.units.tampere_rpi101!.status).toBe("available_mobile");
    expect(state.units.tampere_rpi101!.incidentId).toBeUndefined();

    const duplicateReport = first.duplicateReports[0]!;
    state = advanceSimulation(state, Math.max(duplicateReport.dueAt - state.clock.now, 0));
    state = linkReport(state, { incidentId: first.id, reportId: duplicateReport.id });
    expect(state.incidents.find((incident) => incident.id === first.id)!.linkedReportIds).toContain(duplicateReport.id);

    state = splitReport(state, { incidentId: first.id, reportId: duplicateReport.id });
    expect(state.incidents.some((incident) => incident.splitFromReportId === duplicateReport.id)).toBe(true);
    expect(state.timeline.some((event) => event.type === "report_split")).toBe(true);
  });
});
