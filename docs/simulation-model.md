# Simulation Model

## Hidden Truth

Each generated incident has hidden ground truth:

- Hidden incident profile.
- Current stage/severity.
- Required capabilities for control.
- Required capabilities for containment.
- Escalation rules.
- Commitment and recovery behavior.
- Whether EMS transport is required.

The hidden profile is not shown to the dispatcher during active play.

## Incident Reports

The dispatcher receives report text generated from templates attached to hidden incident profiles. Reports are intentionally incomplete and can be ambiguous.

Multiple reports can belong to the same hidden incident. The simulation knows the truth, but the player may need to link or split reports in the UI. Correct duplicate recognition can be scored.

In the current deterministic core, each generated incident schedules one initial report and zero or more duplicate reports from the incident profile. Initial report delivery is based on `initialReportDelaySeconds`; duplicate report delivery is based on each duplicate report's delay after the initial report.

## Player Classification

The player-selected incident code and priority affect scoring, queue urgency, response-plan selection, and travel behavior. They do not change hidden incident truth.

## Incident Profiles

Incident profiles are configurable. They define:

- Spawn location filters.
- Initial report template keys.
- Possible duplicate report template keys.
- Escalation stages.
- Control requirements per stage.
- Containment requirements per stage.
- Stage timing and probability gates.
- First-arrival windshield report keys per stage.
- Escalation/stage-transition report keys.
- Commitment duration rules.
- EMS transport needs if applicable.

## Escalation

Escalation uses configurable stages with timers and probability gates.

Escalation can increase control requirements, increase containment requirements, worsen score, generate new reports, extend on-scene commitment time, or change EMS transport needs.

If no unit is on scene when an escalation happens, the player does not automatically receive an escalation report. The first arriving unit gives the windshield report for the current stage. If units are already on scene when escalation happens, on-scene units can send the configured escalation report.

## Control and Containment

Each stage defines both `controlRequires` and `containmentRequires`.

Full control requires meeting the current stage's `controlRequires` capability counts. Once controlled, units remain committed for a configurable duration before clearing.

Containment requires meeting the current stage's `containmentRequires` capability counts. Containment prevents escalation to the next stage but does not resolve the incident. This models exposure protection and other cases where preventing spread is easier than fully attacking the original problem.

## Capabilities

Capabilities are counted numeric contributions, not just boolean flags.

Examples:

- Dry chemical unit: `fire_suppression: 1`
- Light attack vehicle: `fire_suppression: 5`
- Full pumper: `fire_suppression: 10`

Incident stages can use these values to model early intervention. For example, a fire may require `fire_suppression: 1` during the first minutes, then grow to 10, 20, 30, or more as time passes.

## Units

Initial unit statuses:

- `available_at_station`
- `available_mobile`
- `assigned`
- `en_route`
- `on_scene`
- `committed_on_scene`
- `out_of_service`

There is no separate `returning` status in v1. A unit returning from a call is either `available_mobile` if it can be dispatched while moving, or `out_of_service` if it cannot be dispatched until recovery/restock completes.

`available_mobile` always means the unit is dispatchable. The unit's current map location communicates that it is not at station.

A unit can be assigned to at most one active incident at a time. This is a long-term domain invariant, not only a v1 simplification. If a higher-priority assignment takes a unit from an existing incident, the unit is removed from the previous assignment and added to the new one; units are never split across incidents.

Future versions may let the player order available units to temporarily relocate to another station or standby point to patch coverage, then order them back to their home station when no longer needed. This is a player-directed coverage-management feature, not part of v1 assisted dispatch optimization.

Units may have different capabilities, crew size, turnout delay, travel behavior, autonomous status-change probabilities, and post-incident recovery duration.

Units may change status autonomously. They may go mobile on their own, temporarily go out of service, or take variable time to respond after dispatch.

Current implemented unit lifecycle:

1. Dispatchable units start as `available_at_station` or `available_mobile`.
2. Dispatched units become `en_route`.
3. On arrival, units become `on_scene` and the first arrival emits a windshield report.
4. Once the incident is controlled, on-scene units become `committed_on_scene` until the deterministic commitment clear time.
5. Units that arrive after control join the same commitment window instead of remaining stuck on scene.
6. When the commitment window clears, units become `available_mobile`.

## Unit Movement

The current core uses mocked straight-line travel times. It computes beeline distance from the unit's current location to the incident, applies a fixed average response speed, then applies priority and resource travel multipliers plus deterministic turnout delay.

Future map/routing work will replace this with actual roads using routing output. The authoritative backend should then publish location updates at a configurable cadence, defaulting to roughly 10-15 simulated seconds. The frontend may animate smoothly between reported positions, but interpolation is a presentation layer choice and not part of the simulation truth.

Priority affects response mode through configurable travel modifiers. The model stays abstract and tunable rather than simulating emergency driving law in detail.

Travel times use deterministic base route times plus configurable modifiers. No real-time traffic dependency is required for v1.

## EMS Transport

Some EMS incidents require an ambulance to stabilize on scene, transport to a configured hospital, complete handoff, and then become available again.

Other EMS incidents can clear on scene without transport.

## Recovery

The first version does not model detailed consumables or fatigue. Units may have configurable post-incident recovery, restock, or cleanup time before becoming fully available.
