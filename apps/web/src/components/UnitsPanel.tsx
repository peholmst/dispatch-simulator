import type { IncidentSimulationState, UnitSimulationState } from "@dispatch-simulator/shared";
import { post } from "../api";
import type { ApiState, UnitMapFocusRequest } from "../types";
import { UnitRow } from "./UnitRow";

export function UnitsPanel({ units, incident, selectedUnits, now, canManualDispatch, canHold, canReleaseHeld, canRecall, onClearSelection, onToggleUnit, onFocusUnit, run }: {
  units: UnitSimulationState[];
  incident?: IncidentSimulationState;
  selectedUnits: string[];
  now?: number;
  canManualDispatch: boolean;
  canHold: boolean;
  canReleaseHeld: boolean;
  canRecall: boolean;
  onClearSelection: () => void;
  onToggleUnit: (unitId: string) => void;
  onFocusUnit: (request: UnitMapFocusRequest) => void;
  run: (action: () => Promise<ApiState>) => Promise<void>;
}) {
  return (
    <div className="panel units">
      <h2>Units</h2>
      <div className="unit-summary">
        <span>{selectedUnits.length} selected</span>
        <button disabled={selectedUnits.length === 0} onClick={onClearSelection}>Clear</button>
      </div>
      <div className="unit-actions">
        <button disabled={!canManualDispatch} onClick={() => incident && run(() => post("/api/shift/dispatch", { incidentId: incident.id, unitIds: selectedUnits }))}>Dispatch</button>
        <button disabled={!canHold} onClick={() => run(() => post("/api/shift/hold", { unitIds: selectedUnits }))}>Hold</button>
        <button disabled={!canReleaseHeld} onClick={() => run(() => post("/api/shift/release-held", { unitIds: selectedUnits }))}>Release</button>
        <button disabled={!canRecall} onClick={() => run(() => post("/api/shift/recall", { unitIds: selectedUnits }))}>Recall</button>
        <button disabled={!incident || !canRecall} onClick={() => incident && run(() => post("/api/shift/reroute", { incidentId: incident.id, unitIds: selectedUnits }))}>Reroute</button>
      </div>
      <div className="unit-list">
        {units.map((unit) => (
          <UnitRow
            key={unit.id}
            unit={unit}
            selected={selectedUnits.includes(unit.id)}
            onToggle={() => onToggleUnit(unit.id)}
            now={now}
            onShow={() => onFocusUnit({ unitId: unit.id, token: Date.now() })}
          />
        ))}
      </div>
    </div>
  );
}
