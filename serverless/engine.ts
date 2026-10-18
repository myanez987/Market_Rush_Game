import { randomUUID } from "node:crypto";
import {
  calculateDay, createBusinessState, createPublicMarketSignals, createWorldDirective, defaultDecision,
  hashSeed, seededRandom, rankBusinesses, INCIDENTS, MARKET_EVENTS, INTEREST_RATE_ENVIRONMENTS,
  MATCH_PACE_MULTIPLIERS, decisionSchema, matchPaceSchema, readySchema, selectVentureSchema, getVenture,
  type BusinessState, type Decision, type Incident, type Profile, type RoomSnapshot, type DayPlayerOutput
} from "../packages/shared/src/index.js";

export const TTL = 2 * 60 * 60 * 1000;
export const PRESENCE_MS = 25_000;
export interface Player {
  id: string; nickname: string; isBot: boolean; joinedAt: number; lastSeen: number;
  spectator: boolean; ready: boolean; ventureId?: string; business?: BusinessState;
  incident?: Incident; decision?: Decision; reward?: number; personality?: number;
}
export interface Room {
  code: string; revision: number; hostId: string; phase: RoomSnapshot["phase"]; day: number;
  maxDays: number; matchPace: RoomSnapshot["matchPace"]; phaseEndsAt?: number; lastActiveAt: number;
  players: Player[]; matchId?: string; eventDeck: RoomSnapshot["marketEvent"][];
  rateDeck: RoomSnapshot["interestRate"][]; incidents: Record<string, Record<number, Incident>>;
  marketEvent?: RoomSnapshot["marketEvent"]; interestRate?: RoomSnapshot["interestRate"];
  worldDirective?: RoomSnapshot["worldDirective"]; rankings?: RoomSnapshot["rankings"];
  publicMarketSignals: RoomSnapshot["publicMarketSignals"]; pendingOutputs?: DayPlayerOutput[];
  receipts: string[];
  awards: { matchId: string; playerId: string; amount: number }[];
}
export const human = (p: Profile, now: number): Player => ({ id: p.id, nickname: p.nickname, isBot: false, joinedAt: now, lastSeen: now, spectator: false, ready: false });
export function newRoom(code: string, profile: Profile, now: number): Room {
  return { code, revision: 0, hostId: profile.id, phase: "lobby", day: 0, maxDays: 6, matchPace: "standard", lastActiveAt: now,
    players: [human(profile, now)], eventDeck: [], rateDeck: [], incidents: {}, publicMarketSignals: [], receipts: [], awards: [] };
}
const active = (r: Room) => r.players.filter(p => !p.spectator);
const duration = (r: Room, phase: "forecast" | "decisions" | "operations" | "results") =>
  Math.round(({ forecast: 6000, decisions: 30000, operations: 22000, results: 10000 })[phase] * MATCH_PACE_MULTIPLIERS[r.matchPace]);
function forecast(r: Room, at: number) {
  r.phase = "forecast"; r.marketEvent = r.eventDeck[r.day - 1];
  r.interestRate = r.marketEvent?.id === "rates" ? INTEREST_RATE_ENVIRONMENTS.find(x => x.id === "spike") : r.rateDeck[r.day - 1];
  r.worldDirective = undefined;
  for (const p of r.players) { p.decision = undefined; p.incident = r.incidents[p.id]?.[r.day]; }
  r.publicMarketSignals = createPublicMarketSignals(active(r).map(p => ({ playerId: p.id, ventureId: p.ventureId!, business: p.business! })));
  r.phaseEndsAt = at + duration(r, "forecast");
}
function botDecision(r: Room, p: Player): Decision {
  const b = p.business!;
  const kind = p.personality ?? 3;
  const highDemand = (r.marketEvent?.demandMultiplier ?? 1) > 1.08;
  const financingAction = kind === 0 && (r.interestRate?.weeklyRateBps ?? 300) <= 150 && b.cash < 1500 && b.voluntaryDebt < 1500 ? "borrow_500"
    : kind === 2 && b.voluntaryDebt > 0 && b.cash > 1200 ? "repay_500" : "none";
  return { ...defaultDecision(b.lastPriceTier, p.incident),
    priceTier: kind === 0 ? (b.trust >= 72 ? "premium" : "standard") : kind === 2 ? (b.trust < 45 ? "budget" : "standard") : kind === 3 && highDemand ? "premium" : "standard",
    actionId: kind === 0 ? (b.cash > 700 ? "marketing" : "hold") : kind === 1 ? (b.morale < 78 ? "training" : "quality") : kind === 2 ? (b.morale > 48 ? "cost_cut" : "hold") : highDemand ? "overtime" : "hold",
    financingAction, inventoryPolicy: kind === 2 ? "lean" : highDemand ? "stock_up" : "balanced",
    capitalInvestment: kind === 0 && b.cash + (financingAction === "borrow_500" ? 500 : 0) > 1500 && b.capacityBonusPct < 30 ? "capacity_small" : "none" };
}

// Deadlines are persisted, never restarted by a cold start or a late poll.
export function advance(r: Room, now: number) {
  while (r.phaseEndsAt !== undefined && now >= r.phaseEndsAt) {
    const at = r.phaseEndsAt;
    if (r.phase === "forecast") {
      r.phase = "decisions"; r.phaseEndsAt = at + duration(r, "decisions");
      for (const p of active(r)) if (p.isBot) p.decision = botDecision(r, p);
    } else if (r.phase === "decisions") {
      const inputs = active(r).map(p => ({ playerId: p.id, ventureId: p.ventureId!, business: p.business!, incident: p.incident,
        decision: p.decision ?? defaultDecision(p.business!.lastPriceTier, p.incident) }));
      const outputs = calculateDay(r.day, r.marketEvent!, inputs, hashSeed(`${r.matchId}:${r.day}`), r.interestRate);
      r.pendingOutputs = outputs;
      r.worldDirective = createWorldDirective(r.day, r.marketEvent!, inputs, outputs, hashSeed(`${r.matchId}:${r.day}:world`), at, duration(r, "operations"));
      r.phase = "operations"; r.phaseEndsAt = at + duration(r, "operations");
    } else if (r.phase === "operations") {
      for (const out of r.pendingOutputs!) r.players.find(p => p.id === out.playerId)!.business = out.business;
      r.pendingOutputs = undefined; r.phase = "results"; r.phaseEndsAt = at + duration(r, "results");
    } else if (r.phase === "results") {
      if (r.day < r.maxDays) { r.day++; forecast(r, at); }
      else {
        r.rankings = rankBusinesses(active(r).map(p => ({ playerId: p.id, business: p.business! })));
        for (const rank of r.rankings) {
          const p = r.players.find(p => p.id === rank.playerId)!;
          if (!p.isBot) {
            p.reward = 20 + (rank.rank === 1 ? 30 : 0);
            r.awards.push({ matchId: r.matchId!, playerId: p.id, amount: p.reward });
          }
        }
        r.phase = "finished"; r.phaseEndsAt = undefined;
      }
    } else break;
    r.revision++;
  }
}

function demand(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export function command(r: Room, profile: Profile, action: string, payload: any, now: number) {
  let me = r.players.find(p => p.id === profile.id);
  if (action === "room:join" && !me) {
    demand(r.players.length < 32, "This room is full, including spectators.");
    me = human(profile, now); me.spectator = r.phase !== "lobby" || active(r).length >= 8; r.players.push(me);
  }
  demand(me, "Join the room first.");
  me.lastSeen = now; me.nickname = profile.nickname;
  if (!r.players.some(p => p.id === r.hostId && now - p.lastSeen < PRESENCE_MS)) {
    const next = r.players.filter(p => !p.isBot && !p.spectator && now - p.lastSeen < PRESENCE_MS).sort((a,b) => a.joinedAt - b.joinedAt)[0];
    if (next) r.hostId = next.id;
  }
  const host = () => demand(r.hostId === me!.id, "Only the host can do that.");
  const lobby = () => demand(r.phase === "lobby" && !me!.spectator, "Wait for the next lobby.");
  switch (action) {
    case "room:poll": case "room:join": break;
    case "room:add-bot": {
      host(); lobby(); demand(active(r).length < 8, "Eight founders is the limit.");
      const index = active(r).length;
      r.players.push({ id: randomUUID(), nickname: ["Maya", "Theo", "Lina", "Omar", "Nova", "Kai", "Zoe"][index - 1]!, isBot: true, joinedAt: now, lastSeen: now,
        ready: true, spectator: false, personality: index % 4, ventureId: ["cafe", "online-shop", "cleaning-service", "app-studio"][index % 4] }); break;
    }
    case "room:remove-bot": host(); lobby(); demand(r.players.some(p => p.id === payload.botId && p.isBot), "Choose a bot."); r.players = r.players.filter(p => p.id !== payload.botId); break;
    case "room:select-venture": {
      lobby(); const { ventureId } = selectVentureSchema.parse(payload); const v = getVenture(ventureId);
      demand(v && (v.unlockCost === 0 || profile.unlockedItemIds.includes(v.id)), "Unlock that venture first.");
      me.ventureId = ventureId; me.ready = false; break;
    }
    case "room:ready": lobby(); demand(me.ventureId, "Choose your venture first."); me.ready = readySchema.parse(payload).ready; break;
    case "room:pace": host(); lobby(); r.matchPace = matchPaceSchema.parse(payload).pace; break;
    case "room:rounds": host(); lobby(); demand(payload.rounds === 3 || payload.rounds === 6, "Choose three or six weeks."); r.maxDays = payload.rounds; break;
    case "game:start": {
      host(); lobby(); demand(active(r).length >= 2 && active(r).every(p => p.ready && p.ventureId), "At least two ready founders are required.");
      r.matchId = randomUUID(); r.day = 1; r.rankings = undefined; r.incidents = {};
      const random = seededRandom(hashSeed(r.matchId));
      r.eventDeck = [MARKET_EVENTS.find(e => e.id === "steady")!, ...MARKET_EVENTS.filter(e => e.id !== "steady").sort(() => random() - .5)].slice(0, r.maxDays);
      const normal = INTEREST_RATE_ENVIRONMENTS.find(x => x.id === "normal")!;
      r.rateDeck = [normal, ...[...INTEREST_RATE_ENVIRONMENTS.filter(x => x.id !== "normal"), normal, INTEREST_RATE_ENVIRONMENTS[Math.floor(random() * INTEREST_RATE_ENVIRONMENTS.length)]!].sort(() => random() - .5)];
      active(r).forEach((p, index) => {
        p.business = createBusinessState(); p.reward = undefined; r.incidents[p.id] = {};
        for (const [i, day] of [2, 4, 6].entries()) if (day <= r.maxDays) r.incidents[p.id]![day] = INCIDENTS[(index + i * 2 + Math.floor(random() * INCIDENTS.length)) % INCIDENTS.length]!;
      });
      forecast(r, now); break;
    }
    case "game:decision": {
      demand(r.phase === "decisions" && !me.spectator && me.business, "The decision window is closed.");
      demand(payload.matchId === r.matchId && payload.day === r.day, "This decision is for an earlier week. Review the current week.");
      const decision = decisionSchema.parse(payload);
      demand(!me.incident || me.incident.options.some(x => x.id === decision.incidentOptionId), "Choose an incident response.");
      me.decision = decision; break;
    }
    case "game:rematch": {
      host(); demand(r.phase === "finished", "Finish this match first.");
      r.players.sort((a,b) => a.joinedAt - b.joinedAt).forEach((p,i) => { p.spectator = i >= 8; p.ready = p.isBot; if (!p.isBot) p.ventureId = undefined; p.business = undefined; p.decision = undefined; p.incident = undefined; p.reward = undefined; });
      r.phase = "lobby"; r.day = 0; r.matchId = undefined; r.rankings = undefined; r.worldDirective = undefined;
      r.marketEvent = undefined; r.interestRate = undefined; r.publicMarketSignals = []; break;
    }
    default: throw new Error("Unknown game action.");
  }
  r.lastActiveAt = now; r.revision++;
}

export function snapshot(r: Room, viewer: string, now: number): RoomSnapshot {
  return { code: r.code, revision: r.revision, phase: r.phase, day: r.day, maxDays: r.maxDays, phaseEndsAt: r.phaseEndsAt,
    matchPace: r.matchPace, marketEvent: r.marketEvent, interestRate: r.interestRate, worldDirective: r.worldDirective,
    publicMarketSignals: r.publicMarketSignals, rankings: r.rankings, matchId: r.matchId,
    players: r.players.map(p => ({ id: p.id, nickname: p.nickname, isBot: p.isBot, isHost: r.hostId === p.id,
      connected: p.isBot || now - p.lastSeen < PRESENCE_MS, spectator: p.spectator, ready: p.ready, ventureId: p.ventureId,
      decisionSubmitted: Boolean(p.decision), business: p.business, incident: p.id === viewer ? p.incident : undefined, reward: p.id === viewer ? p.reward : undefined })) };
}
