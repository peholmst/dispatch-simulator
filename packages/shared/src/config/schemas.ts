import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
const capabilityMapSchema = z.record(idSchema, z.number().nonnegative());
const secondsRangeSchema = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
const localizationKeySchema = z.string().min(1);
const coordinateSchema = z.object({
  lat: z.number(),
  lon: z.number()
});

export const prioritySchema = z.object({
  id: z.string().regex(/^[A-Z]$/),
  localizationKey: localizationKeySchema,
  travelTimeMultiplier: z.number().positive()
});

export const capabilitySchema = z.object({
  id: idSchema,
  localizationKey: localizationKeySchema
});

export const dispatchCodeSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
  localizationKey: localizationKeySchema,
  validPriorities: z.array(z.string().regex(/^[A-Z]$/)).min(1)
});

export const resourceTypeSchema = z.object({
  id: idSchema,
  service: idSchema,
  capabilities: capabilityMapSchema,
  crew: z.object({
    min: z.number().int().nonnegative(),
    default: z.number().int().nonnegative(),
    max: z.number().int().nonnegative()
  }),
  turnout: z.object({
    delaySeconds: secondsRangeSchema,
    priorityModifiers: z.record(z.string().regex(/^[A-Z]$/), z.number().positive()).optional().default({})
  }),
  travel: z.object({
    timeMultiplier: z.number().positive()
  }).optional().default({ timeMultiplier: 1 }),
  recovery: z.object({
    afterIncidentSeconds: secondsRangeSchema
  })
});

const initialLocationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("standbyPoint"),
    id: idSchema
  }),
  z.object({
    type: z.literal("coordinates"),
    lat: z.number(),
    lon: z.number()
  })
]);

export const resourceSchema = z.object({
  id: idSchema,
  callSign: z.string().min(1),
  type: idSchema,
  stationId: idSchema,
  initialStatus: z.enum(["available_at_station", "available_mobile", "out_of_service"]).optional().default("available_at_station"),
  initialLocation: initialLocationSchema.optional(),
  overrides: z.object({
    capabilities: capabilityMapSchema.optional(),
    crew: z.object({
      min: z.number().int().nonnegative().optional(),
      default: z.number().int().nonnegative().optional(),
      max: z.number().int().nonnegative().optional()
    }).optional(),
    turnout: z.object({
      delaySeconds: secondsRangeSchema.optional(),
      priorityModifiers: z.record(z.string().regex(/^[A-Z]$/), z.number().positive()).optional()
    }).optional(),
    travel: z.object({
      timeMultiplier: z.number().positive().optional()
    }).optional(),
    recovery: z.object({
      afterIncidentSeconds: secondsRangeSchema.optional()
    }).optional()
  }).optional().default({})
});

export const stationSchema = z.object({
  id: idSchema,
  localizationKey: localizationKeySchema,
  address: z.string().min(1),
  coordinates: coordinateSchema
});

export const hospitalSchema = z.object({
  id: idSchema,
  localizationKey: localizationKeySchema,
  address: z.string().min(1),
  coordinates: coordinateSchema,
  handoffSeconds: secondsRangeSchema.optional()
});

export const regionSchema = z.object({
  id: idSchema,
  localizationKey: localizationKeySchema,
  bounds: z.object({
    north: z.number(),
    south: z.number(),
    east: z.number(),
    west: z.number()
  })
});

export const spawnLocationSchema = z.object({
  id: idSchema,
  locationType: idSchema,
  address: z.string().min(1),
  coordinates: coordinateSchema,
  regionTags: z.array(idSchema).optional().default([])
});

const capabilityBlockSchema = z.object({
  requires: capabilityMapSchema,
  desires: capabilityMapSchema.optional().default({})
});

export const responsePlanSchema = z.object({
  code: z.string().regex(/^[0-9]+$/),
  priority: z.string().regex(/^[A-Z]$/),
  requires: capabilityMapSchema,
  desires: capabilityMapSchema.optional().default({})
});

export const scoringProfileSchema = z.object({
  id: idSchema,
  incidentWeight: z.number().positive(),
  timeToControl: z.object({
    fullCreditSeconds: z.number().int().nonnegative(),
    zeroCreditSeconds: z.number().int().nonnegative()
  }),
  overDispatch: z.object({
    freeSurplusRatio: z.number().nonnegative(),
    zeroCreditSurplusRatio: z.number().nonnegative()
  }),
  emsTransport: z.object({
    fullCreditSeconds: z.number().int().nonnegative(),
    zeroCreditSeconds: z.number().int().nonnegative()
  }),
  dimensions: z.object({
    classification: z.number().nonnegative(),
    priority: z.number().nonnegative(),
    duplicateHandling: z.number().nonnegative().optional().default(0),
    dispatchAdequacy: z.number().nonnegative(),
    timeToControl: z.number().nonnegative(),
    escalationPrevention: z.number().nonnegative(),
    emsTransport: z.number().nonnegative(),
    overDispatch: z.number().nonnegative()
  })
});

export const difficultyPresetSchema = z.object({
  id: idSchema,
  localizationKey: localizationKeySchema,
  incidentCount: z.number().int().positive(),
  incidentSpacingSeconds: z.number().int().nonnegative(),
  descriptionKey: localizationKeySchema.optional()
});

const reportEntrySchema = z.object({
  key: localizationKeySchema,
  weight: z.number().positive().optional().default(1),
  delaySeconds: secondsRangeSchema.optional()
});

const emsTransportSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("none")
  }),
  z.object({
    mode: z.literal("possible"),
    probability: z.number().min(0).max(1),
    requiresCapability: idSchema,
    destinationType: z.literal("hospital"),
    handoffSeconds: secondsRangeSchema
  }),
  z.object({
    mode: z.literal("required"),
    requiresCapability: idSchema,
    destinationType: z.literal("hospital"),
    handoffSeconds: secondsRangeSchema
  })
]);

const commitmentSchema = z.object({
  afterControlSeconds: secondsRangeSchema
});

const stageSchema = z.object({
  id: idSchema,
  startsAt: z.number().int().nonnegative(),
  transition: z.object({
    probability: z.number().min(0).max(1)
  }).optional(),
  controlRequires: capabilityMapSchema,
  controlDesires: capabilityMapSchema.optional().default({}),
  containmentRequires: capabilityMapSchema,
  containmentDesires: capabilityMapSchema.optional().default({}),
  firstArrivalReportKey: localizationKeySchema,
  escalationReportKey: localizationKeySchema.optional(),
  commitment: commitmentSchema.optional(),
  emsTransport: emsTransportSchema.optional()
});

export const incidentProfileSchema = z.object({
  id: idSchema,
  schemaVersion: z.literal(1),
  localizationPrefix: localizationKeySchema,
  displayNameKey: localizationKeySchema,
  initialReportDelaySeconds: secondsRangeSchema,
  spawn: z.object({
    locationTypes: z.array(idSchema).min(1),
    regionTags: z.object({
      include: z.array(idSchema).optional().default([]),
      exclude: z.array(idSchema).optional().default([])
    }).optional(),
    timeWindows: z.array(z.object({
      start: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/),
      end: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/),
      weight: z.number().positive()
    })).optional(),
    weight: z.number().positive()
  }),
  reports: z.object({
    initial: z.array(reportEntrySchema).min(1),
    duplicate: z.array(reportEntrySchema).optional().default([])
  }),
  classification: z.object({
    acceptableCodes: z.array(z.string().regex(/^[0-9]+$/)).min(1),
    idealCodes: z.array(z.string().regex(/^[0-9]+$/)).min(1),
    acceptablePriorities: z.array(z.string().regex(/^[A-Z]$/)).min(1),
    idealPriorities: z.array(z.string().regex(/^[A-Z]$/)).min(1)
  }),
  stages: z.array(stageSchema).min(1),
  commitment: commitmentSchema,
  emsTransport: emsTransportSchema,
  scoring: z.object({
    outcomeProfile: idSchema
  })
});

export const trainingScenarioSchema = z.object({
  id: idSchema,
  localizationKey: localizationKeySchema,
  descriptionKey: localizationKeySchema.optional(),
  difficultyPreset: idSchema,
  seed: z.string().min(1),
  startTimeSeconds: z.number().int().nonnegative().optional().default(0),
  incidents: z.array(z.object({
    profileId: idSchema,
    locationId: idSchema.optional(),
    createdAt: z.number().int().nonnegative(),
    reportDelaySeconds: secondsRangeSchema.optional()
  })).min(1)
});

export const localeSchema = z.record(z.string().min(1), z.string());

export type Capability = z.infer<typeof capabilitySchema>;
export type DispatchCode = z.infer<typeof dispatchCodeSchema>;
export type DifficultyPreset = z.infer<typeof difficultyPresetSchema>;
export type Hospital = z.infer<typeof hospitalSchema>;
export type IncidentProfile = z.infer<typeof incidentProfileSchema>;
export type Locale = z.infer<typeof localeSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type Region = z.infer<typeof regionSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type ResourceType = z.infer<typeof resourceTypeSchema>;
export type ResponsePlan = z.infer<typeof responsePlanSchema>;
export type ScoringProfile = z.infer<typeof scoringProfileSchema>;
export type Station = z.infer<typeof stationSchema>;
export type SpawnLocation = z.infer<typeof spawnLocationSchema>;
export type TrainingScenario = z.infer<typeof trainingScenarioSchema>;

export type CapabilityMap = z.infer<typeof capabilityMapSchema>;

export const schemas = {
  capability: capabilitySchema,
  difficultyPreset: difficultyPresetSchema,
  dispatchCode: dispatchCodeSchema,
  hospital: hospitalSchema,
  incidentProfile: incidentProfileSchema,
  locale: localeSchema,
  priority: prioritySchema,
  region: regionSchema,
  resource: resourceSchema,
  resourceType: resourceTypeSchema,
  responsePlan: responsePlanSchema,
  scoringProfile: scoringProfileSchema,
  station: stationSchema,
  spawnLocation: spawnLocationSchema,
  trainingScenario: trainingScenarioSchema
};

export function resolveLocalizationKey(prefix: string, key: string): string {
  return key.startsWith(".") ? `${prefix}${key}` : key;
}

export function resolveResourceCapabilities(type: ResourceType, resource: Resource): CapabilityMap {
  return {
    ...type.capabilities,
    ...(resource.overrides.capabilities ?? {})
  };
}

export function resolveResourceCrew(type: ResourceType, resource: Resource): ResourceType["crew"] {
  return {
    ...type.crew,
    ...(resource.overrides.crew ?? {})
  };
}
