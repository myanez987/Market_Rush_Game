import { createHash, randomBytes } from "node:crypto";
import { CATALOG, nicknameSchema, credentialSchema, roomCodeSchema, getCatalogItem, type Profile } from "../packages/shared/src/index.js";
import { advance, command, newRoom, snapshot, TTL, type Room } from "./engine.js";
import { mutate, type AtomicStore } from "./storage.js";

interface StoredProfile { profile: Profile; awards: Record<string, number> }
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export function createHandler(store: AtomicStore, clock = Date.now) {
  async function settle(room: Room) {
    // Durable outbox survives a crash after the room commits, including across rematches.
    for (const award of room.awards) {
      const key = `profiles/${award.playerId}`;
      const existing = await store.read<StoredProfile>(key);
      if (!existing || existing.data.awards[award.matchId] !== undefined) continue;
      await mutate<StoredProfile, void>(store, key, current => {
        if (!current) throw new Error("Profile unavailable.");
        if (current.awards[award.matchId] === undefined) {
          current.awards[award.matchId] = award.amount;
          current.profile.tokens += award.amount;
        }
        return { value: current, result: undefined };
      });
    }
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json({ error: { message: "Use POST for game requests." } }, 405);
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: { message: "Use this game's own website." } }, 403);
    try {
      const raw = await request.text();
      if (raw.length > 16_384) return json({ error: { message: "Request is too large." } }, 413);
      const body = JSON.parse(raw);
      const action = body.action;
      const payload = body.payload ?? {};
      if (typeof action !== "string") throw new Error("Choose an action.");
      let credential = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (action === "profile:restore") {
        if (credential) {
          credentialSchema.parse(credential);
          const old = await store.read<StoredProfile>(`profiles/${digest(credential)}`);
          if (old) return json({ data: { credential, profile: old.data.profile } });
        }
        credential = randomBytes(32).toString("base64url");
        const profile: Profile = { id: digest(credential), nickname: nicknameSchema.parse(payload.nickname ?? "New Founder"), tokens: 0, unlockedItemIds: [] };
        if (!await store.write(`profiles/${profile.id}`, { profile, awards: {} })) throw new Error("Please try creating your profile again.");
        return json({ data: { credential, profile } });
      }
      if (!credential || !credentialSchema.safeParse(credential).success) return json({ error: { message: "Restore your guest profile first." } }, 401);
      const profileKey = `profiles/${digest(credential)}`;
      const entry = await store.read<StoredProfile>(profileKey);
      if (!entry) return json({ error: { message: "Guest profile not found." } }, 401);
      const profile = entry.data.profile;
      if (action === "catalog") return json({ data: { catalog: CATALOG, profile } });
      if (action === "profile:nickname" || action === "profile:unlock") {
        const updated = await mutate<StoredProfile, Profile>(store, profileKey, current => {
          if (!current) throw new Error("Guest profile not found.");
          if (action === "profile:nickname") current.profile.nickname = nicknameSchema.parse(payload.nickname);
          else {
            const item = getCatalogItem(payload.itemId);
            if (!item) throw new Error("Choose a valid catalog item.");
            if (!current.profile.unlockedItemIds.includes(item.id)) {
              if (current.profile.tokens < item.cost) throw new Error("You need more tokens for that item.");
              current.profile.tokens -= item.cost; current.profile.unlockedItemIds.push(item.id);
            }
          }
          return { value: current, result: current.profile };
        });
        return json({ data: { profile: updated, itemId: payload.itemId } });
      }
      const now = clock();
      const requestId = body.requestId;
      if (typeof requestId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new Error("Invalid request identifier.");
      if (action === "room:create") {
        // Deterministic candidates make a retried create resolve to its original room.
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (let attempt = 0; attempt < 64; attempt++) {
          const hash = digest(`${profile.id}:${requestId}:${attempt}`);
          const code = Array.from({ length: 4 }, (_, i) => alphabet[parseInt(hash.slice(i*2,i*2+2),16) % alphabet.length]).join("");
          const old = await store.read<Room>(`rooms/${code}`);
          if (old && old.data.receipts.includes(`${profile.id}:${requestId}`)) return json({ data: { code }, snapshot: snapshot(old.data, profile.id, now) });
          if (old && now - old.data.lastActiveAt < TTL) continue;
          const room = newRoom(code, profile, now); room.receipts.push(`${profile.id}:${requestId}`); room.revision = 1;
          if (await store.write(`rooms/${code}`, room, old?.etag)) return json({ data: { code }, snapshot: snapshot(room, profile.id, now) });
        }
        throw new Error("Could not allocate a room. Try again.");
      }
      const code = roomCodeSchema.parse(body.code ?? payload.code);
      const room = await mutate<Room, Room>(store, `rooms/${code}`, current => {
        const commitTime = clock();
        if (!current || commitTime - current.lastActiveAt >= TTL) throw new Error("That room has expired or does not exist.");
        if (action !== "room:join" && !current.players.some(p => p.id === profile.id)) throw new Error("Join the room first.");
        advance(current, commitTime);
        const receipt = `${profile.id}:${requestId}`;
        if (!current.receipts.includes(receipt)) {
          command(current, profile, action, payload, commitTime);
          if (action !== "room:poll") current.receipts.push(receipt);
        }
        return { value: current, result: current };
      });
      await settle(room);
      return json({ data: { code }, snapshot: snapshot(room, profile.id, now) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The game request failed.";
      const issues = (error as { issues?: { message: string }[] })?.issues;
      return json({ error: { code: "GAME_REQUEST_FAILED", message: issues?.[0]?.message ?? message } }, 400);
    }
  };
}
