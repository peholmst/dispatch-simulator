# Implementation Plan

## Purpose

This document turns the design into executable delivery slices. It should evolve as decisions become implementation tasks.

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

Likely tasks:

- Set up TypeScript workspace.
- Use a small monorepo with `apps/web`, `apps/server`, and `packages/shared`.
- Use pnpm workspaces without Turborepo/Nx initially.
- Add Vite React frontend.
- Add Fastify Node.js backend.
- Add shared domain package or shared types folder.
- Add lint/test/build scripts.
- Use Vitest first for domain/config/simulation tests.
- Add Playwright end-to-end tests once the UI can run a shift.
- Add basic WebSocket connection.
- Add simple map or placeholder spatial view.
- Add tiny Tampere-ish test data with 2 stations, 4 units, 2 incident profiles, dispatch codes, priorities, and response plans.
- Use mocked routing, straight-line movement, or fixed travel times.
- Support report, classification, priority, assisted/manual dispatch, unit travel, arrival, control, containment, escalation, and debrief.

## Milestone 1: Config and Validation

Goal: turn the vertical-slice sample data into validated YAML region/config data.

Likely tasks:

- Define YAML schemas for capabilities, priorities, dispatch codes, stations, resources, hospitals, response plans, and incident profiles.
- Implement config loader behind a data-access boundary.
- Implement localization file loader.
- Implement validation command.
- Create tiny sample Tampere test data.

## Milestone 2: Simulation Core

Goal: run a deterministic shift without full map/routing polish.

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

The next high-risk design branches are parked in [Future Grilling Agenda](future-grilling-agenda.md).
