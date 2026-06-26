import type { LoadedConfig, ShiftState } from "@dispatch-simulator/shared";
import { formatTime } from "../format";

export function Toolbar({ shift, config, seed, scenarioId, paused, onSeedChange, onScenarioChange, onStart, onPauseToggle, onSpeedChange, onAdvanceMinute, onFinish }: {
  shift?: ShiftState;
  config?: LoadedConfig;
  seed: string;
  scenarioId: string;
  paused: boolean;
  onSeedChange: (seed: string) => void;
  onScenarioChange: (scenarioId: string, seed?: string) => void;
  onStart: () => void;
  onPauseToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onAdvanceMinute: () => void;
  onFinish: () => void;
}) {
  const scenarios = config?.trainingScenarios ?? [];
  return (
    <section className="toolbar">
      <div>
        <h1>Dispatch Simulator</h1>
        <p>{shift ? `Shift ${shift.status}` : "No active shift"}</p>
        {shift && shift.status === "active" ? (
          <output className="shift-clock" aria-label="Shift clock">{formatTime(shift.clock.now)}</output>
        ) : null}
      </div>
      <input value={seed} onChange={(event) => onSeedChange(event.target.value)} aria-label="Seed" />
      <select value={scenarioId} onChange={(event) => {
        const nextScenarioId = event.target.value;
        const scenario = scenarios.find((candidate) => candidate.id === nextScenarioId);
        onScenarioChange(nextScenarioId, scenario?.seed);
      }} aria-label="Training scenario">
        <option value="">Random shift</option>
        {scenarios.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {config?.locale[scenario.localizationKey] ?? scenario.id}
          </option>
        ))}
      </select>
      <button onClick={onStart}>Start</button>
      <button disabled={!shift || shift.status === "finished"} onClick={onPauseToggle}>
        {paused ? "Resume" : "Pause"}
      </button>
      <select
        disabled={!shift || shift.status === "finished"}
        value={shift?.clock.speed ?? 1}
        onChange={(event) => onSpeedChange(Number(event.target.value))}
        aria-label="Simulation speed"
      >
        {[0.5, 1, 2, 4, 8].map((speedOption) => (
          <option key={speedOption} value={speedOption}>{speedOption}x</option>
        ))}
      </select>
      <button disabled={!shift || shift.status === "finished"} onClick={onAdvanceMinute}>+1 min</button>
      <button disabled={!shift || shift.status === "finished"} onClick={onFinish}>Finish</button>
    </section>
  );
}
