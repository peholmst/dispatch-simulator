import type { ShiftState } from "@dispatch-simulator/shared";
import { formatTime } from "../format";

export function TimelinePanel({ shift }: {
  shift?: ShiftState;
}) {
  return (
    <section id="panel-timeline" className="timeline timeline-tab" role="tabpanel" aria-labelledby="tab-timeline">
      <ol>
        {(shift?.timeline ?? []).slice().reverse().map((event, index) => (
          <li key={`${event.at}-${event.type}-${index}`}>
            <time>{formatTime(event.at)}</time>
            <span>{event.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
