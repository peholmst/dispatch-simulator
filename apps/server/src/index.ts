import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  advanceSimulation,
  classifyIncident,
  createDebrief,
  dispatchSuggestedUnits,
  dispatchUnits,
  finishShift,
  holdUnits,
  linkReport,
  loadConfig,
  recallUnits,
  releaseHeldUnits,
  rerouteUnits,
  splitReport,
  startShift,
  type ShiftDebrief,
  type ShiftState
} from "@dispatch-simulator/shared";

interface StartBody {
  seed?: string;
}

interface AdvanceBody {
  seconds?: number;
}

interface ClassifyBody {
  incidentId: string;
  code: string;
  priority: string;
}

interface DispatchBody {
  incidentId: string;
  unitIds: string[];
}

interface UnitsBody {
  unitIds: string[];
}

interface ReportBody {
  incidentId: string;
  reportId: string;
}

type SocketClient = {
  send(payload: string): void;
};

interface CompletedShiftSummary {
  id: string;
  seed: string;
  configVersion: string;
  regionVersion: string;
  startedAt: number;
  finishedAt: number;
  score: number;
  maxScore: number;
  percentage: number;
  incidentCount: number;
}

function summaryFromDebrief(debrief: ShiftDebrief): CompletedShiftSummary {
  return {
    id: `${debrief.seed}-${debrief.finishedAt}`,
    seed: debrief.seed,
    configVersion: debrief.configVersion,
    regionVersion: debrief.regionVersion,
    startedAt: debrief.startedAt,
    finishedAt: debrief.finishedAt,
    score: debrief.score,
    maxScore: debrief.maxScore,
    percentage: debrief.percentage,
    incidentCount: debrief.incidents.length
  };
}

export async function createServer() {
  const app = Fastify({ logger: true });
  await app.register(websocket);

  const config = await loadConfig(process.cwd());
  const clients = new Set<SocketClient>();
  const summaryPath = path.join(process.cwd(), "apps", "server", "data", "shift-summaries.json");
  let shift: ShiftState | undefined;
  let completedShiftSummaries: CompletedShiftSummary[] = [];

  async function loadSummaries(): Promise<void> {
    try {
      completedShiftSummaries = JSON.parse(await readFile(summaryPath, "utf8")) as CompletedShiftSummary[];
    } catch {
      completedShiftSummaries = [];
    }
  }

  async function persistSummary(debrief: ShiftDebrief): Promise<void> {
    const summary = summaryFromDebrief(debrief);
    completedShiftSummaries = [
      summary,
      ...completedShiftSummaries.filter((candidate) => candidate.id !== summary.id)
    ].slice(0, 50);
    await mkdir(path.dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, `${JSON.stringify(completedShiftSummaries, null, 2)}\n`, "utf8");
  }

  await loadSummaries();

  function publicState() {
    return {
      shift,
      debrief: shift?.status === "finished" ? createDebrief(shift) : undefined,
      completedShiftSummaries
    };
  }

  function broadcast(): void {
    const payload = JSON.stringify({ type: "state", payload: publicState() });
    for (const client of clients) {
      client.send(payload);
    }
  }

  function requireShift(): ShiftState {
    if (!shift) {
      shift = startShift(config, { seed: "demo-shift", startTimeSeconds: 0 });
    }
    return shift;
  }

  app.get("/health", async () => ({ ok: true }));
  app.get("/shift", async () => publicState());
  app.get("/shift/summaries", async () => completedShiftSummaries);

  app.post<{ Body: StartBody }>("/shift/start", async (request) => {
    shift = startShift(config, {
      seed: request.body?.seed?.trim() || `demo-${Date.now()}`,
      startTimeSeconds: 0
    });
    broadcast();
    return publicState();
  });

  app.post<{ Body: AdvanceBody }>("/shift/advance", async (request) => {
    shift = advanceSimulation(requireShift(), request.body?.seconds ?? 60);
    broadcast();
    return publicState();
  });

  app.post<{ Body: ClassifyBody }>("/shift/classify", async (request) => {
    shift = classifyIncident(requireShift(), request.body.incidentId, request.body.code, request.body.priority);
    broadcast();
    return publicState();
  });

  app.post<{ Body: DispatchBody }>("/shift/dispatch", async (request) => {
    shift = dispatchUnits(requireShift(), request.body);
    broadcast();
    return publicState();
  });

  app.post<{ Body: UnitsBody }>("/shift/hold", async (request) => {
    shift = holdUnits(requireShift(), request.body.unitIds);
    broadcast();
    return publicState();
  });

  app.post<{ Body: UnitsBody }>("/shift/release-held", async (request) => {
    shift = releaseHeldUnits(requireShift(), request.body.unitIds);
    broadcast();
    return publicState();
  });

  app.post<{ Body: UnitsBody }>("/shift/recall", async (request) => {
    shift = recallUnits(requireShift(), request.body.unitIds);
    broadcast();
    return publicState();
  });

  app.post<{ Body: DispatchBody }>("/shift/reroute", async (request) => {
    shift = rerouteUnits(requireShift(), request.body);
    broadcast();
    return publicState();
  });

  app.post<{ Body: ReportBody }>("/shift/link-report", async (request) => {
    shift = linkReport(requireShift(), request.body);
    broadcast();
    return publicState();
  });

  app.post<{ Body: ReportBody }>("/shift/split-report", async (request) => {
    shift = splitReport(requireShift(), request.body);
    broadcast();
    return publicState();
  });

  app.post<{ Body: { incidentId: string } }>("/shift/dispatch-suggested", async (request) => {
    shift = dispatchSuggestedUnits(requireShift(), request.body.incidentId);
    broadcast();
    return publicState();
  });

  app.post("/shift/finish", async () => {
    const wasFinished = requireShift().status === "finished";
    shift = finishShift(requireShift());
    if (!wasFinished) {
      await persistSummary(createDebrief(shift));
    }
    broadcast();
    return publicState();
  });

  app.get("/shift/debrief", async () => createDebrief(finishShift(requireShift())));

  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify({ type: "state", payload: publicState() }));
    socket.on("close", () => clients.delete(socket));
  });

  return app;
}

const entrypoint = process.argv[1]?.replace(/\\/g, "/");

if (entrypoint?.endsWith("/src/index.ts") || entrypoint?.endsWith("/dist/index.js")) {
  const app = await createServer();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "127.0.0.1" });
}
