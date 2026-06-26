# Data and Configuration

## Configuration Strategy

The first version uses human-editable YAML files with schema validation. The design should allow YAML to be replaced by a database later.

Game logic should depend on a data-access layer rather than reading YAML directly throughout the codebase.

Use shared Zod schemas for runtime validation and TypeScript inference. YAML parsing should happen before validation.

YAML field names should use `camelCase` to match TypeScript and Zod types directly. Stable IDs, capability IDs, status IDs, incident IDs, location type IDs, and localization key segments should use lower `snake_case` where they are content identifiers.

## Localization Strategy

Configuration files use stable IDs and localization keys rather than hard-coded user-facing display text.

English translation files provide the first UI text, labels, descriptions, report templates, and debrief text. Additional languages can be added later.

## Suggested File Groups

```text
config/capabilities.yaml
config/dispatch_codes.yaml
config/priorities.yaml
config/resource_types.yaml
config/response_plans.yaml
config/scoring_profiles.yaml
config/difficulty_presets.yaml
config/incidents/*.yaml
config/training_scenarios/*.yaml
locales/en.yaml
regions/tampere/region.yaml
regions/tampere/stations.yaml
regions/tampere/resources.yaml
regions/tampere/hospitals.yaml
regions/tampere/spawn_locations.yaml
regions/tampere/venues.yaml
```

## Capabilities

Capability vocabulary is configurable. Resources contribute numeric capability values, and incident stages require numeric counts.

Capability examples:

- `fire_suppression`
- `rescue`
- `ems_basic`
- `ems_advanced`
- `command`
- `ladder`
- `hazmat`
- `water_rescue`
- `police_support`

Capability modeling should prefer shared base capabilities plus additional advanced capabilities over fallback substitution. For example, all ambulances should provide `ems`, while advanced life support ambulances also provide `ems_advanced`. This allows an ALS ambulance to satisfy ordinary EMS requirements when it is the closest suitable unit.

Incident profiles distinguish required capabilities from desired capabilities. Required capabilities determine whether an incident can be controlled, contained, treated, transported, or cleared. Desired capabilities are used for scoring quality. If an incident has no desired capabilities, desired capability coverage is treated as equal to required capability coverage.

## Dispatch Codes

Dispatch codes shown to the player should be real Finnish-style codes where possible, such as:

- `103`: automatic fire alarm.
- `401`: small building fire.
- `402`: medium building fire.

Codes and descriptions are configurable by an admin. The visible text comes from localization keys.

## Priorities

Priority codes are configurable, with Finnish-style A/B/C/D defaults. Priority affects scoring expectations, queue urgency, response-plan selection, and response mode/travel modifiers.

## Difficulty Presets

Difficulty presets define replay shape defaults that scenario authors and future random-shift setup can reuse:

```yaml
- id: standard
  localizationKey: difficulty.standard.name
  descriptionKey: difficulty.standard.description
  incidentCount: 2
  incidentSpacingSeconds: 600
```

The active simulation currently uses scenario incident scripts directly when a scenario is selected. Presets still provide stable content vocabulary for tutorial, standard, and busy training material.

## Response Plans

Response plans map selected incident code and priority to required capability counts or resource selection rules. Assisted dispatch suggestions are generated from these plans and available unit status.

Suggestions are based on player classification, not hidden truth.
Incident profiles may define which classifications are ideal or acceptable for scoring, but they do not directly drive assisted dispatch suggestions during active play.

Every valid dispatch code and priority combination should have a response-plan capability requirement. Assisted dispatch selects specific available resources whose combined capabilities satisfy that requirement.

Only valid code-priority combinations should have response plans. The UI and backend should prevent dispatching invalid code-priority combinations.

Dispatch codes should declare their valid priorities. When the player selects a dispatch code, the priority selector should show only priorities valid for that code. This prevents dead priority options while still allowing the global priority catalog to contain priorities that some codes do not use.

Response-plan requirements are capability-only as a long-term invariant. They should not require specific resource types; resource type is an implementation/content convenience, while dispatch requirements care about effective capabilities.

Response plans may distinguish `requires` and `desires`, using the same required-versus-desired capability pattern as incident profiles. `requires` defines the minimum acceptable response. `desires` defines capabilities the assistant should prefer and scoring can reward, but lack of desired capabilities should not prevent a partial or minimum-viable suggestion.

When response plans include desired capabilities, assisted dispatch satisfies `requires` first, then greedily adds closest useful units for `desires` from the remaining available candidates. Missing required coverage appears in `shortage`; missing desired coverage appears in `desiredShortage`.

For v1, assisted dispatch should rank candidate resources by beeline distance from their current location to the incident location, not by routed travel time. Bridges, waterways, road access, and realistic routing constraints are intentionally ignored by the suggestion algorithm, even though routed travel still matters for actual unit movement.

For beeline distance, `available_at_station` units use their station coordinates and `available_mobile` units use their current coordinates.

V1 assisted dispatch uses a greedy closest-useful-unit algorithm: repeatedly select the closest available unit that contributes at least one still-needed capability, subtract its capability contribution from the remaining requirement, and stop when all requirements are satisfied or no useful candidates remain. A unit is useful if it contributes a positive value to at least one capability whose remaining requirement is greater than `0`; overfilling other capabilities is allowed.

When subtracting selected unit capabilities from remaining requirements, clamp each remaining value at `0`. Raw overfill is still reported through `coverage.provided`.

When useful candidates have equal beeline distance, tie-break in this order:

1. Higher contribution to remaining requirements.
2. Lower overfill.
3. Lexicographic `callSign`.
4. Lexicographic stable `id`.

If available units cannot fully satisfy the response-plan requirements, assisted dispatch should return the best partial suggestion plus an explicit shortage map showing unmet capabilities.

V1 assisted dispatch only considers units with `available_at_station` or `available_mobile` status. Units that are `assigned`, `en_route`, `on_scene`, `committed_on_scene`, or `out_of_service` are not suggestion candidates.

V1 assisted dispatch does not recommend reassigning units from other active incidents. Reassignment remains a manual dispatcher decision for future design.

V1 assisted dispatch ignores station coverage preservation. It simply selects the closest useful available units by beeline distance and leaves coverage tradeoffs to the player.

Suggestion output should include enough data to explain the recommendation:

```yaml
suggestedUnits:
  - unitId: tampere_rpi101
    callSign: RPI101
    distanceMeters: 1800
    contributes:
      fire_suppression: 10
      rescue: 2
coverage:
  fire_suppression:
    required: 20
    provided: 20
  rescue:
    required: 4
    provided: 4
shortage: {}
```

`coverage.provided` should show raw provided capability totals even when they exceed requirements. Over-dispatch is visible by comparing `provided` to `required`.

Dispatch suggestion algorithm:

1. Read the player-selected dispatch code and priority.
2. Load that code-priority response-plan capability requirement.
3. Build candidates from units in `available_at_station` and `available_mobile` status.
4. Resolve each candidate's effective capabilities from its resource type plus instance overrides.
5. Compute beeline distance from candidate to incident. Station-available units use station coordinates; mobile units use current coordinates.
6. Repeatedly choose the closest useful unit, applying deterministic tie-breakers.
7. Subtract selected unit capabilities from remaining requirements and clamp remaining values at `0`.
8. Stop when all requirements are satisfied or no useful candidates remain.
9. Return selected units, raw coverage, and shortage.
10. Never use hidden incident truth, station coverage optimization, routing ETA, or resource type requirements.

## Region Packs

Region packs define:

- Region metadata and boundaries.
- Stations.
- Hospitals.
- Resources.
- Spawn zones or candidate incident points.
- Optional named public venues.
- Optional standby or staging points.
- Map tile configuration if region-specific.
- Routing extract/reference if region-specific.

The first region is Tampere. Future regions should be addable without changing simulation logic.

## Stations

Stations should include at least stable ID, localization key/name, address, and coordinates.

## Resources

Resources should include at least stable ID, call sign, station, capabilities, crew size if used, turnout delay rules or modifiers, travel speed modifiers if used, autonomous status behavior if overridden, and recovery rules if overridden.

Resources should be modeled with reusable resource types plus individual region resource instances. Resource types define shared defaults such as capabilities, crew, turnout behavior, travel modifiers, status automation, and recovery rules. Individual resources define concrete call signs, station assignment, and optional per-unit overrides.

Example:

```yaml
# config/resource_types.yaml
- id: pumper
  service: fire_rescue
  capabilities:
    fire_suppression: 10
    rescue: 2
  crew:
    min: 3
    default: 4
    max: 5
  turnout:
    delaySeconds: [45, 120]
    priorityModifiers:
      A: 0.7
      B: 0.85
      C: 1
      D: 1.2
  travel:
    timeMultiplier: 1.1
  recovery:
    afterIncidentSeconds: [300, 900]

# regions/tampere/resources.yaml
- id: tampere_rpi101
  callSign: RPI101
  type: pumper
  stationId: central_station
  initialStatus: available_at_station
  overrides:
    capabilities:
      rescue: 3
    crew:
      default: 3
      max: 4
```

`overrides.capabilities` replaces individual capability values from the resource type. It does not replace the full capability map and does not add deltas. In the example above, `rescue` resolves to `3` while inherited `fire_suppression: 10` remains unchanged.

Setting a capability override to `0` neutralizes or removes that inherited capability for the unit.

Crew should use `min`, `default`, and `max`:

```yaml
crew:
  min: 3
  default: 4
  max: 5
```

V1 resolves unit capability values directly from type defaults plus per-unit overrides. Future versions may scale effective capability by actual crew count, but crew does not modify capability values in the first version.

`overrides.crew` may override individual `min`, `default`, or `max` fields from the resource type. Unspecified crew fields are inherited.

Turnout delay should be represented as a deterministic random range in seconds plus optional priority modifiers:

```yaml
turnout:
  delaySeconds: [45, 120]
  priorityModifiers:
    A: 0.7
    B: 0.85
    C: 1
    D: 1.2
```

The simulation draws from `delaySeconds` and multiplies by the selected priority modifier. Turnout defaults live on resource types and may be overridden per unit.

Priority travel modifiers live in priority config. Resource types may define an optional `travel.timeMultiplier` for vehicle-specific differences. Resolved travel time is:

```text
routeTime * priority.travelTimeMultiplier * resource.travel.timeMultiplier
```

Individual resources may define `initialStatus`; if omitted, it defaults to `available_at_station`.

Initial location validation depends on `initialStatus`:

- `available_at_station` can use `stationId` as the starting location.
- `available_mobile` requires `initialLocation`, either a standby point reference or explicit coordinates.
- `out_of_service` may optionally use `stationId` or explicit `initialLocation`.

Example:

```yaml
initialStatus: available_mobile
initialLocation:
  type: standbyPoint
  id: hervanta_standby
```

Every individual resource requires `stationId` in v1. The station remains the unit's home base even if `initialStatus` and `initialLocation` place it elsewhere at shift start.

Future versions may add `statusAutomation` for autonomous behavior such as units going mobile, becoming temporarily unavailable, or returning to station without direct player action. V1 should reserve the concept but avoid using it in the active simulation contract.

Resource types should include simple recovery behavior for v1:

```yaml
recovery:
  afterIncidentSeconds: [300, 900]
```

After incident commitment clears, the simulation applies recovery before the unit becomes fully available. Individual resources may override recovery values.

Resource types are global config under `config/resource_types.yaml`. Individual resource instances are region-specific, such as `regions/tampere/resources.yaml`.

`service` is defined only on the resource type, not on individual resource instances. If a unit needs a different service, it should use a different resource type.

Individual resources require `callSign`, and call signs are the only active-play unit labels. Resource display names are not needed for the Finnish-inspired model. Stable `id` should still remain separate from operational `callSign` for references, migrations, and content tooling. Core validation only requires call signs to be unique within loaded config; format remains free because different authorities use different call sign structures.

## Hospitals

Hospitals are required for EMS transport profiles. They should include at least stable ID, localization key/name, address, coordinates, and optional handoff duration rules.

## Incident Profiles

Incident profiles are hidden simulation categories. They are not shown directly to the dispatcher.

They should include stable ID, localization keys, spawn filters, report template keys, duplicate report rules, stages, `controlRequires`, `containmentRequires`, escalation timing/probabilities, windshield report keys, escalation report keys, commitment duration rules, and EMS transport rules if applicable.

Incident profiles are declarative scenario data. They describe possible truth, report text keys, spawn constraints, stage requirements, and outcome parameters. They should not contain scripted behavior or embedded procedural logic; the simulation engine owns timing, state transitions, random draws, and resolution.

Incident profiles should be stored one profile per YAML file under `config/incidents/*.yaml`. This keeps profile diffs small, makes content expansion easier, and avoids one large conflict-prone incident catalog file.

Each incident profile file must include an explicit `id`. The validation command should require the `id` to match the YAML filename stem, such as `config/incidents/apartment_fire.yaml` containing `id: apartment_fire`.

Starting v1 shape:

```yaml
id: apartment_fire
schemaVersion: 1
localizationPrefix: incident.apartment_fire
displayNameKey: .name
initialReportDelaySeconds: [0, 180]

spawn:
  locationTypes:
    - residential_building
  weight: 10

reports:
  initial:
    - key: .reports.initial.smoke_in_stairwell
      weight: 3
  duplicate:
    - key: .reports.duplicate.flames_visible
      delaySeconds: [120, 360]
      weight: 2

classification:
  acceptableCodes:
    - "401"
    - "402"
  idealCodes:
    - "401"
  acceptablePriorities:
    - A
    - B
  idealPriorities:
    - B

stages:
  - id: smoke_showing
    startsAt: 0
    controlRequires:
      fire_suppression: 10
      rescue: 2
    controlDesires:
      command: 1
    containmentRequires:
      fire_suppression: 5
    containmentDesires: {}
    firstArrivalReportKey: .reports.windshield.smoke_showing
    commitment:
      afterControlSeconds: [300, 600]
  - id: room_fire
    startsAt: 300
    transition:
      probability: 0.7
    controlRequires:
      fire_suppression: 20
      rescue: 4
    controlDesires:
      command: 1
    containmentRequires:
      fire_suppression: 10
    containmentDesires: {}
    firstArrivalReportKey: .reports.windshield.room_fire
    escalationReportKey: .reports.escalated.room_fire
    emsTransport:
      mode: possible
      probability: 0.2
      requiresCapability: ems_basic
      destinationType: hospital
      handoffSeconds: [600, 1200]

commitment:
  afterControlSeconds: [600, 1200]

emsTransport:
  mode: none

scoring:
  outcomeProfile: building_fire
```

Stage-specific `controlRequires` and `containmentRequires` are required because capability needs change as an incident develops.
Stage `startsAt` values are relative to hidden incident spawn time, not initial report delivery. `initialReportDelaySeconds` controls how long after hidden spawn the first report reaches the player.
Stage progression is deterministic by default. A stage may define `transition.probability`; if omitted, it defaults to `1`. At the stage's `startsAt` threshold, the simulation evaluates the transition only if the incident has not been controlled or contained. In v1, containment permanently prevents further stage progression, but the incident is not resolved until control requirements are met.

Validation should require each stage's `containmentRequires` to be a subset of `controlRequires`, with each containment capability value less than or equal to its control value. This keeps containment easier than full control in v1.

In capability requirement maps, omitted capabilities mean `0` or not required. Validators should still reject unknown capability IDs and should compare containment against control by treating missing control values as `0`.

Every stage must define both `controlRequires` and `containmentRequires`. Use an empty map, such as `containmentRequires: {}`, when a stage has no containment path. Stages may also define `controlDesires` and `containmentDesires` for scoring quality. Desired capabilities do not block clearing or containment. If a desired map is omitted or empty, scoring treats desired coverage as equal to required coverage.

Every stage must define `firstArrivalReportKey` so the first arriving unit can provide an observable update for the current stage. `escalationReportKey` is optional and is used when units are already on scene as the incident escalates.

`commitment.afterControlSeconds` defines the default post-control commitment duration for the incident. Stages may override it with `stages[].commitment.afterControlSeconds` when earlier or later stages should clear faster or slower.

`emsTransport` defines the incident-level default transport behavior. Stages may override it with `stages[].emsTransport`. Supported modes are `none`, `possible`, and `required`.

EMS transport validation is mode-specific:

- `mode: none` requires no other fields.
- `mode: possible` requires `probability`, `requiresCapability`, `destinationType`, and `handoffSeconds`.
- `mode: required` requires `requiresCapability`, `destinationType`, and `handoffSeconds`; probability is implicitly `1`.

Incident profiles should define classification scoring ranges. `classification.idealCodes` and `classification.idealPriorities` represent full-credit choices. `classification.acceptableCodes` and `classification.acceptablePriorities` represent defensible choices for partial credit or no hard penalty.

Incident profiles should not include response-plan requirements in v1. Response planning lives in separate response-plan config keyed by the player's selected dispatch code and priority.

Incident profile scoring should reference a named `scoring.outcomeProfile`. Detailed scoring formulas and weights live in scoring configuration, not inline inside incident profiles.

Concrete example:

```yaml
id: apartment_fire
schemaVersion: 1
localizationPrefix: incident.apartment_fire
displayNameKey: .name
initialReportDelaySeconds: [0, 180]

spawn:
  locationTypes:
    - residential_building
  weight: 10

reports:
  initial:
    - key: .reports.initial.smoke_in_stairwell
      weight: 3
    - key: .reports.initial.alarm_and_smoke
      weight: 1
  duplicate:
    - key: .reports.duplicate.flames_visible
      delaySeconds: [120, 360]
      weight: 2

classification:
  acceptableCodes:
    - "401"
    - "402"
  idealCodes:
    - "401"
  acceptablePriorities:
    - A
    - B
  idealPriorities:
    - B

stages:
  - id: smoke_showing
    startsAt: 0
    controlRequires:
      fire_suppression: 10
      rescue: 2
    containmentRequires:
      fire_suppression: 5
    firstArrivalReportKey: .reports.windshield.smoke_showing
    commitment:
      afterControlSeconds: [300, 600]

  - id: room_fire
    startsAt: 300
    transition:
      probability: 0.7
    controlRequires:
      fire_suppression: 20
      rescue: 4
    containmentRequires:
      fire_suppression: 10
    firstArrivalReportKey: .reports.windshield.room_fire
    escalationReportKey: .reports.escalated.room_fire
    emsTransport:
      mode: possible
      probability: 0.2
      requiresCapability: ems_basic
      destinationType: hospital
      handoffSeconds: [600, 1200]

commitment:
  afterControlSeconds: [600, 1200]

emsTransport:
  mode: none

scoring:
  outcomeProfile: building_fire
```

The `spawn` block should require only `locationTypes` and `weight` in v1. `locationTypes` controls which region spawn candidates are valid for the profile, and `weight` controls relative spawn frequency. Optional `regionTags.include`, `regionTags.exclude`, and `timeWindows` may be added for richer region and time-of-day tuning without changing the basic authoring model:

```yaml
spawn:
  locationTypes:
    - residential_building
  regionTags:
    include:
      - urban
    exclude:
      - island
  timeWindows:
    - start: "00:00"
      end: "23:59"
      weight: 1
  weight: 10
```

Report entries should always be objects rather than string shorthand. This keeps weighting, duplicate timing, validation, and future editor support consistent:

```yaml
reports:
  initial:
    - key: .reports.initial.smoke_in_stairwell
      weight: 3
  duplicate:
    - key: .reports.duplicate.flames_visible
      delaySeconds: [120, 360]
      weight: 2
```

Duplicate report `delaySeconds` values are relative to the initial report being delivered to the player, not relative to hidden incident spawn time.

## Training Scenarios

Training scenarios are deterministic scripted starts stored one scenario per YAML file under `config/training_scenarios/*.yaml`. They make content teachable and replayable without changing incident profile rules.

```yaml
id: smoke_then_fire
localizationKey: training.smoke_then_fire.name
descriptionKey: training.smoke_then_fire.description
difficultyPreset: standard
seed: training-smoke-fire
startTimeSeconds: 0
incidents:
  - profileId: automatic_alarm
    locationId: koskipuisto_office
    createdAt: 0
    reportDelaySeconds: [0, 0]
  - profileId: apartment_fire
    locationId: kaleva_apartment_1
    createdAt: 360
    reportDelaySeconds: [30, 30]
```

`createdAt` and `startTimeSeconds` are simulation seconds. `reportDelaySeconds` overrides the incident profile's initial report delay for that scripted occurrence. `locationId` is optional; when omitted, the scenario still uses the profile's spawn filters and deterministic seed.

## Spawn Locations

Incident profiles declare allowed location types such as:

- `residential_building`
- `commercial_building`
- `industrial_area`
- `road`
- `highway`
- `water`
- `forest`
- `public_venue`
- `rail`

Region data should include hand-authored spawn zones and/or OSM-derived candidate points.

Spawn locations should include a stable ID, location type, dispatcher-visible street address, coordinates, and optional region tags. The active UI uses the address when dispatchers manually choose units for an incident.

## Validation

Provide an automated config/content validation command.

Validation should check schema correctness, missing localization keys, broken references, duplicate IDs, unknown capabilities, response plans referencing unknown codes or priorities, units referencing missing stations, EMS profiles without hospitals, missing report templates, incident profiles that cannot be controlled with available regional resources, response plans that cannot be fulfilled with dispatchable regional resources, and spawn filters with no valid locations.

Validation should also enforce playability invariants discovered by the vertical slice:

- Numeric ranges such as turnout, recovery, report delay, commitment, and EMS handoff durations must be ordered as `[min, max]`.
- Region bounds must be ordered, and stations, hospitals, spawn locations, and explicit mobile resource coordinates must be inside those bounds.
- Resource type and resource override priority modifiers must reference known priorities.
- Incident ideal classifications must also be acceptable classifications.
- Incident acceptable and ideal code-priority choices must include at least one valid configured dispatch code and priority pair.
- Incident spawn filters must leave at least one concrete spawn location after applying location type and region tag filters.
- Incident stages must start with a stage at `0`, then progress in increasing `startsAt` order.
- Later stages need transition probabilities and escalation report keys so the simulation can make escalation visible.
- Training scenarios must reference known difficulty presets, incident profiles, and spawn locations.
- Training scenario report delay ranges must be ordered, scripted incidents must be in increasing `createdAt` order, and pinned spawn locations must match the incident profile's spawn filters.

Incident profiles that cannot be controlled with available regional resources should be warnings by default and errors in strict/test validation mode. This preserves future room for overwhelming disaster content while keeping v1 and automated test configs playable.

Response plans that cannot be fulfilled with dispatchable regional resources should follow the same warning-by-default, error-in-strict behavior.

There is no admin/editor UI in v1. The schema should still be clean enough to support one later.
