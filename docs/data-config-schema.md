# Data and Configuration

## Configuration Strategy

The first version uses human-editable YAML files with schema validation. The design should allow YAML to be replaced by a database later.

Game logic should depend on a data-access layer rather than reading YAML directly throughout the codebase.

Use shared Zod schemas for runtime validation and TypeScript inference. YAML parsing should happen before validation.

## Localization Strategy

Configuration files use stable IDs and localization keys rather than hard-coded user-facing display text.

English translation files provide the first UI text, labels, descriptions, report templates, and debrief text. Additional languages can be added later.

## Suggested File Groups

```text
config/capabilities.yaml
config/dispatch_codes.yaml
config/priorities.yaml
config/response_plans.yaml
config/difficulty_presets.yaml
config/incident_profiles.yaml
locales/en.yaml
regions/tampere/region.yaml
regions/tampere/stations.yaml
regions/tampere/resources.yaml
regions/tampere/hospitals.yaml
regions/tampere/spawn_locations.yaml
regions/tampere/venues.yaml
```

## Capabilities

Capability vocabulary is configurable. Resources contribute numeric capability values, and incident stages require numeric counts.

Capability examples:

- `fire_suppression`
- `rescue`
- `ems_basic`
- `ems_advanced`
- `command`
- `ladder`
- `hazmat`
- `water_rescue`
- `police_support`

## Dispatch Codes

Dispatch codes shown to the player should be real Finnish-style codes where possible, such as:

- `103`: automatic fire alarm.
- `401`: small building fire.
- `402`: medium building fire.

Codes and descriptions are configurable by an admin. The visible text comes from localization keys.

## Priorities

Priority codes are configurable, with Finnish-style A/B/C/D defaults. Priority affects scoring expectations, queue urgency, response-plan selection, and response mode/travel modifiers.

## Response Plans

Response plans map selected incident code and priority to required capability counts or resource selection rules. Assisted dispatch suggestions are generated from these plans and available unit status.

Suggestions are based on player classification, not hidden truth.

## Region Packs

Region packs define:

- Region metadata and boundaries.
- Stations.
- Hospitals.
- Resources.
- Spawn zones or candidate incident points.
- Optional named public venues.
- Optional standby or staging points.
- Map tile configuration if region-specific.
- Routing extract/reference if region-specific.

The first region is Tampere. Future regions should be addable without changing simulation logic.

## Stations

Stations should include at least stable ID, localization key/name, address, and coordinates.

## Resources

Resources should include at least stable ID, call sign, station, capabilities, crew size if used, turnout delay rules or modifiers, travel speed modifiers if used, autonomous status behavior if overridden, and recovery rules if overridden.

## Hospitals

Hospitals are required for EMS transport profiles. They should include at least stable ID, localization key/name, address, coordinates, and optional handoff duration rules.

## Incident Profiles

Incident profiles are hidden simulation categories. They are not shown directly to the dispatcher.

They should include stable ID, localization keys, spawn filters, report template keys, duplicate report rules, stages, `control_requires`, `containment_requires`, escalation timing/probabilities, windshield report keys, escalation report keys, commitment duration rules, and EMS transport rules if applicable.

## Spawn Locations

Incident profiles declare allowed location types such as:

- `residential_building`
- `commercial_building`
- `industrial_area`
- `road`
- `highway`
- `water`
- `forest`
- `public_venue`
- `rail`

Region data should include hand-authored spawn zones and/or OSM-derived candidate points.

## Validation

Provide an automated config/content validation command.

Validation should check schema correctness, missing localization keys, broken references, duplicate IDs, unknown capabilities, response plans referencing unknown codes or priorities, units referencing missing stations, EMS profiles without hospitals, missing report templates, incident profiles that cannot be controlled with available regional resources, and spawn filters with no valid locations.

There is no admin/editor UI in v1. The schema should still be clean enough to support one later.
