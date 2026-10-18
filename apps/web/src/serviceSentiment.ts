/** Illustrative reactions derived from the authoritative weekly service score. */
export type ServiceSentiment = "satisfied" | "mixed" | "disappointed";

/** Stable across clients and reconnects without consuming the scene's decoration RNG. */
export function serviceSample(seed: number, cohortId: string, customerIndex: number) {
  let hash = (2166136261 ^ seed) >>> 0;
  const key = `${cohortId}:${customerIndex}`;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  // Mix neighboring indices so adjacent pegs do not always react alike.
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

export function serviceSentiment(satisfaction: number, purchased: boolean, waitSeconds: number, sample: number): ServiceSentiment {
  if (!purchased) return waitSeconds > 10 ? "disappointed" : "mixed";
  const happyShare = Math.min(1, Math.max(0, satisfaction / 100));
  if (sample < happyShare) return "satisfied";
  if (sample < happyShare + (1 - happyShare) / 2) return "mixed";
  return "disappointed";
}
