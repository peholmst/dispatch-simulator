# Dispatch Simulator

Emergency dispatch simulation game prototype focused on a thin playable vertical slice.

## Requirements

- Node.js 20 or newer
- pnpm

The project is configured as a pnpm workspace.

## Install

From the repository root:

```powershell
corepack prepare pnpm@9.15.4 --activate
corepack pnpm install
```

## Validate Configuration

The sample Tampere configuration can be validated with:

```powershell
corepack pnpm validate:config
```

This loads YAML from `config/`, `regions/tampere/`, and `locales/en.yaml`, then checks schema validity, references, localization keys, resource capabilities, response plans, and strict incident controllability.

## Test

Run all current tests:

```powershell
corepack pnpm test
```

The current tests cover config loading/validation and the assisted dispatch suggestion algorithm.

## Build

Compile the TypeScript packages:

```powershell
corepack pnpm build
```

Build output is written to package `dist/` folders, which are ignored by Git. The web package also produces a Vite production bundle.

## Run The Vertical Slice

Start the API server:

```powershell
pnpm dev:server
```

In another terminal, start the web app:

```powershell
pnpm dev:web
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
- `config/incidents/` contains the first incident profiles: `apartment_fire` and `chest_pain`.
- `regions/tampere/` contains the first sample region data.

## Useful Commands

```powershell
corepack pnpm validate:config
corepack pnpm test
corepack pnpm build
pnpm dev:server
pnpm dev:web
```
