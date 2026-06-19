import { describe, expect, it } from "vitest";
import { loadConfig } from "../config/index.js";
import { suggestDispatch } from "./suggest.js";

const kalevaIncident = {
  lat: 61.5008,
  lon: 23.7998
};

describe("assisted dispatch suggestions", () => {
  it("selects a medium structural fire response from available units", async () => {
    const config = await loadConfig();
    const suggestion = suggestDispatch(config, {
      code: "402",
      priority: "B",
      incidentLocation: kalevaIncident
    });

    expect(suggestion.shortage).toEqual({
      command: 0,
      fire_suppression: 0,
      smoke_divers: 0,
      aerial: 0,
      water_supply: 0
    });
    expect(suggestion.suggestedUnits.map((unit) => unit.callSign)).toEqual([
      "RPI101",
      "RPI103",
      "RPI106",
      "RPI111",
      "RPI31"
    ]);
    expect(suggestion.coverage.fire_suppression).toEqual({ required: 30, provided: 35 });
  });

  it("satisfies desired ALS after required EMS and first response for 704-A", async () => {
    const config = await loadConfig();
    const suggestion = suggestDispatch(config, {
      code: "704",
      priority: "A",
      incidentLocation: kalevaIncident
    });

    expect(suggestion.shortage).toEqual({
      ems: 0,
      first_response: 0
    });
    expect(suggestion.desiredShortage).toEqual({
      ems_advanced: 0
    });
    expect(suggestion.suggestedUnits.some((unit) => unit.callSign === "EPI121")).toBe(true);
  });

  it("returns a desired shortage when ALS is unavailable", async () => {
    const config = await loadConfig();
    const als = config.resources.find((resource) => resource.callSign === "EPI121");
    expect(als).toBeDefined();

    const suggestion = suggestDispatch(config, {
      code: "704",
      priority: "A",
      incidentLocation: kalevaIncident,
      unitStates: {
        [als!.id]: {
          status: "out_of_service"
        }
      }
    });

    expect(suggestion.shortage).toEqual({
      ems: 0,
      first_response: 0
    });
    expect(suggestion.desiredShortage).toEqual({
      ems_advanced: 1
    });
    expect(suggestion.suggestedUnits.some((unit) => unit.callSign === "EPI131")).toBe(true);
  });
});
