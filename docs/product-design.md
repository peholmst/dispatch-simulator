# Product Design

## Product Positioning

The game is a plausible emergency dispatch simulation, not professional training software and not an arcade abstraction. It should use authentic Finnish-inspired operational concepts while simplifying exact procedure, law, staffing, and agency-specific workflows where needed for clarity, safety, and playability.

## Player Role

The player is a hybrid dispatcher. They receive short emergency reports rather than conducting live emergency calls. They cannot ask follow-up questions.

The player decides:

- Incident code/classification shown in the dispatch UI.
- Priority.
- Whether to hold or unhold lower-priority incidents.
- Which resources to dispatch, or whether to accept a system suggestion.
- Whether to reroute, recall, or manually reassign resources.
- Whether a new report belongs to an existing incident or should become a separate incident.

The player does not micromanage responders once they arrive. Incidents resolve through the simulation when enough capabilities are on scene for the required time.

## Core Mode

The first version uses single-region shift mode. A shift represents multiple in-game hours compressed into a shorter play session using accelerated simulation time.

The shift has pause and speed controls. Pause allows players to inspect reports and issue dispatches without real-time pressure.

The first version is single-player. Future versions should allow multiple dispatchers sharing the same simulated world.

## First Region

Tampere is the first playable region. The game should support future regions through region packs rather than hard-coded Tampere-specific logic.

## Dispatch Modes

The game supports two dispatch modes:

- Assisted mode: the player selects incident code and priority, and the system suggests resources from configurable response plans.
- Manual mode: the player selects incident code, priority, and each individual unit.

Assisted suggestions are based on the player-selected incident code and priority, not hidden incident truth. This makes misclassification matter.

Suggested resources must consider unit status. Units that are out of service or already assigned cannot be automatically picked, but the player may manually reassign or reroute committed units.

## Main Interface

The interface is a map-first control room:

- The map shows incidents, stations, unit positions, and routes.
- Persistent panels show incident queue, active reports, selected incident details, classification controls, priority controls, suggested/manual dispatch controls, unit status, and reassignment actions.
- The interface should support both spatial reasoning and fast list/table-based decisions.

## Player Commands

The v1 command set:

- Classify incident.
- Set priority.
- Hold incident.
- Unhold incident.
- Dispatch suggested units.
- Dispatch selected units.
- Reroute unit.
- Recall unit.
- Link report to incident.
- Split report into new incident.
- Pause/resume.
- Change simulation speed.

Commands should be recorded in the event timeline for debrief and replay.

## Scoring

Scoring should produce separate dimension scores plus a total. The debrief should show the breakdown so the player can understand which decisions helped or hurt the outcome.

Example:

```yaml
score:
  total: 82
  dimensions:
    classification: 18
    priority: 10
    dispatchAdequacy: 20
    timeToControl: 14
    escalationPrevention: 10
    emsTransport: 5
    overDispatch: 5
```

V1 scoring dimensions:

- `classification`
- `priority`
- `dispatchAdequacy`
- `timeToControl`
- `escalationPrevention`
- `emsTransport`
- `overDispatch`

`duplicateHandling` should be postponed unless the playable slice includes explicit report link/split mechanics.

Scoring should be calculated per incident first, then aggregated into the shift score. The debrief should preserve each incident's dimension breakdown so the player can connect feedback to specific decisions.

Shift score should aggregate incident scores as a weighted average using seriousness weights from each incident's `scoring.outcomeProfile`:

```text
shiftScore = sum(incidentScore * incidentWeight) / sum(incidentWeight)
```

Dimension weights should live per scoring outcome profile:

```yaml
# config/scoring_profiles.yaml
- id: building_fire
  incidentWeight: 3
  timeToControl:
    fullCreditSeconds: 600
    zeroCreditSeconds: 1800
  overDispatch:
    freeSurplusRatio: 0.25
    zeroCreditSurplusRatio: 2.0
  emsTransport:
    fullCreditSeconds: 1800
    zeroCreditSeconds: 3600
  dimensions:
    classification: 20
    priority: 10
    dispatchAdequacy: 25
    timeToControl: 20
    escalationPrevention: 15
    emsTransport: 5
    overDispatch: 5
```

Classification scoring uses the incident profile's classification bands:

```text
ideal code = 100% of classification points
acceptable but not ideal code = 70%
wrong code = 0%
```

Priority scoring uses the same band pattern:

```text
ideal priority = 100% of priority points
acceptable but not ideal priority = 70%
wrong priority = 0%
```

Dispatch adequacy scoring compares dispatched capabilities against the hidden incident stage requirements and desired capabilities at the moment the first unit arrives. Required capability coverage determines whether the incident can be handled at all. Desired capability coverage improves the score but does not block clearing.

For multiple capability requirements, dispatch adequacy uses the average capped coverage across required capabilities, then adds desired-capability quality according to scoring profile tuning:

```text
capabilityCoverage = min(provided / required, 1)
coverageRatio = average(capabilityCoverage for each required capability)
dispatchAdequacy = coverageRatio * maxPoints
```

Overfill in one capability does not compensate for shortage in another.
If an incident has no desired capabilities, desired coverage is treated as equal to required coverage.

Dispatch adequacy counts only units dispatched before the first unit arrives. Later reinforcements affect time-to-control and escalation prevention rather than rewriting the initial dispatch score.

Time-to-control scoring measures elapsed time from initial report delivery to incident control:

```text
elapsed = controlledAt - initialReportDeliveredAt
```

Each scoring profile defines `timeToControl.fullCreditSeconds` and `timeToControl.zeroCreditSeconds`. Elapsed times at or below full-credit receive 100% of the dimension points. Elapsed times at or above zero-credit receive 0%. Values between them use linear interpolation.

Escalation prevention scoring is based on avoidable escalations:

```text
scoreRatio = 1 - (avoidableEscalationsOccurred / avoidableEscalationsPossible)
```

Clamp the result between `0` and `1`. If no avoidable escalation was possible, score the dimension as full credit. Over-dispatch is scored separately so preventing escalation by sending excessive resources can still be penalized.

Over-dispatch scoring compares initial dispatched capability against the hidden first-arrival stage required plus desired capabilities, with a free surplus band:

```yaml
overDispatch:
  freeSurplusRatio: 0.25
  zeroCreditSurplusRatio: 2.0
```

```text
baselineTotal = requiredTotal + desiredTotal
surplusRatio = (providedTotal - baselineTotal) / baselineTotal
```

Surplus at or below `freeSurplusRatio` receives full credit. Surplus at or above `zeroCreditSurplusRatio` receives 0 credit. Values between them use linear interpolation. Desired capabilities expand the non-penalized baseline. V1 ignores irrelevant extra capabilities because multi-role units naturally bring capabilities that may not apply to the incident.

EMS transport scoring:

- If EMS transport mode is `none`, score full credit.
- If `possible` resolves to no transport needed, score full credit.
- If transport is needed, score full credit when a capable EMS unit transports to a valid hospital and completes handoff within `emsTransport.fullCreditSeconds`.
- If transport completion reaches or exceeds `emsTransport.zeroCreditSeconds`, score 0.
- Values between full-credit and zero-credit thresholds use linear interpolation.
- If required transport never completes, score 0.

Transport scoring is measured from when the transport need becomes known or active.

V1 should not use a catastrophic whole-incident zero rule. Serious failures should zero their affected dimensions, while the total remains the weighted sum of dimension scores. If no unit is ever dispatched or an incident is never controlled, most related dimensions will naturally score 0.

Compact scoring summary:

```text
incident score = weighted sum of dimension ratios
shift score = weighted average of incident scores by outcome profile incidentWeight
classification = ideal 100%, acceptable 70%, wrong 0%
priority = ideal 100%, acceptable 70%, wrong 0%
dispatch adequacy = average capped coverage vs hidden first-arrival required and desired capabilities
time to control = profile thresholds with linear interpolation
escalation prevention = avoided avoidable escalations
EMS = transport completion threshold when transport is needed
over-dispatch = surplus band with linear penalty
```

Shift performance is score-based. There is no catastrophic early failure in v1.

The scorecard should include:

- Incident outcomes.
- Classification accuracy.
- Priority accuracy.
- Response time.
- Avoidable deterioration.
- Under-dispatch.
- Over-dispatch.
- Coverage gaps.
- Successful reroutes.
- Duplicate report recognition.

The final score can be summarized, but the detailed scorecard matters more because it teaches the player why decisions worked or failed.

## Debrief

Hidden truth is revealed after a shift, not during active play.

The debrief should show:

- Actual hidden incident profile.
- Escalation path.
- Control and containment requirements.
- Player-selected code and priority.
- Units dispatched.
- Arrival, containment, control, and clear times.
- Reasons for deterioration.
- Relevant player commands and report events.

## Difficulty

Difficulty presets tune pressure but never create early failure.

Suggested presets:

- Training: slower incident rate, clearer reports, fewer unit disruptions.
- Normal: balanced incident rate and ambiguity.
- Hard: more overlapping incidents, more ambiguity, faster escalation, more unit status surprises.

Difficulty may affect incident rate, report ambiguity, autonomous unit disruptions, escalation speed/probability, resource scarcity, turnout delay, out-of-service chance, and commitment duration.

## Training

The first version should include optional scripted training scenarios covering:

- Classification.
- Priority selection.
- Assisted dispatch.
- Manual dispatch.
- Rerouting.
- Duplicate reports.
- Escalation.
- Post-shift debrief interpretation.
