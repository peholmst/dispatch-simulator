import { describe, expect, it } from "vitest";
import { loadConfig, resolveResourceCapabilities, validateConfig } from "./index.js";

describe("configuration loading and validation", () => {
  it("loads the Tampere vertical-slice config", async () => {
    const config = await loadConfig();

    expect(config.region.id).toBe("tampere");
    expect(config.incidents.map((incident) => incident.id).sort()).toEqual(["apartment_fire", "chest_pain"]);
    expect(config.resources).toHaveLength(8);
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
});
