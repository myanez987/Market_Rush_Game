export class DistrictPerformance {
  private frames: number[] = [];
  private lastFrame = 0;
  private started = 0;
  private nextReport = 0;
  private collisions = 0;
  private observed = new Set<string>();
  private wasHidden = false;
  constructor(private readonly element: HTMLElement) {}
  record(now: number, values: { calls: number; triangles: number; npcCount: number; clipped: number; animations: string[]; storm: boolean; tier: number; dpr: number }) {
    if (!this.started) this.started = now;
    if (this.lastFrame && now - this.started > 2_000 && !document.hidden && !this.wasHidden) this.frames.push(now - this.lastFrame);
    this.wasHidden = document.hidden;
    this.lastFrame = now;
    this.collisions += values.clipped;
    values.animations.forEach((state) => this.observed.add(state));
    if (this.frames.length > 1_800) this.frames.shift();
    if (now < this.nextReport) return;
    this.nextReport = now + 1_000;
    const sum = this.frames.reduce((a, b) => a + b, 0);
    const sorted = [...this.frames].sort((a, b) => a - b);
    const fps = sum > 0 ? 1_000 * this.frames.length / sum : 0;
    const p95 = sorted[Math.floor(sorted.length * .95)] ?? 0;
    const summary = { fps: Number(fps.toFixed(1)), p95FrameMs: Number(p95.toFixed(1)), samples: this.frames.length, measuredSeconds: Number((sum / 1000).toFixed(1)), drawCalls: values.calls, triangles: values.triangles, npcCount: values.npcCount, collisionSamples: this.collisions, observedAnimations: [...this.observed], storm: values.storm, highestTier: values.tier, pixelRatio: values.dpr, backend: "WebGL2 / TSL" };
    this.element.dataset.metrics = JSON.stringify(summary);
    this.element.textContent = `${fps.toFixed(1)} FPS · p95 ${p95.toFixed(1)}ms · ${values.npcCount} NPCs · ${values.calls} draws · ${this.collisions} clipping samples · ${this.frames.length} frames\n${[...this.observed].join(" / ")} · WebGL2 + TSL · ${values.storm ? "storm" : "clear"} · tier ${values.tier}`;
  }
}
