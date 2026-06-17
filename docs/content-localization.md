# Content and Localization

## Language Direction

All user-facing text can be English in v1, using translated Finnish operational concepts. User-facing strings live in translation files so other languages can be added later.

Incident profiles and config should reference localization keys rather than embedding display strings.

## Operational Concepts

The game should use real Finnish-style dispatch codes where possible, translated/explained in English. Examples include:

- `103`: automatic fire alarm.
- `401`: small building fire.
- `402`: medium building fire.

The game should not claim exact professional procedure. It should present a plausible simulation inspired by Finnish emergency response.

## Report Writing

Report text should be operationally natural but clue-rich.

Good reports are concise, specific enough to support player judgment, and allowed to be incomplete or uncertain.

Examples:

```text
Caller reports smoke coming from an apartment stairwell. People may still be inside.
Second caller says flames are visible from a second-floor window.
First unit on scene: smoke showing from the stairwell, residents evacuating, requesting additional fire units.
Fire has extended to the attic space. Exposure risk to the neighboring building.
```

Resource requests can be written naturally into windshield and escalation reports. V1 does not need a separate structured resource-request hint system.

## Incident Profile Text

Incident profiles should reference initial report template keys, duplicate report template keys, first-arrival windshield report keys per stage, escalation/stage-transition report keys, and debrief explanation keys if needed.

Example shape:

```yaml
id: apartment_fire
display_name_key: incident.apartment_fire.name
initial_report_template_keys:
  - report.apartment_fire.smoke_in_stairwell
stages:
  - id: smoke_showing
    first_arrival_report_key: report.apartment_fire.windshield.smoke_showing
    escalation_report_key: report.apartment_fire.escalated.flames_visible
```

## Active-Play Visibility

Hidden during active play:

- Hidden incident profile.
- Exact severity/stage.
- Control and containment requirements.
- Escalation timers/probabilities.
- Scoring penalties.
- Future duplicate reports.

Visible during active play:

- Report text.
- Reported or estimated location.
- Selected code and priority.
- Unit status and last known location.
- Routes and ETAs if available.
- Observable incident updates/new reports.
- Assisted dispatch suggestions.

## Debrief Content

The debrief can reveal hidden truth and explain outcomes. This is where the player learns how to interpret future reports.

Debrief content should show the relationship between report clues, player classification, selected priority, dispatched resources, actual hidden incident, escalation/control/containment timeline, outcome, and score effects.
