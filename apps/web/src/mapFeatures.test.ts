import { describe, expect, it } from "vitest";
import { advanceSimulation, classifyIncident, loadConfig, startShift } from "@dispatch-simulator/shared";
import { buildPointFeatures, featuresAtSameLocation, pointFeaturesByKind, unitMapStatus } from "./mapFeatures";

describe("map features", () => {
  it("keeps every unit visible at its exact simulation location", async () => {
    const config = await loadConfig();
    const shift = startShift(config, { seed: "map-feature-test", scenarioId: "smoke_then_fire" });

    const points = buildPointFeatures(shift);
    const units = pointFeaturesByKind(points, "unit").features;

    expect(units).toHaveLength(Object.keys(shift.units).length);
    for (const unit of Object.values(shift.units)) {
      const feature = units.find((candidate) => candidate.properties.id === unit.id);
      expect(feature).toBeDefined();
      expect(feature!.geometry.coordinates).toEqual([unit.location.lon, unit.location.lat]);
    }
  });

  it("keeps station and colocated units as separate features at the same coordinates", async () => {
    const config = await loadConfig();
    const shift = startShift(config, { seed: "map-feature-stack-test", scenarioId: "smoke_then_fire" });
    const station = shift.config.stations[0]!;
    const points = buildPointFeatures(shift);

    const colocated = featuresAtSameLocation(points, [station.coordinates.lon, station.coordinates.lat]);

    expect(colocated.some((feature) => feature.properties.kind === "station" && feature.properties.id === station.id)).toBe(true);
    expect(colocated.filter((feature) => feature.properties.kind === "unit").length).toBeGreaterThan(0);
  });

  it("labels reported incidents with classification and exposes the hover address", async () => {
    const config = await loadConfig();
    let shift = startShift(config, { seed: "map-incident-label-test", scenarioId: "first_medical_call" });
    const incident = shift.incidents[0]!;
    shift = advanceSimulation(shift, incident.reportDueAt);
    shift = classifyIncident(shift, incident.id, "704", "B");

    const points = buildPointFeatures(shift, incident.id);
    const incidents = pointFeaturesByKind(points, "incident").features;
    const location = config.spawnLocations.find((candidate) => candidate.id === incident.locationId)!;

    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.properties).toMatchObject({
      kind: "incident",
      id: incident.id,
      label: "704-B",
      name: incident.displayName,
      address: location.address,
      active: true
    });
  });

  it("encodes unit status for map styling", () => {
    expect(unitMapStatus("available_at_station")).toBe("available");
    expect(unitMapStatus("available_mobile")).toBe("available");
    expect(unitMapStatus("dispatched")).toBe("active");
    expect(unitMapStatus("en_route")).toBe("active");
    expect(unitMapStatus("on_scene")).toBe("active");
    expect(unitMapStatus("held")).toBe("held");
    expect(unitMapStatus("out_of_service")).toBe("unavailable");
    expect(unitMapStatus("recovering")).toBe("unavailable");
  });
});
