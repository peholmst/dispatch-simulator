import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ShiftDebrief, ShiftState, UnitSimulationState } from "@dispatch-simulator/shared";
import "./styles.css";

interface ApiState {
  shift?: ShiftState;
  debrief?: ShiftDebrief;
}

const apiHeaders = { "Content-Type": "application/json" };

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify(body ?? {})
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function formatTime(seconds: number | undefined): string {
  if (seconds === undefined) {
    return "-";
  }
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60).toString().padStart(2, "0");
  const remaining = (rounded % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function UnitRow({ unit, selected, onToggle }: {
  unit: UnitSimulationState;
  selected: boolean;
  onToggle: () => void;
}) {
  const canSelect = unit.status === "available_at_station" || unit.status === "available_mobile";
  return (
    <label className={`unit-row ${selected ? "selected" : ""} ${canSelect ? "" : "disabled"}`}>
      <input type="checkbox" checked={selected} disabled={!canSelect} onChange={onToggle} />
      <span className="callsign">{unit.callSign}</span>
      <span>{unit.status.replaceAll("_", " ")}</span>
      <span>{unit.arrivalAt ? `ETA ${formatTime(unit.arrivalAt)}` : ""}</span>
    </label>
  );
}

function App() {
  const [apiState, setApiState] = useState<ApiState>({});
  const [seed, setSeed] = useState("demo-shift");
  const [code, setCode] = useState("704");
  const [priority, setPriority] = useState("B");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  const shift = apiState.shift;
  const incident = shift?.incidents[0];
  const dispatchCode = shift?.config.dispatchCodes.find((candidate) => candidate.id === code);
  const validPriorities = dispatchCode?.validPriorities ?? [];
  const units = useMemo(() => Object.values(shift?.units ?? {}), [shift]);

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

  return (
    <main className="shell">
      <section className="toolbar">
        <div>
          <h1>Dispatch Simulator</h1>
          <p>{shift ? `Shift ${shift.status} at ${formatTime(shift.clock.now)}` : "No active shift"}</p>
        </div>
        <input value={seed} onChange={(event) => setSeed(event.target.value)} aria-label="Seed" />
        <button onClick={() => run(() => post("/api/shift/start", { seed }))}>Start</button>
        <button disabled={!shift || shift.status === "finished"} onClick={() => run(() => post("/api/shift/advance", { seconds: 60 }))}>+1 min</button>
        <button disabled={!shift || shift.status === "finished"} onClick={() => run(() => post("/api/shift/finish"))}>Finish</button>
      </section>

      {error ? <div className="error">{error}</div> : null}

      <section className="grid">
        <div className="panel incident">
          <h2>Incident</h2>
          {incident ? (
            <>
              <div className={`status ${incident.status}`}>{incident.status.replaceAll("_", " ")}</div>
              <p className="report">{incident.reportedAt === undefined ? `Report due ${formatTime(incident.reportDueAt)}` : incident.reportText}</p>
              <p>{incident.windshieldReport ?? "Awaiting first-arrival report"}</p>
              <div className="facts">
                <span>Stage {incident.stageId}</span>
                <span>Contained {formatTime(incident.containedAt)}</span>
                <span>Controlled {formatTime(incident.controlledAt)}</span>
                <span>Escalated {formatTime(incident.escalatedAt)}</span>
              </div>
              <div className="classify">
                <select value={code} onChange={(event) => setCode(event.target.value)}>
                  {shift!.config.dispatchCodes.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                </select>
                <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                  {validPriorities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <button onClick={() => run(() => post("/api/shift/classify", { incidentId: incident.id, code, priority }))}>Classify</button>
                <button onClick={() => run(() => post("/api/shift/dispatch-suggested", { incidentId: incident.id }))}>Assist</button>
                <button onClick={() => run(() => post("/api/shift/dispatch", { incidentId: incident.id, unitIds: selectedUnits }))}>Dispatch</button>
              </div>
            </>
          ) : (
            <p>Start a shift to receive the first report.</p>
          )}
        </div>

        <div className="panel map">
          <h2>Spatial View</h2>
          <div className="map-plane">
            {units.map((unit) => (
              <div
                key={unit.id}
                className={`map-unit ${unit.status}`}
                style={{
                  left: `${20 + ((unit.location.lon * 1000) % 60)}%`,
                  top: `${20 + ((unit.location.lat * 1000) % 60)}%`
                }}
                title={`${unit.callSign}: ${unit.status}`}
              >
                {unit.callSign}
              </div>
            ))}
            {incident ? <div className="map-incident">INC</div> : null}
          </div>
        </div>

        <div className="panel units">
          <h2>Units</h2>
          {units.map((unit) => (
            <UnitRow
              key={unit.id}
              unit={unit}
              selected={selectedUnits.includes(unit.id)}
              onToggle={() => setSelectedUnits((current) => (
                current.includes(unit.id) ? current.filter((id) => id !== unit.id) : [...current, unit.id]
              ))}
            />
          ))}
        </div>

        <div className="panel timeline">
          <h2>Timeline</h2>
          <ol>
            {(shift?.timeline ?? []).slice().reverse().map((event, index) => (
              <li key={`${event.at}-${event.type}-${index}`}>
                <time>{formatTime(event.at)}</time>
                <span>{event.message}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {apiState.debrief ? (
        <section className="panel debrief">
          <h2>Debrief</h2>
          {apiState.debrief.incidents.map((item) => (
            <div key={item.incidentId}>
              <strong>{item.hiddenTruth}</strong>
              <span> classified {item.selectedCode}-{item.selectedPriority}; controlled {formatTime(item.controlledAt)}; first arrival {formatTime(item.firstArrivalAt)}</span>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
