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
