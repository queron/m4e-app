import { spawn } from "node:child_process";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const CLIENT_ROUTE_BUNDLE_BUDGET_BYTES = 800 * 1024;
const API_CARDS_RESPONSE_BUDGET_BYTES = 7 * 1024 * 1024;
const HOST = "127.0.0.1";
const PORT = Number(process.env.SIZE_BUDGET_PORT ?? 3211);
const BASE_URL = `http://${HOST}:${PORT}`;
const manifestPath = path.join(process.cwd(), ".next", "server", "app", "page", "build-manifest.json");

const routeBundleBytes = await measureRouteBundle();
console.log(`Client route bundle size: ${formatBytes(routeBundleBytes)} (budget ${formatBytes(CLIENT_ROUTE_BUNDLE_BUDGET_BYTES)})`);

if (routeBundleBytes > CLIENT_ROUTE_BUNDLE_BUDGET_BYTES) {
  throw new Error(`Client route bundle exceeds budget: ${formatBytes(routeBundleBytes)} > ${formatBytes(CLIENT_ROUTE_BUNDLE_BUDGET_BYTES)}`);
}

const apiCardsBytes = await measureApiCardsResponse();
console.log(`/api/cards response size: ${formatBytes(apiCardsBytes)} (budget ${formatBytes(API_CARDS_RESPONSE_BUDGET_BYTES)})`);

if (apiCardsBytes > API_CARDS_RESPONSE_BUDGET_BYTES) {
  throw new Error(`/api/cards response exceeds budget: ${formatBytes(apiCardsBytes)} > ${formatBytes(API_CARDS_RESPONSE_BUDGET_BYTES)}`);
}

async function measureRouteBundle() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const files = new Set([...(manifest.rootMainFiles ?? []), ...(manifest.pages?.["/"] ?? [])]);
  let total = 0;

  for (const file of files) {
    const fullPath = path.join(process.cwd(), ".next", file);
    total += (await stat(fullPath)).size;
  }

  return total;
}

async function measureApiCardsResponse() {
  const server = startServer();

  try {
    await waitForServer(server);
    const response = await fetch(`${BASE_URL}/api/cards`);
    if (!response.ok) throw new Error(`/api/cards returned ${response.status}: ${await response.text()}`);
    const text = await response.text();
    return new TextEncoder().encode(text).length;
  } finally {
    stopServer(server);
  }
}

function startServer() {
  const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run start -- --hostname ${HOST} --port ${PORT}`]
      : ["run", "start", "--", "--hostname", HOST, "--port", String(PORT)];

  return spawn(command, args, {
    env: {
      ...process.env,
      PORT: String(PORT)
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitForServer(server) {
  const started = performance.now();
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  while (performance.now() - started < 30_000) {
    if (server.exitCode !== null) throw new Error(`Next server exited before size budget check.\n${output}`);

    try {
      const response = await fetch(`${BASE_URL}/api/cards`);
      if (response.ok) return;
    } catch {
      await delay(500);
    }
  }

  throw new Error(`Timed out waiting for size budget server.\n${output}`);
}

function stopServer(server) {
  if (!server.pid) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore"
    });
    return;
  }

  process.kill(-server.pid);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes) {
  return `${Math.round(bytes / 1024)} KiB`;
}
