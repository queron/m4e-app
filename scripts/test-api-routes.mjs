import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const HOST = "127.0.0.1";
const PORT = Number(process.env.API_TEST_PORT ?? 3212);
const BASE_URL = `http://${HOST}:${PORT}`;

const server = startServer();

try {
  await waitForServer(server);
  const catalog = await getJson("/api/cards");

  assert.ok(Array.isArray(catalog.models), "/api/cards exposes models");
  assert.ok(Array.isArray(catalog.masters), "/api/cards exposes masters");
  assert.ok(Array.isArray(catalog.factions), "/api/cards exposes factions");

  const [playerMaster, opponentMaster] = catalog.masters;
  const model = catalog.models.find((candidate) => !candidate.isMaster && candidate.cost > 0);
  assert.ok(playerMaster, "test catalog has player master");
  assert.ok(opponentMaster, "test catalog has opponent master");
  assert.ok(model, "test catalog has hireable model");
  assert.equal(model.rulesText, "", "/api/cards default response omits full rules text");
  assert.ok(model.abilities.every((ability) => !ability.text), "/api/cards default response omits ability text");
  assert.ok(model.actions.every((action) => !action.effect && !action.triggers), "/api/cards default response omits action effects and triggers");

  const modelDetail = await getJson(`/api/cards/${encodeURIComponent(model.id)}`);
  assert.equal(modelDetail.id, model.id, "/api/cards/[id] returns requested model");
  assert.ok(
    modelDetail.rulesText || modelDetail.abilities.some((ability) => ability.text) || modelDetail.actions.some((action) => action.effect),
    "/api/cards/[id] returns full model detail"
  );

  await expectGetStatus(`/api/cards/${encodeURIComponent("unknown-model")}`, 404, (body) => {
    assert.equal(body.error, "Model was not found in the card catalog.");
  });

  await expectStatus("/api/analyze", "{", 400, (body) => {
    assert.equal(body.error, "Request body must be valid JSON.");
  });

  await expectStatus(
    "/api/analyze",
    {
      playerMasterId: "unknown-master",
      opponentMasterId: opponentMaster.id,
      pointLimit: 50,
      ownedModelIds: [],
      opponentModelIds: []
    },
    422,
    (body) => {
      assert.equal(body.error, "Analyze request contains invalid input.");
      assert.ok(body.details.some((detail) => detail.includes("playerMasterId")));
    }
  );

  await expectStatus(
    "/api/analyze",
    {
      playerMasterId: playerMaster.id,
      opponentMasterId: opponentMaster.id,
      pointLimit: 151,
      ownedModelIds: [],
      opponentModelIds: []
    },
    422,
    (body) => {
      assert.ok(body.details.some((detail) => detail.includes("pointLimit")));
    }
  );

  await expectStatus(
    "/api/analyze",
    {
      playerMasterId: playerMaster.id,
      opponentMasterId: opponentMaster.id,
      pointLimit: 50,
      ownedModelIds: Array.from({ length: 501 }, () => model.id),
      opponentModelIds: []
    },
    422,
    (body) => {
      assert.ok(body.details.some((detail) => detail.includes("ownedModelIds")));
    }
  );

  await expectStatus(
    "/api/analyze",
    {
      playerFaction: playerMaster.faction,
      playerMasterId: playerMaster.id,
      opponentFaction: opponentMaster.faction,
      opponentMasterId: opponentMaster.id,
      pointLimit: 50,
      ownedModelIds: [model.id, model.id],
      opponentModelIds: []
    },
    200,
    (body) => {
      assert.ok(body.generatedAt, "analyze response has generatedAt");
      assert.equal(body.playerCrew.master.id, playerMaster.id);
      assert.ok(body.paths.available.models.length <= 1, "duplicate owned IDs are normalized before analysis");
    }
  );

  await expectStatus(
    "/api/evaluate",
    {
      playerMasterId: playerMaster.id,
      opponentMasterId: opponentMaster.id,
      modelId: "unknown-model"
    },
    422,
    (body) => {
      assert.ok(body.details.some((detail) => detail.includes("modelId")));
    }
  );

  await expectStatus(
    "/api/evaluate",
    {
      playerMasterId: playerMaster.id,
      opponentMasterId: opponentMaster.id,
      modelId: model.id,
      opponentModelIds: [model.id, model.id]
    },
    200,
    (body) => {
      assert.equal(body.modelId, model.id);
      assert.equal(typeof body.legal, "boolean");
      assert.ok(Array.isArray(body.whyHelps));
    }
  );

  console.log("API route integration tests passed.");
} finally {
  stopServer(server);
}

async function expectStatus(path, body, expectedStatus, assertBody) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  assert.equal(response.status, expectedStatus, `${path} expected ${expectedStatus}, got ${response.status}: ${text}`);
  assertBody(parsed);
}

async function expectGetStatus(path, expectedStatus, assertBody) {
  const response = await fetch(`${BASE_URL}${path}`);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  assert.equal(response.status, expectedStatus, `${path} expected ${expectedStatus}, got ${response.status}: ${text}`);
  assertBody(parsed);
}

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  assert.equal(response.status, 200, `${path} should return 200`);
  return response.json();
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
    if (server.exitCode !== null) throw new Error(`Next server exited before API tests.\n${output}`);

    try {
      const response = await fetch(`${BASE_URL}/api/cards`);
      if (response.ok) return;
    } catch {
      await delay(500);
    }
  }

  throw new Error(`Timed out waiting for API test server.\n${output}`);
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
