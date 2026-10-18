import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BlobsServer } from "@netlify/blobs/server";
import { setEnvironmentContext } from "@netlify/blobs";
import { calculateDay, defaultDecision, hashSeed, rankBusinesses, type RoomSnapshot } from "@market-rush/shared";
import { createHandler } from "./handler.js";
import { blobStore, type AtomicStore } from "./storage.js";
import type { Room } from "./engine.js";
import { enableLocalBlobEtags } from "../scripts/local-blobs-compat.mjs";

class MemoryStore implements AtomicStore {
  values = new Map<string, { data: unknown; etag: string }>();
  conflicts = 0;
  async read<T>(key: string) { return structuredClone(this.values.get(key) ?? null) as { data: T; etag: string } | null; }
  async write(key: string, value: unknown, etag?: string) {
    if (this.values.get(key)?.etag !== etag) { this.conflicts++; return false; }
    this.values.set(key, { data: structuredClone(value), etag: randomUUID() }); return true;
  }
}
function setup(store: AtomicStore) {
  let now = 1_800_000_000_000;
  let code: string | undefined;
  const call = async (credential: string | undefined, action: string, payload: any = {}, requestId = randomUUID()) => {
    // New handler each invocation: no process-local room state can leak into tests.
    const response = await createHandler(store, () => now)(new Request("http://localhost/.netlify/functions/game", {
      method: "POST", headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
      body: JSON.stringify({ action, payload, code, requestId })
    }));
    return { status: response.status, ...await response.json() };
  };
  const ok = async (...args: Parameters<typeof call>) => {
    const response = await call(...args); expect(response.error).toBeUndefined(); expect(response.status).toBe(200); return response;
  };
  const profile = async (name: string) => (await ok(undefined, "profile:restore", { nickname: name })).data;
  const room = async () => (await store.read<Room>(`rooms/${code}`))!.data;
  return { call, ok, profile, room, setCode: (next: string) => { code = next; }, setTime: (next: number) => { now = next; }, getTime: () => now };
}

async function threeRoundMatch(store: AtomicStore) {
  const t = setup(store);
  const alice = await t.profile("Alice"), bob = await t.profile("Bob");
  const created = await t.ok(alice.credential, "room:create"); t.setCode(created.data.code);
  await t.ok(bob.credential, "room:join");
  await t.ok(alice.credential, "room:rounds", { rounds: 3 });
  for (const p of [alice, bob]) {
    await t.ok(p.credential, "room:select-venture", { ventureId: p === alice ? "cafe" : "online-shop" });
    await t.ok(p.credential, "room:ready", { ready: true });
  }
  await t.ok(alice.credential, "game:start");
  let final: RoomSnapshot | undefined;
  for (let week = 1; week <= 3; week++) {
    t.setTime((await t.room()).phaseEndsAt!);
    const a = (await t.ok(alice.credential, "room:poll")).snapshot as RoomSnapshot;
    expect(a.phase).toBe("decisions"); expect(a.day).toBe(week);
    for (const p of [alice, bob]) {
      const view = (await t.ok(p.credential, "room:poll")).snapshot as RoomSnapshot;
      const me = view.players.find(x => x.id === p.profile.id)!;
      expect(view.players.find(x => x.id !== p.profile.id)?.incident).toBeUndefined();
      await t.ok(p.credential, "game:decision", { ...defaultDecision("standard", me.incident), actionId: p === alice ? "quality" : "hold", matchId: a.matchId, day: week,
        cash: 99999999, totalProfit: 99999999 }); // fabricated financial fields are ignored
    }
    const before = await t.room();
    const expected = calculateDay(week, before.marketEvent!, before.players.map(p => ({ playerId: p.id, ventureId: p.ventureId!, business: p.business!, decision: p.decision!, incident: p.incident })), hashSeed(`${before.matchId}:${week}`), before.interestRate);
    t.setTime(before.phaseEndsAt!);
    const running = (await t.ok(alice.credential, "room:poll")).snapshot as RoomSnapshot;
    expect(running.phase).toBe("operations");
    expect(running.players[0]!.business!.history).toHaveLength(week - 1);
    expect(JSON.stringify(running)).not.toContain("pendingOutputs");
    t.setTime(running.phaseEndsAt!);
    const results = (await t.ok(alice.credential, "room:poll")).snapshot as RoomSnapshot;
    expect(results.phase).toBe("results");
    for (const output of expected) expect(results.players.find(p => p.id === output.playerId)!.business).toEqual(output.business);
    t.setTime(results.phaseEndsAt!);
    final = (await t.ok(alice.credential, "room:poll")).snapshot;
  }
  expect(final!.phase).toBe("finished");
  expect(final!.players.every(p => p.business!.history.length === 3)).toBe(true);
  const expectedRanking = rankBusinesses(final!.players.map(p => ({ playerId: p.id, business: p.business! })));
  expect(final!.rankings).toEqual(expectedRanking);
  expect(final!.rankings![0]!.companyValuation).toBeGreaterThanOrEqual(final!.rankings![1]!.companyValuation);
  for (let i = 0; i < 3; i++) await t.ok(bob.credential, "room:poll");
  for (const p of [alice, bob]) {
    const restored = (await t.ok(p.credential, "profile:restore")).data;
    expect(restored.profile.tokens).toBe(expectedRanking[0]!.playerId === p.profile.id ? 50 : 20);
  }
  const report = final!.rankings!.map(rank => ({ name: final!.players.find(p => p.id === rank.playerId)!.nickname, valuation: rank.companyValuation, profit: rank.totalProfit, rank: rank.rank }));
  console.log("Three-round / two-player verified result:", JSON.stringify(report));
  await t.ok(alice.credential, "game:rematch");
  const rematch = (await t.ok(bob.credential, "room:poll")).snapshot;
  expect(rematch.phase).toBe("lobby"); expect(rematch.players).toHaveLength(2);
  return report;
}

describe("Netlify authoritative game", () => {
  it("completes three rounds, independently verifies every score, persists rewards and rematches", async () => {
    await threeRoundMatch(new MemoryStore());
  });
  it("runs the same complete match against the official Netlify Blobs emulator with actual conditional writes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "market-rush-blobs-"));
    enableLocalBlobEtags(BlobsServer);
    const server = new BlobsServer({ directory });
    const { port } = await server.start();
    setEnvironmentContext({ siteID: "local-test", token: "local-only", edgeURL: `http://localhost:${port}`, uncachedEdgeURL: `http://localhost:${port}` });
    try { await threeRoundMatch(blobStore()); }
    finally { setEnvironmentContext({}); await server.stop(); await rm(directory, { recursive: true, force: true }); }
  });
  it("resolves overlapping joins without losing seats; duplicate commands do not add extra bots", async () => {
    const store = new MemoryStore(), t = setup(store);
    const host = await t.profile("Host");
    const id = randomUUID();
    const created = await t.ok(host.credential, "room:create", {}, id); t.setCode(created.data.code);
    expect((await t.ok(host.credential, "room:create", {}, id)).data.code).toBe(created.data.code);
    const others = await Promise.all(Array.from({ length: 8 }, (_, i) => t.profile(`Player ${i}`)));
    await Promise.all(others.map(p => t.ok(p.credential, "room:join")));
    const room = await t.room();
    expect(room.players.filter(p => !p.spectator)).toHaveLength(8);
    expect(room.players.filter(p => p.spectator)).toHaveLength(1);
    expect(store.conflicts).toBeGreaterThan(0);
    t.setCode((await t.ok(host.credential, "room:create")).data.code);
    const add = randomUUID();
    await Promise.all([t.ok(host.credential, "room:add-bot", {}, add), t.ok(host.credential, "room:add-bot", {}, add)]);
    expect((await t.room()).players).toHaveLength(2);
  });
  it("enforces authorization, readiness, spectator rules, deadline catch-up, host transfer and expiration", async () => {
    const t = setup(new MemoryStore());
    const host = await t.profile("Host"), guest = await t.profile("Guest"), spectator = await t.profile("Watcher");
    t.setCode((await t.ok(host.credential, "room:create")).data.code);
    expect((await t.call(undefined, "room:poll")).status).toBe(401);
    expect((await t.call(guest.credential, "room:add-bot")).status).toBe(400);
    await t.ok(guest.credential, "room:join");
    expect((await t.call(guest.credential, "game:start")).status).toBe(400);
    expect((await t.call(host.credential, "game:start")).status).toBe(400);
    for (const p of [host, guest]) { await t.ok(p.credential, "room:select-venture", { ventureId: "cafe" }); await t.ok(p.credential, "room:ready", { ready: true }); }
    await t.ok(host.credential, "game:start");
    const watching = (await t.ok(spectator.credential, "room:join")).snapshot;
    expect(watching.players.find((p: any) => p.id === spectator.profile.id).spectator).toBe(true);
    t.setTime((await t.room()).phaseEndsAt!);
    await t.ok(host.credential, "room:poll");
    const r = await t.room();
    expect((await t.call(spectator.credential, "game:decision", { priceTier: "standard", actionId: "hold", matchId: r.matchId, day: 1 })).status).toBe(400);
    expect((await t.call(host.credential, "game:decision", { priceTier: "standard", actionId: "hold", matchId: r.matchId, day: 2 })).status).toBe(400);
    t.setTime(t.getTime() + 26_000);
    const transferred = (await t.ok(guest.credential, "room:poll")).snapshot;
    expect(transferred.players.find((p: any) => p.id === guest.profile.id).isHost).toBe(true);
    t.setTime(t.getTime() + 600_000);
    const done = (await t.ok(guest.credential, "room:poll")).snapshot;
    expect(done.phase).toBe("finished"); expect(done.players[0].business.history).toHaveLength(6);
    t.setTime(t.getTime() + 7_200_001);
    expect((await t.call(guest.credential, "room:poll")).status).toBe(400);
  });
});
