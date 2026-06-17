# Technical Architecture

## Stack

Use TypeScript end-to-end.

Use a small monorepo structure:

```text
apps/web
apps/server
packages/shared
```

Use pnpm workspaces. Do not add Turborepo or Nx initially.

Use Vitest for shared/domain/config/simulation tests. Add Playwright for browser end-to-end tests once the vertical-slice UI exists.

Use Prettier for formatting and ESLint with TypeScript rules for linting. Keep style rules simple and consistent across the workspace.

Frontend:

- React.
- Vite.
- MapLibre GL.
- Dense map-first control-room UI.
- Shared runtime schemas should use Zod.

Backend:

- Node.js/TypeScript.
- Fastify.
- WebSocket plugin.
- Authoritative simulation state.
- Configuration loading and validation.
- Routing integration.
- Shift persistence and debrief generation.
- YAML parsing happens in the server/config loader, then parsed objects are validated with shared Zod schemas.

## Authority Model

The backend owns authoritative simulation state, even for single-player.

The frontend renders state and sends commands. The backend owns clock, incidents, reports, unit statuses, unit movement/progress, routing state, scoring, and random streams.

This prepares the architecture for future multi-dispatcher shared-world multiplayer.

## Determinism

All simulation randomness should come from deterministic seeded streams.

Seeded randomness covers incident generation, report wording and ambiguity, duplicate reports, unit turnout delays, autonomous status changes, escalation rolls, and travel-time variance.

Completed shifts should store seed, config version, and region version for replay/debugging.

## API Shape

Use REST for bootstrap/config metadata, starting a shift, fetching past shift summaries/debriefs, and validation results if exposed through the app.

Use WebSockets for live shift updates, player commands, unit movement updates, new reports, incident updates, unit status changes, and clock ticks.

## Commands

The backend should accept explicit commands:

- `classifyIncident`
- `setPriority`
- `holdIncident`
- `unholdIncident`
- `dispatchSuggestedUnits`
- `dispatchSelectedUnits`
- `rerouteUnit`
- `recallUnit`
- `linkReportToIncident`
- `splitReportIntoIncident`
- `pause`
- `resume`
- `setSimulationSpeed`

Commands should be validated, applied to authoritative state, and recorded in the event timeline.

## Routing

Use OpenStreetMap-derived routing data for Tampere.

Target offline/self-hosted routing from a Tampere OSM extract. OSRM is the leading candidate. If OSRM setup proves too heavy, a lighter preprocessed road-graph fallback can be considered.

The backend should cache route results. Units animate or update along route geometry returned by the routing component.

## Map Tiles

Map tile source should be configurable.

Early development can use public/dev tiles. Production or offline play should support self-hosted or packaged tiles later.

## Persistence

V1 does not need mid-shift save/load.

Persist completed shift data:

- Summary.
- Scorecard.
- Debrief.
- Event timeline.
- Random seed.
- Config version.
- Region version.

## Future Multiplayer

Multiplayer is not a v1 requirement, but the backend-authoritative model should make it possible later for multiple dispatcher clients to connect to the same simulated world.

Avoid frontend-owned simulation logic that would need to be moved later.
