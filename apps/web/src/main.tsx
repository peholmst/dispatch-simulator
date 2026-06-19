import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import type { IncidentSimulationState, ScheduledIncidentReport, ShiftDebrief, ShiftState, UnitSimulationState } from "@dispatch-simulator/shared";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

interface ApiState {
  shift?: ShiftState;
  debrief?: ShiftDebrief;
  completedShiftSummaries?: CompletedShiftSummary[];
}

interface CompletedShiftSummary {
  id: string;
  seed: string;
  configVersion: string;
  regionVersion: string;
  startedAt: number;
  finishedAt: number;
  score: number;
  maxScore: number;
  percentage: number;
  incidentCount: number;
}

type MapFeature = {
  type: "Feature";
  properties: Record<string, string | boolean>;
  geometry: {
    type: "Point" | "LineString";
    coordinates: number[] | number[][];
  };
};

interface MapFeatureCollection {
  type: "FeatureCollection";
  features: MapFeature[];
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
  return (
    <label className={`unit-row ${selected ? "selected" : ""}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <span className="callsign">{unit.callSign}</span>
      <span>{unit.status.replaceAll("_", " ")}</span>
      <span>{unit.arrivalAt ? `ETA ${formatTime(unit.arrivalAt)}` : ""}</span>
    </label>
  );
}

function IncidentQueue({ incidents, activeIncidentId, onSelect }: {
  incidents: IncidentSimulationState[];
  activeIncidentId?: string;
  onSelect: (incidentId: string) => void;
}) {
  return (
    <div className="incident-queue">
      {incidents.map((item) => (
        <button
          key={item.id}
          className={`queue-item ${item.id === activeIncidentId ? "active" : ""}`}
          onClick={() => onSelect(item.id)}
        >
          <span>{item.displayName}</span>
          <small>{item.status.replaceAll("_", " ")} · {item.reportedAt === undefined ? `due ${formatTime(item.reportDueAt)}` : formatTime(item.reportedAt)}</small>
        </button>
      ))}
    </div>
  );
}

function ReportRow({ report, linked, split, onLink, onSplit }: {
  report: ScheduledIncidentReport;
  linked: boolean;
  split: boolean;
  onLink: () => void;
  onSplit: () => void;
}) {
  const delivered = report.deliveredAt !== undefined;
  return (
    <div className={`report-row ${delivered ? "" : "pending"}`}>
      <div>
        <strong>{delivered ? formatTime(report.deliveredAt) : `Due ${formatTime(report.dueAt)}`}</strong>
        <p>{report.text}</p>
      </div>
      <div className="report-actions">
        <button disabled={!delivered || linked || split} onClick={onLink}>Link</button>
        <button disabled={!delivered || split} onClick={onSplit}>Split</button>
      </div>
    </div>
  );
}

function DebriefPanel({ debrief, summaries }: {
  debrief: ShiftDebrief;
  summaries: CompletedShiftSummary[];
}) {
  return (
    <section className="panel debrief">
      <div className="debrief-header">
        <div>
          <h2>Debrief</h2>
          <p>Seed {debrief.seed} - {debrief.configVersion} - {debrief.regionVersion}</p>
        </div>
        <strong>{debrief.percentage.toFixed(1)}%</strong>
      </div>
      <div className="scorebar" aria-label={`Shift score ${debrief.percentage.toFixed(1)} percent`}>
        <span style={{ width: `${Math.max(0, Math.min(100, debrief.percentage))}%` }} />
      </div>
      <div className="debrief-incidents">
        {debrief.incidents.map((item) => (
          <article key={item.incidentId} className="debrief-incident">
            <div className="incident-score">
              <div>
                <strong>{item.hiddenTruth}</strong>
                <p>Classified {item.selectedCode ?? "-"}-{item.selectedPriority ?? "-"}; ideal {item.idealCodes.join("/")} priority {item.idealPriorities.join("/")}</p>
              </div>
              <strong>{item.score.toFixed(1)} / {item.maxScore.toFixed(0)}</strong>
            </div>
            <div className="debrief-times">
              <span>First arrival {formatTime(item.firstArrivalAt)}</span>
              <span>Contained {formatTime(item.containedAt)}</span>
              <span>Controlled {formatTime(item.controlledAt)}</span>
              <span>Escalated {formatTime(item.escalatedAt)}</span>
              <span>Transport {item.emsTransportRequired ? formatTime(item.emsTransportCompletedAt) : "not required"}</span>
            </div>
            <div className="dimensions">
              {item.dimensions.map((dimension) => (
                <div key={dimension.id} className="dimension">
                  <div>
                    <strong>{dimension.label}</strong>
                    <span>{dimension.score.toFixed(1)} / {dimension.maxScore.toFixed(0)}</span>
                  </div>
                  <p>{dimension.explanation}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      {summaries.length > 0 ? (
        <div className="summary-strip">
          <h3>Completed Shifts</h3>
          {summaries.slice(0, 5).map((summary) => (
            <div key={summary.id}>
              <span>{summary.seed}</span>
              <strong>{summary.percentage.toFixed(1)}%</strong>
              <span>{summary.incidentCount} incidents</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap"
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm"
    }
  ]
};

function emptyFeatureCollection(): MapFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function setSourceData(map: maplibregl.Map, sourceId: string, data: MapFeatureCollection): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

function MapView({ shift, activeIncidentId }: {
  shift?: ShiftState;
  activeIncidentId?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const bounds = shift?.config.region.bounds;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const center: [number, number] = bounds
      ? [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
      : [23.76, 61.49];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center,
      zoom: 11,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("routes", { type: "geojson", data: emptyFeatureCollection() });
      map.addSource("points", { type: "geojson", data: emptyFeatureCollection() });
      map.addLayer({
        id: "routes",
        type: "line",
        source: "routes",
        paint: {
          "line-color": ["case", ["==", ["get", "active"], true], "#c94f39", "#5279bd"],
          "line-width": ["case", ["==", ["get", "active"], true], 4, 2],
          "line-opacity": 0.82
        }
      });
      map.addLayer({
        id: "points",
        type: "circle",
        source: "points",
        paint: {
          "circle-color": [
            "match",
            ["get", "kind"],
            "station", "#315d8a",
            "hospital", "#7b4ba0",
            "incident", "#c94f39",
            "unit", "#1f6f5b",
            "#17211b"
          ],
          "circle-radius": [
            "match",
            ["get", "kind"],
            "unit", 6,
            "incident", 8,
            5
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });
      map.addLayer({
        id: "point-labels",
        type: "symbol",
        source: "points",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top"
        },
        paint: {
          "text-color": "#17211b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2
        }
      });
      setMapLoaded(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [bounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds) {
      return;
    }
    const regionBounds: LngLatBoundsLike = [[bounds.west, bounds.south], [bounds.east, bounds.north]];
    map.fitBounds(regionBounds, { padding: 32, duration: 0 });
  }, [bounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !shift || !mapLoaded) {
      return;
    }

    const points: MapFeature[] = [
      ...shift.config.stations.map((station) => ({
        type: "Feature" as const,
        properties: { kind: "station", label: station.id.replace("station_", "S") },
        geometry: { type: "Point" as const, coordinates: [station.coordinates.lon, station.coordinates.lat] }
      })),
      ...shift.config.hospitals.map((hospital) => ({
        type: "Feature" as const,
        properties: { kind: "hospital", label: hospital.id },
        geometry: { type: "Point" as const, coordinates: [hospital.coordinates.lon, hospital.coordinates.lat] }
      })),
      ...shift.incidents.filter((incidentItem) => incidentItem.reportedAt !== undefined).map((incidentItem) => ({
        type: "Feature" as const,
        properties: {
          kind: "incident",
          label: incidentItem.id === activeIncidentId ? "Active" : incidentItem.displayName
        },
        geometry: { type: "Point" as const, coordinates: [incidentItem.location.lon, incidentItem.location.lat] }
      })),
      ...Object.values(shift.units).map((unit) => ({
        type: "Feature" as const,
        properties: { kind: "unit", label: unit.callSign },
        geometry: { type: "Point" as const, coordinates: [unit.location.lon, unit.location.lat] }
      }))
    ];

    const routes: MapFeature[] = Object.values(shift.units)
      .filter((unit) => unit.route && unit.status === "en_route")
      .map((unit) => ({
        type: "Feature" as const,
        properties: { active: unit.incidentId === activeIncidentId, unitId: unit.id },
        geometry: {
          type: "LineString" as const,
          coordinates: unit.route!.geometry.map((point) => [point.lon, point.lat])
        }
      }));

    setSourceData(map, "points", { type: "FeatureCollection", features: points });
    setSourceData(map, "routes", { type: "FeatureCollection", features: routes });
  }, [activeIncidentId, mapLoaded, shift]);

  return <div ref={containerRef} className="map-canvas" />;
}

function App() {
  const [apiState, setApiState] = useState<ApiState>({});
  const [seed, setSeed] = useState("demo-shift");
  const [code, setCode] = useState("704");
  const [priority, setPriority] = useState("B");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string>();
  const [error, setError] = useState<string>();

  const shift = apiState.shift;
  const incident = shift?.incidents.find((candidate) => candidate.id === activeIncidentId) ?? shift?.incidents[0];
  const dispatchCode = shift?.config.dispatchCodes.find((candidate) => candidate.id === code);
  const validPriorities = dispatchCode?.validPriorities ?? [];
  const units = useMemo(() => Object.values(shift?.units ?? {}), [shift]);
  const selectedUnitStates = selectedUnits.map((unitId) => shift?.units[unitId]).filter((unit): unit is UnitSimulationState => Boolean(unit));
  const canManualDispatch = Boolean(incident && selectedUnitStates.some((unit) => unit.status === "available_at_station" || unit.status === "available_mobile"));
  const canHold = selectedUnitStates.some((unit) => unit.status === "available_at_station" || unit.status === "available_mobile");
  const canReleaseHeld = selectedUnitStates.some((unit) => unit.status === "held");
  const canRecall = selectedUnitStates.some((unit) => ["en_route", "on_scene", "committed_on_scene", "recovering"].includes(unit.status));

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
    if (shift?.incidents.length && (!activeIncidentId || !shift.incidents.some((item) => item.id === activeIncidentId))) {
      setActiveIncidentId(shift.incidents[0]!.id);
    }
  }, [activeIncidentId, shift]);

  return (
    <main className="shell">
      <section className="toolbar">
        <div>
          <h1>Dispatch Simulator</h1>
          <p>{shift ? `Shift ${shift.status} at ${formatTime(shift.clock.now)}` : "No active shift"}</p>
        </div>
        <input value={seed} onChange={(event) => setSeed(event.target.value)} aria-label="Seed" />
        <button onClick={() => run(async () => {
          const next = await post<ApiState>("/api/shift/start", { seed });
          setActiveIncidentId(next.shift?.incidents[0]?.id);
          setSelectedUnits([]);
          return next;
        })}>Start</button>
        <button disabled={!shift || shift.status === "finished"} onClick={() => run(() => post("/api/shift/advance", { seconds: 60 }))}>+1 min</button>
        <button disabled={!shift || shift.status === "finished"} onClick={() => run(() => post("/api/shift/finish"))}>Finish</button>
      </section>

      {error ? <div className="error">{error}</div> : null}

      <section className="grid">
        <div className="panel incident">
          <h2>Incidents</h2>
          {shift ? <IncidentQueue incidents={shift.incidents} activeIncidentId={incident?.id} onSelect={setActiveIncidentId} /> : null}
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
                <button disabled={!canManualDispatch} onClick={() => run(() => post("/api/shift/dispatch", { incidentId: incident.id, unitIds: selectedUnits }))}>Dispatch</button>
                <button disabled={!canHold} onClick={() => run(() => post("/api/shift/hold", { unitIds: selectedUnits }))}>Hold</button>
                <button disabled={!canReleaseHeld} onClick={() => run(() => post("/api/shift/release-held", { unitIds: selectedUnits }))}>Release</button>
                <button disabled={!canRecall} onClick={() => run(() => post("/api/shift/recall", { unitIds: selectedUnits }))}>Recall</button>
                <button disabled={!incident || !canRecall} onClick={() => run(() => post("/api/shift/reroute", { incidentId: incident.id, unitIds: selectedUnits }))}>Reroute</button>
              </div>
              <div className="reports">
                <h3>Reports</h3>
                <ReportRow
                  report={{ id: "initial", dueAt: incident.reportDueAt, deliveredAt: incident.reportedAt, text: incident.reportText ?? "" }}
                  linked
                  split
                  onLink={() => undefined}
                  onSplit={() => undefined}
                />
                {(incident.duplicateReports ?? []).map((report) => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    linked={(incident.linkedReportIds ?? []).includes(report.id)}
                    split={Boolean(shift?.incidents.some((item) => item.splitFromReportId === report.id))}
                    onLink={() => run(() => post("/api/shift/link-report", { incidentId: incident.id, reportId: report.id }))}
                    onSplit={() => run(() => post("/api/shift/split-report", { incidentId: incident.id, reportId: report.id }))}
                  />
                ))}
              </div>
            </>
          ) : (
            <p>Start a shift to receive the first report.</p>
          )}
        </div>

        <div className="panel map">
          <h2>Spatial View</h2>
          <MapView shift={shift} activeIncidentId={incident?.id} />
        </div>

        <div className="panel units">
          <h2>Units</h2>
          <div className="unit-summary">
            <span>{selectedUnits.length} selected</span>
            <button disabled={selectedUnits.length === 0} onClick={() => setSelectedUnits([])}>Clear</button>
          </div>
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

      {apiState.debrief ? <DebriefPanel debrief={apiState.debrief} summaries={apiState.completedShiftSummaries ?? []} /> : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
