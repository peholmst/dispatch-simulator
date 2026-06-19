# Implementation Plan

## Purpose

This document turns the design into executable delivery slices. It should evolve as decisions become implementation tasks.

## Current Status

Completed:

- TypeScript workspace scaffold with `apps/web`, `apps/server`, and `packages/shared`.
- Root install/verification documentation in `README.md`.
- Shared config schemas using Zod.
- YAML config loader for global config, Tampere region data, and English localization.
- Config validation command.
- Tiny Tampere-ish sample data:
  - 3 stations.
  - 8 resources.
  - 2 incident profiles: `apartment_fire` and `chest_pain`.
  - Dispatch codes, priorities, response plans, scoring profiles, one hospital, spawn locations, and localization strings.
- Assisted dispatch suggestion algorithm:
  - Uses player-selected code and priority.
  - Satisfies required capabilities first.
  - Satisfies desired capabilities second.
  - Uses beeline distance and closest-useful greedy selection.
  - Reports required shortages and desired shortages separately.
- Tests for config loading/validation and assisted dispatch suggestions.
- Verified commands:
  - `npm run validate:config`
  - `npm test`
  - `npm run build`

Current implementation focus:

- Build the deterministic simulation core with TDD.
- Start with public interfaces for shift start, incident generation, report delivery, classification, and dispatch commands.
- Keep routing mocked or straight-line until the map/routing milestone.

## Milestone 0: Thin Playable Vertical Slice

Goal: prove the core game loop before full GIS/routing/content work.

Acceptance criteria:

- User can start a shift.
- User receives at least one ambiguous emergency report.
- User can choose incident code and priority.
- User can dispatch units.
- Unit status changes and travel/arrival are visible.
- Incident can be controlled, contained, or escalated based on on-scene capabilities.
- User can finish the shift.
- Debrief reveals hidden truth and key timing/outcome details.

Completed groundwork:

- Set up TypeScript workspace.
- Use a small monorepo with `apps/web`, `apps/server`, and `packages/shared`.
- Use pnpm workspaces without Turborepo/Nx initially.
- Add shared domain package or shared types folder.
- Add test/build scripts.
- Use Vitest first for domain/config/simulation tests.
- Add tiny Tampere-ish test data with 3 stations, 8 units, 2 incident profiles, dispatch codes, priorities, response plans, scoring profiles, one hospital, and localization strings.
- Use `apartment_fire` and `chest_pain` as the first two incident profiles.
- Vertical-slice resources:
  - `RPI31`: incident commander.
  - `RPI101`: pumper.
  - `RPI103`: tanker.
  - `RPI106`: aerial platform.
  - `RPI111`: pumper from station 11.
  - `RPI121`: pumper from station 12.
  - `EPI131`: basic ambulance.
  - `EPI121`: advanced ambulance.
- Initial vertical-slice resource capabilities:
  - `RPI31`: `command: 1`, `first_response: 1`.
  - `RPI101`: `fire_suppression: 10`, `smoke_divers: 3`, `first_response: 1`.
  - `RPI103`: `water_supply: 1`, `fire_suppression: 10`.
  - `RPI106`: `aerial: 1`, `fire_suppression: 5`.
  - `RPI111`: `fire_suppression: 10`, `smoke_divers: 3`, `first_response: 1`.
  - `RPI121`: `fire_suppression: 10`, `smoke_divers: 3`, `first_response: 1`.
  - `EPI131`: `ems: 1`.
  - `EPI121`: `ems: 1`, `ems_advanced: 1`.
- Vertical-slice stations:
  - `station_10`: `RPI101`, `RPI103`, `RPI106`.
  - `station_11`: `RPI111`, `RPI31`.
  - `station_12`: `RPI121`, `EPI121`, `EPI131`.
- Vertical-slice hospital: `tays_acuta`.
- Vertical-slice dispatch codes:
  - `103`: automatic fire alarm.
  - `401`: small building fire.
  - `402`: medium building fire.
  - `704`: chest pain / medical emergency.
- Vertical-slice valid code-priority pairs:
  - `103-B`, `103-C`.
  - `401-B`, `401-C`.
  - `402-A`, `402-B`.
  - `704-A`, `704-B`, `704-C`.
  - No selected vertical-slice code supports priority `D`.
- Vertical-slice priority catalog includes `A`, `B`, `C`, and `D`, but priority choices are filtered by selected dispatch code.
- Vertical-slice response-plan capability requirements:
  - `103-B`:
    - requires: `fire_suppression: 10`
  - `401-B`:
    - requires: `fire_suppression: 10`, `smoke_divers: 3`
  - `402-B`:
    - requires: `command: 1`, `fire_suppression: 30`, `smoke_divers: 6`, `aerial: 1`, `water_supply: 1`
  - `704-B`:
    - requires: `ems: 1`
  - `704-A`:
    - requires: `ems: 1`, `first_response: 1`
    - desires: `ems_advanced: 1`
  - `103-C`:
    - requires: `fire_suppression: 10`
  - `401-C`:
    - requires: `fire_suppression: 10`
  - `402-A`:
    - requires: `command: 1`, `fire_suppression: 30`, `smoke_divers: 6`, `aerial: 1`, `water_supply: 1`, `ems: 1`
    - desires: `ems_advanced: 1`
  - `704-C`:
    - requires: `ems: 1`
- A typical medium structural fire response should be representable as 1 commander, 3 pumpers, 1 aerial platform, and 1 tanker.

Remaining Milestone 0 tasks:

- Implement deterministic simulation core.
- Add seeded random streams.
- Add simulation clock, pause, and speed controls.
- Generate incidents from validated profiles and spawn locations.
- Generate and deliver initial reports.
- Allow player classification by dispatch code and priority.
- Allow assisted and manual dispatch commands.
- Move units with mocked routing, straight-line movement, or fixed travel times.
- Handle unit arrival and first-arrival windshield reports.
- Resolve control, containment, escalation, commitment, EMS transport, and recovery.
- Implement event timeline.
- Add Fastify Node.js backend.
- Add basic WebSocket connection.
- Add Vite React frontend.
- Add simple map or placeholder spatial view.
- Add Playwright end-to-end tests once the UI can run a shift.
- Use mocked routing, straight-line movement, or fixed travel times.
- Support report, classification, priority, assisted/manual dispatch, unit travel, arrival, control, containment, escalation, and debrief.

## Milestone 1: Config and Validation

Goal: turn the vertical-slice sample data into validated YAML region/config data.

Status: mostly complete for the first vertical slice. Keep this milestone open for validation hardening as simulation and UI needs reveal gaps.

Completed:

- Define YAML schemas for capabilities, priorities, dispatch codes, stations, resources, hospitals, response plans, and incident profiles.
- Implement config loader behind a data-access boundary.
- Implement localization file loader.
- Implement validation command.
- Create tiny sample Tampere test data.

Likely follow-up tasks:

- Add validation for additional playability rules found during simulation implementation.
- Add more targeted validation tests when new config fields are introduced.
- Decide whether to add linting/formatting scripts.

## Milestone 2: Simulation Core

Goal: run a deterministic shift without full map/routing polish.

Recommended next implementation slice:

- Use TDD for future game features.
- First public interface should support starting a shift with a seed and loaded config.
- First behavior to test: starting a shift produces an initial state with available units and a deterministic incident queue/report timeline.

Likely tasks:

- Implement seeded random streams.
- Implement simulation clock, pause, and speed.
- Implement incident generation from profiles.
- Implement report generation.
- Implement unit status lifecycle.
- Implement player commands.
- Implement control, containment, escalation, and commitment.
- Implement event timeline.

## Milestone 3: Dispatch UI Slice

Goal: play a simple shift through the browser.

Likely tasks:

- Show incident queue and reports.
- Allow code and priority selection.
- Implement assisted dispatch suggestions from response plans.
- Implement manual dispatch.
- Show unit list and status.
- Support hold, reroute, recall, link report, and split report.
- Stream simulation updates over WebSocket.

## Milestone 4: Map and Routing

Goal: make the spatial game real.

Likely tasks:

- Configure MapLibre tiles.
- Display stations, hospitals, units, incidents, and routes.
- Integrate OSRM or routing abstraction.
- Cache route results.
- Move units along routed geometry.
- Publish coarse 10-15 simulated second location updates.
- Optionally interpolate movement in the frontend.

## Milestone 5: Scoring and Debrief

Goal: complete the shift feedback loop.

Likely tasks:

- Implement score dimensions.
- Persist completed shift summaries.
- Store event timeline, seed, config version, and region version.
- Build debrief UI.
- Reveal hidden truth after shift.
- Explain classification, priority, dispatch, escalation, control, containment, and timing outcomes.

## Milestone 6: Training and Content Expansion

Goal: make the first version teachable and replayable.

Likely tasks:

- Add scripted training scenarios.
- Expand Tampere sample data.
- Add more incident profiles and report templates.
- Tune difficulty presets.
- Improve validation for playability.

## Open Implementation Planning Question

No high-risk design branch is currently blocking implementation. The resolved grilling notes are parked in [Future Grilling Agenda](future-grilling-agenda.md).
