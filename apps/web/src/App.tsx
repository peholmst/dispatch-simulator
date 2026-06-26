import React, { useEffect, useMemo, useState } from "react";
import type { IncidentSimulationState, UnitSimulationState } from "@dispatch-simulator/shared";
import { post } from "./api";
import { DebriefPanel } from "./components/DebriefPanel";
import { IncidentsPanel } from "./components/IncidentsPanel";
import { MapView } from "./components/MapView";
import { TimelinePanel } from "./components/TimelinePanel";
import { Toolbar } from "./components/Toolbar";
import { UnitsPanel } from "./components/UnitsPanel";
import type { ApiState, MainTab, UnitMapFocusRequest } from "./types";

function isIncidentVisible(incident: IncidentSimulationState, now?: number): boolean {
  return incident.reportedAt !== undefined || (now !== undefined && incident.reportDueAt <= now);
}

export function App() {
  const [apiState, setApiState] = useState<ApiState>({});
  const [seed, setSeed] = useState("demo-shift");
  const [scenarioId, setScenarioId] = useState("");
  const [code, setCode] = useState("704");
  const [priority, setPriority] = useState("B");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string>();
  const [activeTab, setActiveTab] = useState<MainTab>("incidents");
  const [mapFocusRequest, setMapFocusRequest] = useState<UnitMapFocusRequest>();
  const [error, setError] = useState<string>();

  const shift = apiState.shift;
  const config = shift?.config ?? apiState.config;
  const scenarios = config?.trainingScenarios ?? [];
  const visibleIncidents = useMemo(
    () => (shift?.incidents ?? []).filter((candidate) => isIncidentVisible(candidate, shift?.clock.now)),
    [shift]
  );
  const incident = visibleIncidents.find((candidate) => candidate.id === activeIncidentId) ?? visibleIncidents[0];
  const incidentLocation = incident
    ? config?.spawnLocations.find((location) => location.id === incident.locationId)
    : undefined;
  const dispatchCode = shift?.config.dispatchCodes.find((candidate) => candidate.id === code);
  const validPriorities = dispatchCode?.validPriorities ?? [];
  const paused = shift?.clock.mode === "paused";
  const units = useMemo(() => Object.values(shift?.units ?? {}), [shift]);
  const selectedUnitStates = selectedUnits.map((unitId) => shift?.units[unitId]).filter((unit): unit is UnitSimulationState => Boolean(unit));
  const canManualDispatch = Boolean(incident && selectedUnitStates.some((unit) => unit.status === "available_at_station" || unit.status === "available_mobile"));
  const canHold = selectedUnitStates.some((unit) => unit.status === "available_at_station" || unit.status === "available_mobile");
  const canReleaseHeld = selectedUnitStates.some((unit) => unit.status === "held");
  const canRecall = selectedUnitStates.some((unit) => ["en_route", "on_scene", "committed_on_scene", "recovering"].includes(unit.status));
  const toggleUnit = React.useCallback((unitId: string) => {
    setSelectedUnits((current) => (
      current.includes(unitId) ? current.filter((id) => id !== unitId) : [...current, unitId]
    ));
  }, []);

  async function run(action: () => Promise<ApiState>): Promise<void> {
    try {
      setError(undefined);
      setApiState(await action());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => {
    fetch("/api/shift").then((response) => response.json()).then(setApiState).catch(() => undefined);
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as { type: string; payload: ApiState };
      if (message.type === "state") {
        setApiState(message.payload);
      }
    });
    return () => socket.close();
  }, []);

  useEffect(() => {
    if (validPriorities.length > 0 && !validPriorities.includes(priority)) {
      setPriority(validPriorities[0]!);
    }
  }, [priority, validPriorities]);

  useEffect(() => {
    if (!shift || shift.status === "finished" || shift.clock.mode !== "running") {
      return;
    }

    let inFlight = false;
    let stopped = false;
    const interval = window.setInterval(() => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      post<ApiState>("/api/shift/advance", { seconds: 1 })
        .then((next) => {
          if (!stopped) {
            setError(undefined);
            setApiState(next);
          }
        })
        .catch((caught) => {
          if (!stopped) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, 1000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [shift?.clock.mode, shift?.status]);

  useEffect(() => {
    if (visibleIncidents.length === 0) {
      if (activeIncidentId) {
        setActiveIncidentId(undefined);
      }
      return;
    }
    if (!activeIncidentId || !visibleIncidents.some((item) => item.id === activeIncidentId)) {
      setActiveIncidentId(visibleIncidents[0]!.id);
    }
  }, [activeIncidentId, visibleIncidents]);

  return (
    <main className="shell">
      <Toolbar
        shift={shift}
        config={config}
        seed={seed}
        scenarioId={scenarioId}
        paused={paused}
        onSeedChange={setSeed}
        onScenarioChange={(nextScenarioId, scenarioSeed) => {
          setScenarioId(nextScenarioId);
          if (scenarioSeed) {
            setSeed(scenarioSeed);
          }
        }}
        onStart={() => run(async () => {
          const next = await post<ApiState>("/api/shift/start", { seed, scenarioId: scenarioId || undefined });
          setActiveIncidentId(undefined);
          setSelectedUnits([]);
          return next;
        })}
        onPauseToggle={() => run(() => post("/api/shift/clock", { paused: !paused }))}
        onSpeedChange={(speed) => run(() => post("/api/shift/clock", { speed }))}
        onAdvanceMinute={() => run(() => post("/api/shift/advance", { seconds: 60 }))}
        onFinish={() => run(() => post("/api/shift/finish"))}
      />

      {error ? <div className="error">{error}</div> : null}

      <section className="tab-sheet">
        <nav className="main-tabs" role="tablist" aria-label="Main workspace">
          <button
            type="button"
            role="tab"
            id="tab-incidents"
            aria-controls="panel-incidents"
            aria-selected={activeTab === "incidents"}
            className={activeTab === "incidents" ? "active" : ""}
            onClick={() => setActiveTab("incidents")}
          >
            Incidents
          </button>
          <button
            type="button"
            role="tab"
            id="tab-timeline"
            aria-controls="panel-timeline"
            aria-selected={activeTab === "timeline"}
            className={activeTab === "timeline" ? "active" : ""}
            onClick={() => setActiveTab("timeline")}
          >
            Timeline
          </button>
        </nav>

        <div className="tab-content">
          {activeTab === "incidents" ? (
            <section id="panel-incidents" className="grid" role="tabpanel" aria-labelledby="tab-incidents">
              <IncidentsPanel
                shift={shift}
                incidents={visibleIncidents}
                incident={incident}
                incidentLocation={incidentLocation}
                code={code}
                priority={priority}
                validPriorities={validPriorities}
                onSelectIncident={setActiveIncidentId}
                onCodeChange={setCode}
                onPriorityChange={setPriority}
                run={run}
              />

              <div className="map">
                <MapView
                  shift={shift}
                  activeIncidentId={incident?.id}
                  selectedUnitIds={selectedUnits}
                  onToggleUnit={toggleUnit}
                  focusRequest={mapFocusRequest}
                />
              </div>

              <UnitsPanel
                units={units}
                incidents={shift?.incidents ?? []}
                config={config}
                incident={incident}
                selectedUnits={selectedUnits}
                now={shift?.clock.now}
                canManualDispatch={canManualDispatch}
                canHold={canHold}
                canReleaseHeld={canReleaseHeld}
                canRecall={canRecall}
                onClearSelection={() => setSelectedUnits([])}
                onToggleUnit={toggleUnit}
                onFocusUnit={setMapFocusRequest}
                run={run}
              />
            </section>
          ) : (
            <TimelinePanel shift={shift} />
          )}
        </div>
      </section>

      {apiState.debrief ? <DebriefPanel debrief={apiState.debrief} summaries={apiState.completedShiftSummaries ?? []} /> : null}
    </main>
  );
}
