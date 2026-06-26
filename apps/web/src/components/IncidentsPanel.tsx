import type { IncidentSimulationState, LoadedConfig, ShiftState } from "@dispatch-simulator/shared";
import type { ApiState } from "../types";
import { IncidentDetailPane } from "./IncidentDetailPane";
import { IncidentQueue } from "./IncidentQueue";

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
      <IncidentDetailPane
        shift={shift}
        incident={incident}
        incidentLocation={incidentLocation}
        code={code}
        priority={priority}
        validPriorities={validPriorities}
        onCodeChange={onCodeChange}
        onPriorityChange={onPriorityChange}
        run={run}
      />
    </div>
  );
}
