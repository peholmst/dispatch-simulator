import type { IncidentSimulationState, LoadedConfig, ShiftState } from "@dispatch-simulator/shared";
import { post } from "../api";
import { formatCoordinates, formatTime } from "../format";
import type { ApiState } from "../types";
import { IncidentQueue } from "./IncidentQueue";
import { ReportRow } from "./ReportRow";

export function IncidentsPanel({ shift, incident, incidentLocation, code, priority, validPriorities, onSelectIncident, onCodeChange, onPriorityChange, run }: {
  shift?: ShiftState;
  incident?: IncidentSimulationState;
  incidentLocation?: LoadedConfig["spawnLocations"][number];
  code: string;
  priority: string;
  validPriorities: string[];
  onSelectIncident: (incidentId: string) => void;
  onCodeChange: (code: string) => void;
  onPriorityChange: (priority: string) => void;
  run: (action: () => Promise<ApiState>) => Promise<void>;
}) {
  return (
    <div className="panel incident">
      <div className="incident-list-pane">
        <h2>Incidents</h2>
        {shift ? <IncidentQueue incidents={shift.incidents} activeIncidentId={incident?.id} onSelect={onSelectIncident} /> : null}
      </div>
      <div className="incident-detail-pane">
        {incident ? (
          <>
            <div className="incident-detail-summary">
              <div className={`status ${incident.status}`}>{incident.status.replaceAll("_", " ")}</div>
              <p className="report">{incident.reportedAt === undefined ? `Report due ${formatTime(incident.reportDueAt)}` : incident.reportText}</p>
              <div className="incident-address">
                <strong>{incidentLocation?.address ?? formatCoordinates(incident.location)}</strong>
                <span>{incidentLocation?.locationType.replaceAll("_", " ") ?? incident.locationId}</span>
              </div>
              <p>{incident.windshieldReport ?? "Awaiting first-arrival report"}</p>
              <div className="facts">
                <span>Stage {incident.stageId}</span>
                <span>Contained {formatTime(incident.containedAt)}</span>
                <span>Controlled {formatTime(incident.controlledAt)}</span>
                <span>Escalated {formatTime(incident.escalatedAt)}</span>
              </div>
              <div className="classify">
                <select aria-label="Dispatch code" value={code} onChange={(event) => onCodeChange(event.target.value)}>
                  {shift!.config.dispatchCodes.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                </select>
                <select aria-label="Priority" value={priority} onChange={(event) => onPriorityChange(event.target.value)}>
                  {validPriorities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <button onClick={() => run(() => post("/api/shift/classify", { incidentId: incident.id, code, priority }))}>Classify</button>
                <button onClick={() => run(() => post("/api/shift/dispatch-suggested", { incidentId: incident.id }))}>Assist</button>
              </div>
            </div>
            <div className="reports">
              <h3>Reports</h3>
              <div className="reports-list">
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
            </div>
          </>
        ) : (
          <p>Start a shift to receive the first report.</p>
        )}
      </div>
    </div>
  );
}
