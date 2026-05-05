import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

const HOST = "127.0.0.1";
const PORT = Number(process.env.BENCHMARK_PORT ?? 3210);
const BASE_URL = `http://${HOST}:${PORT}`;
const STARTUP_TIMEOUT_MS = 30_000;
const ANALYSIS_THRESHOLD_MS = 3_000;

const serverCommand = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
const serverArgs =
  process.platform === "win32"
    ? ["/d", "/s", "/c", `npm run start -- --hostname ${HOST} --port ${PORT}`]
    : ["run", "start", "--", "--hostname", HOST, "--port", String(PORT)];

const server = spawn(
  serverCommand,
  serverArgs,
  {
    env: {
      ...process.env,
      PORT: String(PORT)
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer();
  const catalog = await getJson("/api/cards");
  const [playerMaster, opponentMaster] = catalog.masters;

  if (!playerMaster || !opponentMaster) {
    throw new Error("Benchmark needs at least two masters in the card catalog.");
  }

  const opponentModelIds = catalog.models
    .filter((model) => !model.isMaster && model.cost > 0)
    .slice(0, 50)
    .map((model) => model.id);

  const request = {
    playerFaction: playerMaster.faction,
    playerMasterId: playerMaster.id,
    opponentFaction: opponentMaster.faction,
    opponentMasterId: opponentMaster.id,
    ownedModelIds: [],
    opponentModelIds,
    pointLimit: 50,
    modelLimit: 99,
    strategyPoolId: "gg-zero",
    strategyId: "plant-explosives",
    schemePoolId: "gg-zero"
  };

  const started = performance.now();
  const response = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  const elapsedMs = performance.now() - started;

  if (!response.ok) {
    throw new Error(`Analysis benchmark request failed with ${response.status}: ${await response.text()}`);
  }

  if (elapsedMs > ANALYSIS_THRESHOLD_MS) {
    throw new Error(`Full-pool analysis took ${Math.round(elapsedMs)}ms, above the ${ANALYSIS_THRESHOLD_MS}ms threshold.`);
  }

  console.log(`Full-pool analysis benchmark completed in ${Math.round(elapsedMs)}ms (threshold ${ANALYSIS_THRESHOLD_MS}ms).`);
} finally {
  stopServer();
}

async function waitForServer() {
  const started = performance.now();

  while (performance.now() - started < STARTUP_TIMEOUT_MS) {
    if (server.exitCode !== null) {
      throw new Error(`Next server exited before benchmark could run.\n${serverOutput}`);
    }

    try {
      const response = await fetch(`${BASE_URL}/api/cards`);
      if (response.ok) return;
    } catch {
      await delay(500);
    }
  }

  throw new Error(`Timed out waiting for benchmark server.\n${serverOutput}`);
}

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopServer() {
  if (!server.pid) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore"
    });
    return;
  }

  process.kill(-server.pid);
}
