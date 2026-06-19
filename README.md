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

Build output is written to package `dist/` folders, which are ignored by Git.

## Project Layout

```text
apps/
  server/      Backend placeholder for the future simulation API.
  web/         Frontend placeholder for the future dispatch UI.
packages/
  shared/      Shared config schemas, loader, validation, and dispatch logic.
config/        Global YAML config such as capabilities, priorities, response plans, and incidents.
regions/       Region-specific YAML data.
locales/       Localization files.
docs/          Design and implementation planning documents.
```

## Current Development Entry Points

- `packages/shared/src/config/` contains config schemas, loading, validation, and tests.
- `packages/shared/src/dispatch/` contains the assisted dispatch suggestion algorithm and tests.
- `config/incidents/` contains the first incident profiles: `apartment_fire` and `chest_pain`.
- `regions/tampere/` contains the first sample region data.

## Useful Commands

```powershell
corepack pnpm validate:config
corepack pnpm test
corepack pnpm build
```
