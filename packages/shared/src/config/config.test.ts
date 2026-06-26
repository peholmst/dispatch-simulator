import { describe, expect, it } from "vitest";
import { loadConfig, resolveResourceCapabilities, validateConfig, type LoadedConfig } from "./index.js";

function cloneConfig(config: LoadedConfig): LoadedConfig {
  return structuredClone(config) as LoadedConfig;
}

describe("configuration loading and validation", () => {
  it("loads the Tampere vertical-slice config", async () => {
    const config = await loadConfig();

    expect(config.region.id).toBe("tampere");
    expect(config.incidents.map((incident) => incident.id).sort()).toEqual([
      "apartment_fire",
      "automatic_alarm",
      "chest_pain",
      "fall_injury"
    ]);
    expect(config.difficultyPresets.map((preset) => preset.id).sort()).toEqual(["busy", "standard", "tutorial"]);
    expect(config.trainingScenarios.map((scenario) => scenario.id).sort()).toEqual([
      "busy_evening",
      "first_medical_call",
      "smoke_then_fire"
    ]);
    expect(config.spawnLocations.every((location) => location.address.length > 0)).toBe(true);
    expect(config.resources).toHaveLength(10);
    expect(config.responsePlans).toHaveLength(9);
  });

  it("validates the vertical-slice config in strict mode", async () => {
    const config = await loadConfig();
    const result = validateConfig(config, { strict: true });

    expect(result.issues).toEqual([]);
  });

  it("resolves resource capabilities from type and per-unit overrides", async () => {
    const config = await loadConfig();
    const pumperType = config.resourceTypes.find((type) => type.id === "pumper");
    const pumper = config.resources.find((resource) => resource.callSign === "RPI101");

    expect(pumperType).toBeDefined();
    expect(pumper).toBeDefined();
    expect(resolveResourceCapabilities(pumperType!, pumper!)).toEqual({
      fire_suppression: 10,
      smoke_divers: 3,
      first_response: 1
    });
  });

  it("reports ordered range and coordinate playability issues", async () => {
    const config = cloneConfig(await loadConfig());
    config.resourceTypes[0]!.turnout.delaySeconds = [30, 10];
    config.spawnLocations[0]!.coordinates = {
      lat: config.region.bounds.north + 1,
      lon: config.region.bounds.east + 1
    };

    const result = validateConfig(config, { strict: true });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "error",
        message: `Resource type ${config.resourceTypes[0]!.id} turnout.delaySeconds range start must be <= end`
      }),
      expect.objectContaining({
        severity: "error",
        message: `Spawn location ${config.spawnLocations[0]!.id} coordinates must be inside region bounds`
      })
    ]));
  });

  it("reports incident classification and stage ordering playability issues", async () => {
    const config = cloneConfig(await loadConfig());
    const incident = config.incidents.find((candidate) => candidate.id === "apartment_fire")!;
    incident.classification.idealCodes = ["704"];
    incident.stages[0]!.startsAt = 30;
    incident.stages[1]!.startsAt = 20;
    incident.stages[1]!.transition = undefined;
    incident.stages[1]!.escalationReportKey = undefined;

    const result = validateConfig(config, { strict: true });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "error",
        message: "Incident apartment_fire ideal dispatch code 704 must also be acceptable"
      }),
      expect.objectContaining({
        severity: "error",
        message: "Incident apartment_fire first stage must start at 0"
      }),
      expect.objectContaining({
        severity: "error",
        message: "Incident apartment_fire stage room_fire starts before previous stage"
      }),
      expect.objectContaining({
        severity: "warning",
        message: "Incident apartment_fire stage room_fire has no transition probability and is unreachable from the simulation core"
      }),
      expect.objectContaining({
        severity: "error",
        message: "Incident apartment_fire stage room_fire starts after 0 and requires escalationReportKey"
      })
    ]));
  });

  it("reports response plans that cannot be fulfilled by dispatchable resources", async () => {
    const config = cloneConfig(await loadConfig());
    config.resources = config.resources.map((resource) => (
      resource.callSign === "RPI31" ? { ...resource, initialStatus: "out_of_service" as const } : resource
    ));

    const result = validateConfig(config, { strict: true });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "error",
        message: "Response plan 402-B cannot be fulfilled with dispatchable regional resources"
      })
    ]));
  });

  it("reports training scenario playability issues", async () => {
    const config = cloneConfig(await loadConfig());
    const scenario = config.trainingScenarios.find((candidate) => candidate.id === "smoke_then_fire")!;
    scenario.difficultyPreset = "unknown";
    scenario.incidents[0]!.profileId = "missing_profile";
    scenario.incidents[0]!.locationId = "hervanta_apartment_1";
    scenario.incidents[0]!.createdAt = 60;
    scenario.incidents[0]!.reportDelaySeconds = [60, 10];
    scenario.incidents[1]!.createdAt = 10;

    const result = validateConfig(config, { strict: true });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "error",
        message: "Training scenario smoke_then_fire references unknown difficulty preset unknown"
      }),
      expect.objectContaining({
        severity: "error",
        message: "Training scenario smoke_then_fire incident 1 references unknown incident profile missing_profile"
      }),
      expect.objectContaining({
        severity: "error",
        message: "Training scenario smoke_then_fire incident 1 reportDelaySeconds range start must be <= end"
      }),
      expect.objectContaining({
        severity: "error",
        message: "Training scenario smoke_then_fire incident 2 starts before previous scenario incident"
      })
    ]));
  });
});
