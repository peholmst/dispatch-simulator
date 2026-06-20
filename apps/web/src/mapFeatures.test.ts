import { describe, expect, it } from "vitest";
import { loadConfig, startShift } from "@dispatch-simulator/shared";
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

  it("encodes unit status for map styling", () => {
    expect(unitMapStatus("available_at_station")).toBe("available");
    expect(unitMapStatus("available_mobile")).toBe("available");
    expect(unitMapStatus("en_route")).toBe("active");
    expect(unitMapStatus("on_scene")).toBe("active");
    expect(unitMapStatus("held")).toBe("held");
    expect(unitMapStatus("out_of_service")).toBe("unavailable");
    expect(unitMapStatus("recovering")).toBe("unavailable");
  });
});
