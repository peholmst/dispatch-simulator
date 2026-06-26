import type { UnitSimulationState } from "@dispatch-simulator/shared";
import { formatTime } from "../format";

export function UnitRow({ unit, selected, onToggle, onShow, now }: {
  unit: UnitSimulationState;
  selected: boolean;
  onToggle: () => void;
  onShow: () => void;
  now?: number;
}) {
  const etaSeconds = unit.arrivalAt === undefined || now === undefined
    ? undefined
    : Math.max(0, unit.arrivalAt - now);
  return (
    <label className={`unit-row ${selected ? "selected" : ""}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <span className="callsign">{unit.callSign}</span>
      <span>{unit.status.replaceAll("_", " ")}</span>
      <span>{etaSeconds !== undefined ? `ETA ${formatTime(etaSeconds)}` : ""}</span>
      <button type="button" className="show-unit" onClick={(event) => {
        event.preventDefault();
        onShow();
      }}>Show on map</button>
    </label>
  );
}
