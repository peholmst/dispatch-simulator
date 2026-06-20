# Dispatch Simulator

Emergency dispatch simulation game prototype focused on a thin playable vertical slice.

## Requirements

- Node.js 20 or newer
- Corepack-enabled pnpm

The project is configured as a pnpm workspace.

## Install

From the repository root:

```sh
corepack prepare pnpm@9.15.4 --activate
corepack pnpm install
```

## Validate Configuration

The sample Tampere configuration can be validated with:

```sh
corepack pnpm validate:config
```

This loads YAML from `config/`, `regions/tampere/`, and `locales/en.yaml`, then checks schema validity, references, localization keys, resource capabilities, response plans, training scenarios, and strict incident controllability.

## Test

Run all current tests:

```sh
corepack pnpm test
```

The current tests cover config loading/validation, training scenarios, the simulation loop, scoring/debriefs, routing movement, and the assisted dispatch suggestion algorithm.

Run the Playwright end-to-end tests:

```sh
corepack pnpm exec playwright install chromium
corepack pnpm exec playwright install-deps chromium
corepack pnpm test:e2e
```

The `install-deps` step installs Chromium system libraries on Linux/WSL and may require `sudo`.

## Build

Compile the TypeScript packages:

```sh
corepack pnpm build
```

Build output is written to package `dist/` folders, which are ignored by Git. The web package also produces a Vite production bundle.

## Run The Vertical Slice

Start the API server:

```sh
corepack pnpm dev:server
```

In another terminal, start the web app:

```sh
corepack pnpm dev:web
```

Then open `http://127.0.0.1:5173`. The Vite dev server proxies `/api` and `/api/ws` to the Fastify server on `http://127.0.0.1:3000`.

## Project Layout

```text
apps/
  server/      Fastify API and WebSocket server for the playable slice.
  web/         Vite React dispatch UI for the playable slice.
packages/
  shared/      Shared config, dispatch, and deterministic simulation logic.
config/        Global YAML config such as capabilities, priorities, response plans, and incidents.
regions/       Region-specific YAML data.
locales/       Localization files.
docs/          Design and implementation planning documents.
```

## Current Development Entry Points

- `packages/shared/src/config/` contains config schemas, loading, validation, and tests.
- `packages/shared/src/dispatch/` contains the assisted dispatch suggestion algorithm and tests.
- `packages/shared/src/simulation/` contains the deterministic shift simulation core and tests.
- `config/incidents/` contains the incident profiles: `apartment_fire`, `automatic_alarm`, `chest_pain`, and `fall_injury`.
- `config/training_scenarios/` contains replayable scripted starts for tutorial and busier practice sessions.
- `regions/tampere/` contains the first sample region data.

## Useful Commands

```sh
corepack pnpm validate:config
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm build
corepack pnpm dev:server
corepack pnpm dev:web
```
