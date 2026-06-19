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
- Tests for config loading/validation, assisted dispatch suggestions, and simulation core behavior.
- Deterministic simulation core:
  - Seeded random streams.
  - Simulation clock, pause, and speed controls.
  - Deterministic incident queue generation from validated profiles and spawn locations.
  - Initial and duplicate emergency report delivery.
  - Player classification by dispatch code and priority.
  - Assisted and manual dispatch commands.
  - Straight-line mocked travel and unit arrivals.
  - First-arrival windshield reports.
  - Control, containment, escalation, commitment, EMS transport completion, and recovery handling.
  - Commitment/release handling for units that arrive after incident control.
  - Event timeline and debrief generation.
- Fastify API server with a basic WebSocket state stream.
- Vite React frontend with shift controls, incident classification, assisted/manual dispatch, unit status, placeholder spatial view, timeline, and debrief.
- API smoke verification of a full apartment-fire loop:
  - start shift.
  - receive report.
  - classify `402-B`.
  - assisted dispatch.
  - advance to arrival/control.
  - finish shift.
  - debrief reveals hidden truth and key timings.
- In-app browser verification of the playable UI at `http://127.0.0.1:5173`:
  - start fresh shift with seed `verify-m0-loop`.
  - advance to report delivery.
  - select `402-B`.
  - classify the incident.
  - use assisted dispatch.
  - advance until units arrive and the incident is controlled.
  - finish the shift.
  - confirm the debrief renders `Apartment fire`, classified `402-B`, controlled at `06:00`, first arrival at `06:00`.
- Verified commands:
  - `pnpm validate:config`
  - `pnpm test`
  - `pnpm build`
  - API smoke flow against local Fastify server.
  - In-app browser flow against the local Vite/Fastify stack.

Current implementation focus:

- Harden the map/routing slice and prepare for scoring/debrief persistence.
- Keep external OSRM integration optional behind the routing abstraction until richer routing data is needed.

## Milestone 0: Thin Playable Vertical Slice

Goal: prove the core game loop before full GIS/routing/content work.

Status: complete and browser-verified for the first playable slice.

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

Remaining Milestone 0 hardening:

- Add Playwright end-to-end tests for the browser flow so the verified shift loop is repeatable in CI/local automation.
- Improve UI polish based on the browser-verified vertical slice.

## Milestone 1: Config and Validation

Goal: turn the vertical-slice sample data into validated YAML region/config data.

Status: complete for the first vertical slice.

Completed:

- Define YAML schemas for capabilities, priorities, dispatch codes, stations, resources, hospitals, response plans, and incident profiles.
- Implement config loader behind a data-access boundary.
- Implement localization file loader.
- Implement validation command.
- Create tiny sample Tampere test data.
- Add validation hardening from simulation/UI playability:
  - ordered numeric ranges.
  - ordered region bounds.
  - station, hospital, spawn, and explicit mobile resource coordinates inside region bounds.
  - resource priority modifier references.
  - dispatchable-resource fulfillment for response plans.
  - incident ideal classifications as subsets of acceptable classifications.
  - valid configured code-priority pairs for incident classifications.
  - spawn filters that leave at least one concrete location.
  - stage ordering, first-stage-at-zero, transition probability, and escalation report checks.
- Add targeted validation tests for range ordering, coordinate bounds, classification/stage playability, and response-plan fulfillability.

Linting/formatting decision:

- Defer adding ESLint/Prettier until the codebase has enough style surface to justify the dependency and config footprint. Current quality gates are `pnpm validate:config`, `pnpm test`, and `pnpm build`.

## Milestone 2: Simulation Core

Goal: run a deterministic shift without full map/routing polish.

Status: complete for the first deterministic core slice.

Completed:

- Public shift API starts from a seed and loaded config.
- Starting a shift creates available unit state and a deterministic incident queue/report timeline.
- Supports configurable incident count and deterministic spacing for queued incidents.
- Generates incidents from profiles and spawn locations.
- Delivers initial reports and duplicate reports from incident profile report rules.
- Supports simulation clock advance, pause, and speed.
- Supports player classification commands.
- Supports assisted and manual dispatch commands.
- Moves units with straight-line mocked travel and deterministic turnout.
- Handles unit arrival and first-arrival windshield reports.
- Handles control, containment, escalation, commitment, EMS transport completion, and recovery/release.
- Correctly commits and releases units that arrive after an incident has already been controlled.
- Emits event timeline entries for reports, duplicate reports, classification, dispatch, arrivals, windshield reports, containment, escalation, control, EMS transport completion, unit availability, and shift finish.
- Includes focused Vitest coverage for deterministic queue/report generation, duplicate report delivery, clock controls, medical and fire control loops, and staggered-arrival release.

Remaining hardening for later milestones:

- Add richer player commands such as hold, reroute, recall, link report, and split report in the dispatch UI slice.
- Replace straight-line mocked travel in the map/routing milestone.

## Milestone 3: Dispatch UI Slice

Goal: play a simple shift through the browser.

Status: complete for the first dispatch-console slice.

Completed:

- Show incident queue and reports.
- Allow code and priority selection.
- Implement assisted dispatch suggestions from response plans.
- Implement manual dispatch.
- Show unit list and status.
- Support hold, release, reroute, recall, link report, and split report.
- Stream simulation updates over WebSocket.
- Add API endpoints for dispatch-console actions.
- Add simulation regression coverage for hold, recall, reroute, link report, and split report.

## Milestone 4: Map and Routing

Goal: make the spatial game real.

Status: complete for the first spatial slice.

Completed:

- Added MapLibre to the web app with OpenStreetMap raster tile configuration.
- Replaced the placeholder spatial view with a MapLibre map.
- Display stations, hospitals, reported incidents, units, and active en-route route lines.
- Added a cache-backed routing abstraction in the shared simulation package.
- Kept the first routing provider deterministic and local while preserving an OSRM-ready boundary.
- Store route geometry, route timing, and route cache keys on dispatched unit state.
- Move en-route units along routed geometry after turnout.
- Publish coarse 15 simulated second location samples through normal shift state updates.
- Added simulation regression coverage for cached route assignment and en-route location updates.

## Milestone 5: Scoring and Debrief

Goal: complete the shift feedback loop.

Status: complete for the first scoring and debrief slice.

Completed:

- Implemented score dimensions for classification, priority, dispatch adequacy, time to control, escalation prevention, EMS transport, and over-dispatch.
- Persist completed shift summaries in the server workspace data directory.
- Store event timeline, seed, config version, and region version in shift debriefs.
- Built a debrief UI with shift score, per-incident outcomes, hidden truth, and dimension explanations.
- Reveal hidden truth after shift completion.
- Explain classification, priority, dispatch, escalation, control, EMS transport, and timing outcomes.

## Milestone 6: Training and Content Expansion

Goal: make the first version teachable and replayable.

Status: complete for the first training/content expansion slice.

Completed:

- Added loadable difficulty presets for tutorial, standard, and busy replay shapes.
- Added scripted training scenarios with fixed incident profiles, spawn locations, timing, seeds, and debrief metadata.
- Added a web start selector for replayable training scenarios while preserving random seeded shifts.
- Expanded Tampere sample data with another station, more units, and additional residential, venue, and commercial spawn locations.
- Added automatic fire alarm and fall injury incident profiles with report, duplicate report, escalation, and windshield templates.
- Improved validation for scenario references, localization, timing order, report delay ranges, and profile/location compatibility.
- Added regression coverage for scenario loading, validation, deterministic scenario starts, and debrief scenario metadata.

## Open Implementation Planning Question

No high-risk design branch is currently blocking implementation. The resolved grilling notes are parked in [Future Grilling Agenda](future-grilling-agenda.md).
