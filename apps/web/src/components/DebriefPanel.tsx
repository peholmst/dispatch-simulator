import type { ShiftDebrief } from "@dispatch-simulator/shared";
import { formatCapabilities, formatTime } from "../format";
import type { CompletedShiftSummary } from "../types";

export function DebriefPanel({ debrief, summaries }: {
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
