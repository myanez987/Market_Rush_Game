import type { CatalogItem, Profile, RoomSnapshot } from "@market-rush/shared";

export async function gameRequest<T>(credential: string | undefined, action: string, payload: unknown = {}, code?: string) {
  const requestId = crypto.randomUUID();
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch("/.netlify/functions/game", {
        method: "POST", headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
        body: JSON.stringify({ action, payload, code, requestId }), signal: AbortSignal.timeout(15_000)
      });
      const body = await response.json();
      if (!response.ok) throw Object.assign(new Error(body.error?.message ?? "The game request failed."), { serverResponse: true });
      return body as { data: T; snapshot?: RoomSnapshot };
    } catch (error) {
      if (attempt >= 1 || (error as { serverResponse?: boolean }).serverResponse || action === "profile:restore") throw error;
    }
  }
}

export async function restoreOrCreateProfile(credential?: string, nickname?: string) {
  return (await gameRequest<{ credential: string; profile: Profile }>(credential, "profile:restore", { nickname })).data;
}

export async function updateNickname(credential: string, nickname: string) {
  return (await gameRequest<{ profile: Profile }>(credential, "profile:nickname", { nickname })).data;
}

export async function loadCatalog(credential: string) {
  return (await gameRequest<{ catalog: CatalogItem[]; profile: Profile }>(credential, "catalog")).data;
}

export async function unlockItem(credential: string, itemId: string) {
  return (await gameRequest<{ profile: Profile; itemId: string }>(credential, "profile:unlock", { itemId })).data;
}
