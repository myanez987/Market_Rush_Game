import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { zipFunctions } from "@netlify/zip-it-and-ship-it";
import { BlobsServer } from "@netlify/blobs/server";
import { setEnvironmentContext } from "@netlify/blobs";
import { enableLocalBlobEtags } from "./local-blobs-compat.mjs";
import { unzipSync } from "fflate";

const output = resolve("artifacts/netlify-functions");
await mkdir(output, { recursive: true });
const config = { "*": { nodeBundler: "esbuild", nodeVersion: "24", nodeModuleFormat: "esm" } };
const zipped = await zipFunctions("netlify/functions", output, { config, basePath: process.cwd() });
assert.equal(zipped.length, 1);
assert.equal(zipped[0].name, "game");
assert.equal(zipped[0].runtimeAPIVersion, 2);
assert.ok((await stat(zipped[0].path)).size > 0);
assert.ok(!zipped[0].routes?.length, "No custom route should override the standard endpoint");

const temp = await mkdtemp(join(tmpdir(), "market-rush-function-"));
enableLocalBlobEtags(BlobsServer);
const server = new BlobsServer({ directory: join(temp, "blobs") });
const realNow = Date.now;
try {
  // Execute the exact archive, not an independently built approximation.
  const extracted = join(temp, "bundle");
  for (const [name, bytes] of Object.entries(unzipSync(await readFile(zipped[0].path)))) {
    const path = resolve(extracted, name);
    assert.ok(path.startsWith(extracted + "/") || path.startsWith(extracted + "\\"));
    if (name.endsWith("/")) { await mkdir(path, { recursive: true }); continue; }
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  }
  const entry = join(extracted, "netlify/functions/game.mjs");
  assert.ok((await stat(entry)).isFile(), "Bundled function entry must exist");
  const { port } = await server.start();
  setEnvironmentContext({ siteID: "packaged-function-test", token: "local-only", edgeURL: `http://localhost:${port}`, uncachedEdgeURL: `http://localhost:${port}` });
  const module = await import(pathToFileURL(entry).href);
  assert.equal(typeof module.default, "function");
  async function call(action, payload = {}, credential, code) {
    const res = await module.default(new Request("http://localhost/.netlify/functions/game", { method: "POST",
      headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
      body: JSON.stringify({ action, payload, code, requestId: crypto.randomUUID() }) }));
    const body = await res.json(); assert.equal(res.status, 200, JSON.stringify(body)); return body;
  }
  const founder = (await call("profile:restore", { nickname: "Package Test" })).data;
  const room = await call("room:create", {}, founder.credential);
  assert.equal(room.snapshot.phase, "lobby");
  const restored = await call("profile:restore", {}, founder.credential);
  assert.equal(restored.data.profile.id, founder.profile.id);
  const other = (await call("profile:restore", { nickname: "Second Player" })).data;
  const code = room.data.code;
  await call("room:join", {}, other.credential, code);
  await call("room:rounds", { rounds: 3 }, founder.credential, code);
  for (const p of [founder, other]) {
    await call("room:select-venture", { ventureId: "cafe" }, p.credential, code);
    await call("room:ready", { ready: true }, p.credential, code);
  }
  let current = (await call("game:start", {}, founder.credential, code)).snapshot;
  for (let round = 1; round <= 3; round++) {
    let now = current.phaseEndsAt;
    Date.now = () => now; // Test-only clock; no timing override is exposed to clients.
    current = (await call("room:poll", {}, founder.credential, code)).snapshot;
    assert.equal(current.phase, "decisions");
    for (const p of [founder, other]) {
      const view = (await call("room:poll", {}, p.credential, code)).snapshot;
      const incident = view.players.find(x => x.id === p.profile.id).incident;
      await call("game:decision", { priceTier: "standard", actionId: p === founder ? "quality" : "hold", matchId: view.matchId, day: round,
        incidentOptionId: incident?.options.find(x => x.balanced)?.id }, p.credential, code);
    }
    now = current.phaseEndsAt;
    current = (await call("room:poll", {}, founder.credential, code)).snapshot;
    assert.equal(current.phase, "operations");
    now = current.phaseEndsAt;
    current = (await call("room:poll", {}, founder.credential, code)).snapshot;
    assert.equal(current.phase, "results");
    assert.equal(current.players[0].business.history.length, round);
    now = current.phaseEndsAt;
    current = (await call("room:poll", {}, founder.credential, code)).snapshot;
  }
  assert.equal(current.phase, "finished");
  assert.equal(current.rankings.length, 2);
  const winner = current.rankings[0];
  assert.ok(winner.companyValuation >= current.rankings[1].companyValuation);
  for (const p of [founder, other]) {
    const restored = (await call("profile:restore", {}, p.credential)).data;
    assert.equal(restored.profile.tokens, p.profile.id === winner.playerId ? 50 : 20);
  }
  await call("game:rematch", {}, founder.credential, code);
  assert.equal((await call("room:poll", {}, other.credential, code)).snapshot.phase, "lobby");
  console.log(`Verified exact packaged game.zip (${(await stat(zipped[0].path)).size} bytes): complete two-player / three-round match, final winner, persistent rewards, rematch.`);
  console.log("Packaged match rankings:", JSON.stringify(current.rankings.map(x => ({ nickname: current.players.find(p => p.id === x.playerId).nickname, valuation: x.companyValuation, profit: x.totalProfit, rank: x.rank }))));
} finally {
  Date.now = realNow;
  setEnvironmentContext({}); await server.stop(); await rm(temp, { recursive: true, force: true });
}
