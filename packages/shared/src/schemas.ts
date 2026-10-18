import { z } from "zod";
import { ACTION_IDS, CAPITAL_INVESTMENTS, FINANCING_ACTIONS, INVENTORY_POLICIES, MATCH_PACES, PRICE_TIERS } from "./types.js";

export const nicknameSchema = z.string().trim().min(2).max(16).regex(/^[\p{L}\p{N} _-]+$/u, "Use letters, numbers, spaces, dashes, or underscores.");
export const roomCodeSchema = z.string().trim().toUpperCase().length(4).regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
export const credentialSchema = z.string().min(32).max(128);
export const ventureIdSchema = z.string().min(1).max(40);
export const priceTierSchema = z.enum(PRICE_TIERS);
export const actionIdSchema = z.enum(ACTION_IDS);
export const decisionSchema = z.object({
  priceTier: priceTierSchema,
  actionId: actionIdSchema,
  incidentOptionId: z.string().min(1).max(40).optional(),
  financingAction: z.enum(FINANCING_ACTIONS).optional().default("none"),
  inventoryPolicy: z.enum(INVENTORY_POLICIES).optional().default("balanced"),
  capitalInvestment: z.enum(CAPITAL_INVESTMENTS).optional().default("none")
});

export const createProfileSchema = z.object({
  credential: credentialSchema.optional(),
  nickname: nicknameSchema.optional()
});

export const updateProfileSchema = z.object({ nickname: nicknameSchema });
export const joinRoomSchema = z.object({ code: roomCodeSchema });
export const selectVentureSchema = z.object({ ventureId: ventureIdSchema });
export const readySchema = z.object({ ready: z.boolean() });
export const matchPaceSchema = z.object({ pace: z.enum(MATCH_PACES) });
export const unlockSchema = z.object({ itemId: z.string().min(1).max(40) });
