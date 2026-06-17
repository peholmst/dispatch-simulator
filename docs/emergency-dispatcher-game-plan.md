# Emergency Dispatcher Game Plan

This file is the decision index for the emergency dispatcher game. Focused planning documents live beside it and should be used when turning the concept into implementation tasks.

## Purpose

Design a web-based emergency dispatcher game inspired by Finnish emergency response operations. Players receive short emergency reports, classify incidents, choose priority, dispatch resources, and watch units respond across a real road network.

## Planning Documents

- [Product Design](product-design.md): player role, game loop, modes, UI, scoring, difficulty, and training.
- [Simulation Model](simulation-model.md): incident truth, reports, escalation, unit statuses, resource capabilities, control, containment, and EMS transport.
- [Data and Configuration](data-config-schema.md): YAML configuration, region packs, localization keys, validation, and future database direction.
- [Technical Architecture](technical-architecture.md): TypeScript stack, backend authority, WebSockets, routing, map tiles, persistence, and future multiplayer.
- [Content and Localization](content-localization.md): translated Finnish operational concepts, report-writing guidance, incident profiles, and content validation.
- [Implementation Plan](implementation-plan.md): phased delivery plan and backlog slices.
- [Future Grilling Agenda](future-grilling-agenda.md): unresolved design branches to continue later.

## Key Decisions

- Realism target: plausible simulation game, not professional training software.
- First core mode: single-player, single-region shift mode.
- First region: Tampere, with future regions supported through region packs.
- First service scope: fire/rescue and EMS. Police is abstracted as an optional capability for v1.
- First interface: map-first control room with persistent incident and unit panels.
- First configuration approach: YAML files with schema validation, designed so a database can replace files later.
- First technology stack: TypeScript, React, MapLibre GL, Node.js backend.
- Routing target: offline/self-hosted OSM-based routing, with OSRM as the leading candidate.
- Simulation authority: backend-owned, deterministic from seeded random streams.
- Live updates: WebSockets for active shifts, REST for bootstrap/config/debrief retrieval.
- Shift outcome: score/debrief only, no catastrophic early failure in v1.

## Open Design Questions

1. Exact incident profile YAML shape.
2. Exact unit/resource YAML shape.
3. Dispatch suggestion algorithm.
4. Scoring formulas.
5. Vertical-slice sample content.

## Current Recommendation

The next recommended question is: what should the exact incident profile YAML structure look like?

## Interview Status

The interview is being conducted one question at a time. Decisions are consolidated into the focused documents above.
