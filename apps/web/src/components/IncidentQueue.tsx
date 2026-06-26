import type { IncidentSimulationState } from "@dispatch-simulator/shared";
import { formatTime } from "../format";

export function IncidentQueue({ incidents, activeIncidentId, onSelect }: {
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
