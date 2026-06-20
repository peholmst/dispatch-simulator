import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import type { IncidentSimulationState, LoadedConfig, ScheduledIncidentReport, ShiftDebrief, ShiftState, UnitSimulationState } from "@dispatch-simulator/shared";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  buildPointFeatures,
  buildRouteFeatures,
  emptyFeatureCollection,
  featuresAtSameLocation,
  pointFeaturesByKind,
  type MapFeature,
  type MapFeatureCollection
} from "./mapFeatures";
import "./styles.css";

interface ApiState {
  config?: LoadedConfig;
  shift?: ShiftState;
  debrief?: ShiftDebrief;
  completedShiftSummaries?: CompletedShiftSummary[];
}

interface CompletedShiftSummary {
  id: string;
  seed: string;
  scenarioId?: string;
  difficultyPresetId?: string;
  configVersion: string;
  regionVersion: string;
  startedAt: number;
  finishedAt: number;
  score: number;
  maxScore: number;
  percentage: number;
  incidentCount: number;
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

function formatCapabilities(capabilities: Record<string, number>): string {
  const entries = Object.entries(capabilities).filter(([, value]) => value > 0);
  return entries.length === 0 ? "none" : entries.map(([capability, value]) => `${capability} ${value}`).join(", ");
}

function UnitRow({ unit, selected, onToggle, onShow }: {
  unit: UnitSimulationState;
  selected: boolean;
  onToggle: () => void;
  onShow: () => void;
}) {
  return (
    <label className={`unit-row ${selected ? "selected" : ""}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <span className="callsign">{unit.callSign}</span>
      <span>{unit.status.replaceAll("_", " ")}</span>
      <span>{unit.arrivalAt ? `ETA ${formatTime(unit.arrivalAt)}` : ""}</span>
      <button type="button" className="show-unit" onClick={(event) => {
        event.preventDefault();
        onShow();
      }}>Show on map</button>
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
            <div className="debrief-details">
              <span>Control {formatCapabilities(item.controlRequires)}</span>
              <span>Containment {formatCapabilities(item.containmentRequires)}</span>
              <span>Desired {formatCapabilities(item.controlDesires)}</span>
              <span>Escalation {item.escalationPath.map((stage) => `${stage.stageId}${stage.occurred ? "*" : ""}`).join(" -> ")}</span>
              <span>{item.deteriorationReasons.length > 0 ? item.deteriorationReasons.join(" ") : "No avoidable deterioration recorded."}</span>
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

function setSourceData(map: maplibregl.Map, sourceId: string, data: MapFeatureCollection): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const interactiveMapLayers = ["unit-markers", "incident-markers", "hospital-markers", "station-markers"];

function queryPointFeatures(map: maplibregl.Map, point: maplibregl.PointLike, radius = 10): MapFeature[] {
  const pointLike = point as { x: number; y: number };
  const features = map.queryRenderedFeatures(
    [[pointLike.x - radius, pointLike.y - radius], [pointLike.x + radius, pointLike.y + radius]],
    { layers: interactiveMapLayers }
  );
  const seen = new Set<string>();
  return features.flatMap((feature) => {
    const properties = feature.properties as MapFeature["properties"] | undefined;
    if (!properties?.kind || !properties.id || feature.geometry.type !== "Point") {
      return [];
    }
    const key = `${properties.kind}:${properties.id}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [{
      type: "Feature" as const,
      properties,
      geometry: feature.geometry as MapFeature["geometry"]
    }];
  });
}

function groupRank(feature: MapFeature): number {
  switch (feature.properties.kind) {
    case "station": return 0;
    case "unit": return 1;
    case "incident": return 2;
    case "hospital": return 3;
    default: return 4;
  }
}

function sortPopupFeatures(features: MapFeature[]): MapFeature[] {
  return [...features].sort((a, b) => {
    const groupDelta = groupRank(a) - groupRank(b);
    if (groupDelta !== 0) {
      return groupDelta;
    }
    return String(a.properties.label).localeCompare(String(b.properties.label));
  });
}

function popupLngLat(features: MapFeature[]): [number, number] {
  const firstPoint = features.find((feature) => feature.geometry.type === "Point")!;
  return firstPoint.geometry.coordinates as [number, number];
}

function popupContent(features: MapFeature[], options: {
  chooser: boolean;
  selectedUnitIds: string[];
  highlightedUnitId?: string;
}): HTMLElement {
  const selected = new Set(options.selectedUnitIds);
  const container = document.createElement("div");
  container.className = "map-popup";
  const title = document.createElement("strong");
  title.textContent = features.some((feature) => feature.properties.kind === "unit") ? "Units at location" : "Map location";
  container.append(title);
  const list = document.createElement("div");
  list.className = "map-popup-list";
  for (const feature of sortPopupFeatures(features)) {
    const row = document.createElement(feature.properties.kind === "unit" && options.chooser ? "button" : "div");
    row.className = `map-popup-row ${feature.properties.kind}`;
    if (feature.properties.id === options.highlightedUnitId) {
      row.classList.add("highlighted");
    }
    if (feature.properties.kind === "unit" && options.chooser) {
      row.setAttribute("type", "button");
      row.setAttribute("data-unit-id", String(feature.properties.id));
    }
    const label = escapeHtml(feature.properties.label);
    const status = feature.properties.status ? ` <small>${escapeHtml(String(feature.properties.status).replaceAll("_", " "))}</small>` : "";
    const selectedText = feature.properties.kind === "unit" && selected.has(String(feature.properties.id)) ? " <small>selected</small>" : "";
    row.innerHTML = `<span>${label}</span>${status}${selectedText}`;
    list.append(row);
  }
  container.append(list);
  return container;
}

function createStationMarkerImage(size = 20): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#315d8a";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  const inset = 3;
  context.beginPath();
  context.rect(inset, inset, size - (inset * 2), size - (inset * 2));
  context.fill();
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

interface UnitMapFocusRequest {
  unitId: string;
  token: number;
}

function MapView({ shift, activeIncidentId, selectedUnitIds, onToggleUnit, focusRequest }: {
  shift?: ShiftState;
  activeIncidentId?: string;
  selectedUnitIds: string[];
  onToggleUnit: (unitId: string) => void;
  focusRequest?: UnitMapFocusRequest;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const popupRef = React.useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [highlightedUnitId, setHighlightedUnitId] = useState<string>();
  const bounds = shift?.config.region.bounds;
  const selectedUnitIdsKey = selectedUnitIds.join("|");

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
      if (!map.hasImage("station-marker")) {
        map.addImage("station-marker", createStationMarkerImage(), { pixelRatio: 2 });
      }
      map.addSource("routes", { type: "geojson", data: emptyFeatureCollection() });
      map.addSource("stations", { type: "geojson", data: emptyFeatureCollection() });
      map.addSource("hospitals", { type: "geojson", data: emptyFeatureCollection() });
      map.addSource("incidents", { type: "geojson", data: emptyFeatureCollection() });
      map.addSource("units", { type: "geojson", data: emptyFeatureCollection() });
      map.addLayer({
        id: "routes",
        type: "line",
        source: "routes",
        paint: {
          "line-color": ["case", ["==", ["get", "selected"], true], "#111827", ["==", ["get", "active"], true], "#c94f39", "#5279bd"],
          "line-width": ["case", ["==", ["get", "selected"], true], 5, ["==", ["get", "active"], true], 4, 2],
          "line-opacity": 0.82
        }
      });
      map.addLayer({
        id: "station-markers",
        type: "symbol",
        source: "stations",
        layout: {
          "icon-image": "station-marker",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true
        }
      });
      map.addLayer({
        id: "hospital-markers",
        type: "circle",
        source: "hospitals",
        paint: {
          "circle-color": "#7b4ba0",
          "circle-radius": 6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });
      map.addLayer({
        id: "incident-markers",
        type: "circle",
        source: "incidents",
        paint: {
          "circle-color": "#c94f39",
          "circle-radius": ["case", ["==", ["get", "active"], true], 10, 8],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });
      map.addLayer({
        id: "unit-markers",
        type: "circle",
        source: "units",
        paint: {
          "circle-color": [
            "match",
            ["get", "mapStatus"],
            "available", "#1f6f5b",
            "active", "#c94f39",
            "held", "#b77c1f",
            "unavailable", "#69736d",
            "#17211b"
          ],
          "circle-radius": ["case", ["==", ["get", "highlighted"], true], 10, ["==", ["get", "selected"], true], 8, 6],
          "circle-stroke-color": ["case", ["==", ["get", "highlighted"], true], "#f6d84d", "#ffffff"],
          "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 3, 2]
        }
      });
      map.addLayer({
        id: "station-labels",
        type: "symbol",
        source: "stations",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, 1.35],
          "text-anchor": "top",
          "text-allow-overlap": true
        },
        paint: {
          "text-color": "#17211b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2
        }
      });
      map.addLayer({
        id: "point-labels",
        type: "symbol",
        source: "units",
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
      popupRef.current?.remove();
      popupRef.current = null;
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

    const points = buildPointFeatures(shift, activeIncidentId, selectedUnitIds, highlightedUnitId);
    const routes = buildRouteFeatures(shift, activeIncidentId, selectedUnitIds);

    setSourceData(map, "stations", pointFeaturesByKind(points, "station"));
    setSourceData(map, "hospitals", pointFeaturesByKind(points, "hospital"));
    setSourceData(map, "incidents", pointFeaturesByKind(points, "incident"));
    setSourceData(map, "units", pointFeaturesByKind(points, "unit"));
    setSourceData(map, "routes", { type: "FeatureCollection", features: routes });
  }, [activeIncidentId, highlightedUnitId, mapLoaded, selectedUnitIdsKey, shift]);

  useEffect(() => {
    const currentMap = mapRef.current;
    if (!currentMap || !mapLoaded) {
      return;
    }
    const map = currentMap;

    function showPopup(features: MapFeature[], chooser: boolean, highlightedUnit?: string): void {
      if (features.length === 0) {
        popupRef.current?.remove();
        popupRef.current = null;
        return;
      }
      const content = popupContent(features, { chooser, selectedUnitIds, highlightedUnitId: highlightedUnit });
      const popup = new maplibregl.Popup({ closeButton: chooser, closeOnClick: false, offset: 14 })
        .setLngLat(popupLngLat(features))
        .setDOMContent(content)
        .addTo(map);
      popupRef.current?.remove();
      popupRef.current = popup;
      content.querySelectorAll<HTMLButtonElement>("[data-unit-id]").forEach((button) => {
        button.addEventListener("click", () => onToggleUnit(button.dataset.unitId!));
      });
    }

    function onMouseMove(event: maplibregl.MapMouseEvent): void {
      const features = queryPointFeatures(map, event.point, 10);
      map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
      if (features.length > 0) {
        showPopup(features, false);
      } else {
        popupRef.current?.remove();
        popupRef.current = null;
      }
    }

    function onMouseLeave(): void {
      map.getCanvas().style.cursor = "";
      popupRef.current?.remove();
      popupRef.current = null;
    }

    function onClick(event: maplibregl.MapMouseEvent): void {
      const features = queryPointFeatures(map, event.point, 10);
      if (features.length === 0) {
        return;
      }
      showPopup(features, true);
    }

    map.on("mousemove", onMouseMove);
    map.on("mouseleave", onMouseLeave);
    map.on("click", onClick);
    return () => {
      map.off("mousemove", onMouseMove);
      map.off("mouseleave", onMouseLeave);
      map.off("click", onClick);
    };
  }, [mapLoaded, onToggleUnit, selectedUnitIds, selectedUnitIdsKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !shift || !mapLoaded || !focusRequest) {
      return;
    }
    const unit = shift.units[focusRequest.unitId];
    if (!unit) {
      return;
    }
    const center: [number, number] = [unit.location.lon, unit.location.lat];
    setHighlightedUnitId(unit.id);
    map.easeTo({ center, zoom: Math.max(map.getZoom(), 13), duration: 350 });
    const allPoints = buildPointFeatures(shift, activeIncidentId, selectedUnitIds, unit.id);
    const colocated = featuresAtSameLocation(allPoints, center);
    const content = popupContent(colocated, { chooser: true, selectedUnitIds, highlightedUnitId: unit.id });
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 14 })
      .setLngLat(center)
      .setDOMContent(content)
      .addTo(map);
    popupRef.current?.remove();
    popupRef.current = popup;
    content.querySelectorAll<HTMLButtonElement>("[data-unit-id]").forEach((button) => {
      button.addEventListener("click", () => onToggleUnit(button.dataset.unitId!));
    });
    const timeout = window.setTimeout(() => setHighlightedUnitId((current) => current === unit.id ? undefined : current), 1600);
    return () => window.clearTimeout(timeout);
  }, [activeIncidentId, focusRequest, mapLoaded, onToggleUnit, selectedUnitIds, selectedUnitIdsKey, shift]);

  return <div ref={containerRef} className="map-canvas" />;
}

function App() {
  const [apiState, setApiState] = useState<ApiState>({});
  const [seed, setSeed] = useState("demo-shift");
  const [scenarioId, setScenarioId] = useState("");
  const [code, setCode] = useState("704");
  const [priority, setPriority] = useState("B");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string>();
  const [mapFocusRequest, setMapFocusRequest] = useState<UnitMapFocusRequest>();
  const [error, setError] = useState<string>();

  const shift = apiState.shift;
  const config = shift?.config ?? apiState.config;
  const scenarios = config?.trainingScenarios ?? [];
  const incident = shift?.incidents.find((candidate) => candidate.id === activeIncidentId) ?? shift?.incidents[0];
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
        <select value={scenarioId} onChange={(event) => {
          const nextScenarioId = event.target.value;
          setScenarioId(nextScenarioId);
          const scenario = scenarios.find((candidate) => candidate.id === nextScenarioId);
          if (scenario) {
            setSeed(scenario.seed);
          }
        }} aria-label="Training scenario">
          <option value="">Random shift</option>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {config?.locale[scenario.localizationKey] ?? scenario.id}
            </option>
          ))}
        </select>
        <button onClick={() => run(async () => {
          const next = await post<ApiState>("/api/shift/start", { seed, scenarioId: scenarioId || undefined });
          setActiveIncidentId(next.shift?.incidents[0]?.id);
          setSelectedUnits([]);
          return next;
        })}>Start</button>
        <button disabled={!shift || shift.status === "finished"} onClick={() => run(() => post("/api/shift/clock", { paused: !paused }))}>
          {paused ? "Resume" : "Pause"}
        </button>
        <select
          disabled={!shift || shift.status === "finished"}
          value={shift?.clock.speed ?? 1}
          onChange={(event) => run(() => post("/api/shift/clock", { speed: Number(event.target.value) }))}
          aria-label="Simulation speed"
        >
          {[0.5, 1, 2, 4, 8].map((speedOption) => (
            <option key={speedOption} value={speedOption}>{speedOption}x</option>
          ))}
        </select>
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
                <select aria-label="Dispatch code" value={code} onChange={(event) => setCode(event.target.value)}>
                  {shift!.config.dispatchCodes.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                </select>
                <select aria-label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
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
          <MapView
            shift={shift}
            activeIncidentId={incident?.id}
            selectedUnitIds={selectedUnits}
            onToggleUnit={toggleUnit}
            focusRequest={mapFocusRequest}
          />
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
              onToggle={() => toggleUnit(unit.id)}
              onShow={() => setMapFocusRequest({ unitId: unit.id, token: Date.now() })}
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
