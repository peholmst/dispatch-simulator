import type { ScheduledIncidentReport } from "@dispatch-simulator/shared";
import { formatTime } from "../format";

export function ReportRow({ report, linked, split, onLink, onSplit }: {
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
