import React, { useEffect, useState } from "react";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import type { ShiftState } from "@dispatch-simulator/shared";
import {
  buildPointFeatures,
  buildRouteFeatures,
  emptyFeatureCollection,
  featuresAtSameLocation,
  pointFeaturesByKind,
  type MapFeature,
  type MapFeatureCollection
} from "../mapFeatures";
import type { UnitMapFocusRequest } from "../types";

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

const interactiveMapLayers = ["unit-markers", "incident-markers", "hospital-markers", "station-markers"];

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
    const labelText = feature.properties.kind === "incident" && feature.properties.name
      ? `${feature.properties.name} (${feature.properties.label})`
      : feature.properties.label;
    const label = escapeHtml(labelText);
    const status = feature.properties.status ? ` <small>${escapeHtml(String(feature.properties.status).replaceAll("_", " "))}</small>` : "";
    const address = feature.properties.kind === "incident" && feature.properties.address
      ? ` <small>${escapeHtml(feature.properties.address)}</small>`
      : "";
    const selectedText = feature.properties.kind === "unit" && selected.has(String(feature.properties.id)) ? " <small>selected</small>" : "";
    row.innerHTML = `<span>${label}</span>${status}${address}${selectedText}`;
    list.append(row);
  }
  container.append(list);
  return container;
}

function createStationMarkerImage(size = 52): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#315d8a";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 4;
  const inset = 4;
  const markerSize = size - (inset * 2);
  context.fillRect(inset, inset, markerSize, markerSize);
  context.strokeRect(inset, inset, markerSize, markerSize);
  return context.getImageData(0, 0, size, size);
}

function createIncidentMarkerImage(size = 52): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#c94f39";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 4;
  context.lineJoin = "round";
  const inset = 4;
  context.beginPath();
  context.moveTo(size / 2, inset);
  context.lineTo(size - inset, size - inset);
  context.lineTo(inset, size - inset);
  context.closePath();
  context.fill();
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

export function MapView({ shift, activeIncidentId, selectedUnitIds, onToggleUnit, focusRequest }: {
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
  const boundsKey = bounds ? `${bounds.west}|${bounds.south}|${bounds.east}|${bounds.north}` : "";
  const focusRequestToken = focusRequest?.token;
  const selectedUnitIdsKey = selectedUnitIds.join("|");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [23.76, 61.49],
      zoom: 11,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      if (!map.hasImage("station-marker")) {
        map.addImage("station-marker", createStationMarkerImage(), { pixelRatio: 2 });
      }
      if (!map.hasImage("incident-marker")) {
        map.addImage("incident-marker", createIncidentMarkerImage(), { pixelRatio: 2 });
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
        type: "symbol",
        source: "incidents",
        layout: {
          "icon-image": "incident-marker",
          "icon-size": ["case", ["==", ["get", "active"], true], 1.25, 1],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true
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
      map.addLayer({
        id: "incident-labels",
        type: "symbol",
        source: "incidents",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-allow-overlap": true
        },
        paint: {
          "text-color": "#17211b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.4
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
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds) {
      return;
    }
    const regionBounds: LngLatBoundsLike = [[bounds.west, bounds.south], [bounds.east, bounds.north]];
    map.fitBounds(regionBounds, { padding: 32, duration: 0 });
  }, [boundsKey]);

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
  }, [activeIncidentId, focusRequestToken, mapLoaded, onToggleUnit, selectedUnitIds, selectedUnitIdsKey]);

  return <div ref={containerRef} className="map-canvas" />;
}
