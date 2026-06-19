# Future Grilling Agenda

These were the high-risk design branches to resolve before serious implementation begins. The initial grilling pass has resolved the major v1 decisions enough to begin a thin playable vertical slice.

## Resolved Branches

1. Exact incident profile YAML shape.
2. Exact unit/resource YAML shape.
3. Dispatch suggestion algorithm.
4. Scoring formulas.
5. Vertical-slice sample content.

## Recommended Next Step

Begin Milestone 0 implementation from [Implementation Plan](implementation-plan.md), starting with the TypeScript workspace, config schemas, and tiny Tampere-ish sample data.

Recommended answer: implement the config/data model first so the incident profiles, resources, response plans, and scoring profiles can be validated before the UI is built.

## Notes

- Future grilling can continue when new uncertainty appears during implementation.
- Do not treat these decisions as immutable; tune capability values, scoring thresholds, and sample content as playtesting reveals issues.
