import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  capabilitySchema,
  dispatchCodeSchema,
  hospitalSchema,
  incidentProfileSchema,
  localeSchema,
  prioritySchema,
  regionSchema,
  resourceSchema,
  resourceTypeSchema,
  responsePlanSchema,
  scoringProfileSchema,
  stationSchema,
  spawnLocationSchema,
  type Capability,
  type DispatchCode,
  type Hospital,
  type IncidentProfile,
  type Locale,
  type Priority,
  type Region,
  type Resource,
  type ResourceType,
  type ResponsePlan,
  type ScoringProfile,
  type Station,
  type SpawnLocation
} from "./schemas.js";

export interface LoadedConfig {
  capabilities: Capability[];
  dispatchCodes: DispatchCode[];
  hospitals: Hospital[];
  incidents: IncidentProfile[];
  locale: Locale;
  priorities: Priority[];
  region: Region;
  resources: Resource[];
  resourceTypes: ResourceType[];
  responsePlans: ResponsePlan[];
  scoringProfiles: ScoringProfile[];
  stations: Station[];
  spawnLocations: SpawnLocation[];
}

async function readYamlFile(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8");
  return YAML.parse(text);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findConfigRoot(startDir: string): Promise<string> {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (await exists(path.join(currentDir, "config", "capabilities.yaml"))) {
      return currentDir;
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      throw new Error(`Could not find config root from ${startDir}`);
    }
    currentDir = parent;
  }
}

async function readYamlArray<T>(
  filePath: string,
  parseItem: (value: unknown) => T
): Promise<T[]> {
  const parsed = await readYamlFile(filePath);
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a YAML array`);
  }
  return parsed.map(parseItem);
}

async function readIncidentProfiles(configDir: string): Promise<IncidentProfile[]> {
  const incidentDir = path.join(configDir, "incidents");
  const files = (await readdir(incidentDir))
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const profile = incidentProfileSchema.parse(await readYamlFile(path.join(incidentDir, file)));
      const expectedId = path.basename(file, path.extname(file));
      if (profile.id !== expectedId) {
        throw new Error(`Incident profile ${file} has id ${profile.id}, expected ${expectedId}`);
      }
      return profile;
    })
  );
}

export async function loadConfig(rootDir = process.cwd(), regionId = "tampere", localeId = "en"): Promise<LoadedConfig> {
  const resolvedRootDir = await findConfigRoot(rootDir);
  const configDir = path.join(resolvedRootDir, "config");
  const regionDir = path.join(resolvedRootDir, "regions", regionId);
  const localePath = path.join(resolvedRootDir, "locales", `${localeId}.yaml`);

  const [
    capabilities,
    dispatchCodes,
    hospitals,
    incidents,
    locale,
    priorities,
    region,
    resources,
    resourceTypes,
    responsePlans,
    scoringProfiles,
    stations,
    spawnLocations
  ] = await Promise.all([
    readYamlArray(path.join(configDir, "capabilities.yaml"), (value) => capabilitySchema.parse(value)),
    readYamlArray(path.join(configDir, "dispatch_codes.yaml"), (value) => dispatchCodeSchema.parse(value)),
    readYamlArray(path.join(regionDir, "hospitals.yaml"), (value) => hospitalSchema.parse(value)),
    readIncidentProfiles(configDir),
    readYamlFile(localePath).then((value) => localeSchema.parse(value)),
    readYamlArray(path.join(configDir, "priorities.yaml"), (value) => prioritySchema.parse(value)),
    readYamlFile(path.join(regionDir, "region.yaml")).then((value) => regionSchema.parse(value)),
    readYamlArray(path.join(regionDir, "resources.yaml"), (value) => resourceSchema.parse(value)),
    readYamlArray(path.join(configDir, "resource_types.yaml"), (value) => resourceTypeSchema.parse(value)),
    readYamlArray(path.join(configDir, "response_plans.yaml"), (value) => responsePlanSchema.parse(value)),
    readYamlArray(path.join(configDir, "scoring_profiles.yaml"), (value) => scoringProfileSchema.parse(value)),
    readYamlArray(path.join(regionDir, "stations.yaml"), (value) => stationSchema.parse(value)),
    readYamlArray(path.join(regionDir, "spawn_locations.yaml"), (value) => spawnLocationSchema.parse(value))
  ]);

  return {
    capabilities,
    dispatchCodes,
    hospitals,
    incidents,
    locale,
    priorities,
    region,
    resources,
    resourceTypes,
    responsePlans,
    scoringProfiles,
    stations,
    spawnLocations
  };
}
