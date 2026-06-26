import type { UnitSimulationState } from "@dispatch-simulator/shared";
import { formatTime } from "../format";
import { unitMapStatus } from "../mapFeatures";

export interface UnitAssignmentSummary {
  code: string;
  priority: string;
  name: string;
  address: string;
}

export function UnitRow({ unit, selected, assignment, onToggle, onShow, now }: {
  unit: UnitSimulationState;
  selected: boolean;
  assignment?: UnitAssignmentSummary;
  onToggle: () => void;
  onShow: () => void;
  now?: number;
}) {
  const etaSeconds = unit.arrivalAt === undefined || now === undefined
    ? undefined
    : Math.max(0, unit.arrivalAt - now);
  const mapStatus = unitMapStatus(unit.status);
  return (
    <label className={`unit-row ${selected ? "selected" : ""}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <span className="callsign">{unit.callSign}</span>
      <span className={`unit-status-badge ${mapStatus}`}>{unit.status.replaceAll("_", " ")}</span>
      <span className={`unit-assignment ${assignment ? "" : "empty"}`}>
        {assignment ? (
          <>
            <strong>{assignment.code}-{assignment.priority} {assignment.name}</strong>
            <small>{assignment.address}</small>
          </>
        ) : (
          <span>-</span>
        )}
      </span>
      <span>{etaSeconds !== undefined ? `ETA ${formatTime(etaSeconds)}` : ""}</span>
      <button type="button" className="show-unit" onClick={(event) => {
        event.preventDefault();
        onShow();
      }}>Show on map</button>
    </label>
  );
}
