import type { GamePhase, WorldEventVisual } from "@market-rush/shared";

type Tone = readonly [frequency: number, delay: number, duration: number, volume: number];

/** Short motifs tell players that the district's shared state has changed. */
export const PHASE_CUES: Partial<Record<GamePhase, readonly Tone[]>> = {
  forecast: [[440, 0, .16, .028], [554, .11, .2, .024]],
  decisions: [[659, 0, .12, .026], [523, .14, .18, .022]],
  operations: [[392, 0, .11, .025], [523, .1, .12, .026], [659, .2, .2, .024]],
  results: [[659, 0, .18, .022], [494, .17, .25, .02]],
  finished: [[523, 0, .14, .029], [659, .13, .14, .027], [784, .26, .3, .029]]
};

export function audioLevels(phase: GamePhase, event: WorldEventVisual) {
  const open = phase === "operations" || phase === "lobby";
  return {
    fountain: phase === "finished" ? .009 : .026,
    crowd: open ? .009 : .002,
    traffic: open ? .014 : .003,
    rain: event === "rain" ? .04 : 0
  };
}

function noiseBuffer(context: AudioContext, duration: number, seed: number) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = seed >>> 0;
  for (let i = 0; i < samples.length; i++) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    samples[i] = (state / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

/** All sound is local Web Audio synthesis; no downloads, autoplay, or game-state authority. */
export class DistrictAudio {
  private context = new AudioContext();
  private master = this.context.createGain();
  private beds = {
    fountain: this.context.createGain(),
    crowd: this.context.createGain(),
    traffic: this.context.createGain(),
    rain: this.context.createGain()
  };
  private sources: AudioBufferSourceNode[] = [];
  private phase: GamePhase = "lobby";
  private event: WorldEventVisual = "clear";
  private started = false;
  private disposed = false;
  private trafficTimer?: number;
  private onVisibility = () => {
    if (this.disposed) return;
    if (document.hidden) void this.context.suspend();
    else void this.context.resume().catch(() => undefined);
  };

  constructor() {
    this.master.gain.value = .72;
    this.master.connect(this.context.destination);
    Object.values(this.beds).forEach((gain) => { gain.gain.value = 0; gain.connect(this.master); });
  }

  private bed(gain: GainNode, kind: BiquadFilterType, frequency: number, q: number, seed: number) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    source.buffer = noiseBuffer(this.context, 3, seed); source.loop = true;
    filter.type = kind; filter.frequency.value = frequency; filter.Q.value = q;
    source.connect(filter); filter.connect(gain); source.start();
    this.sources.push(source);
  }

  async start() {
    if (this.disposed) return;
    await this.context.resume();
    if (this.started || this.disposed) return;
    this.started = true;
    this.bed(this.beds.fountain, "bandpass", 850, .45, 0x1001);
    this.bed(this.beds.crowd, "bandpass", 430, .3, 0x1002);
    this.bed(this.beds.traffic, "lowpass", 185, .6, 0x1003);
    this.bed(this.beds.rain, "highpass", 1450, .4, 0x1004);
    this.applyLevels();
    this.playTones([[523, 0, .12, .024], [784, .1, .18, .022]]);
    this.trafficTimer = window.setInterval(() => {
      if (!document.hidden && (this.phase === "operations" || this.phase === "lobby")) this.carPass();
    }, 6800);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private applyLevels() {
    if (!this.started || this.disposed) return;
    const levels = audioLevels(this.phase, this.event);
    const now = this.context.currentTime;
    for (const key of Object.keys(this.beds) as Array<keyof typeof this.beds>) {
      this.beds[key].gain.setTargetAtTime(levels[key], now, .35);
    }
  }

  setScene(phase: GamePhase, event: WorldEventVisual) {
    const previousPhase = this.phase, previousEvent = this.event;
    this.phase = phase; this.event = event;
    this.applyLevels();
    if (!this.started || this.disposed || document.hidden) return;
    if (previousPhase !== phase) this.playTones(PHASE_CUES[phase] ?? []);
    if (previousEvent !== event && event === "festival") this.playTones([[784, 0, .12, .018], [988, .13, .2, .018]]);
    if (previousEvent !== event && event === "rain") this.playTones([[196, 0, .4, .01]]);
  }

  private playTones(tones: readonly Tone[]) {
    if (this.context.state !== "running" || this.disposed) return;
    for (const [frequency, delay, duration, volume] of tones) {
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      const at = this.context.currentTime + delay;
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(frequency, at);
      envelope.gain.setValueAtTime(.0001, at);
      envelope.gain.exponentialRampToValueAtTime(volume, at + .018);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
      oscillator.connect(envelope); envelope.connect(this.master);
      oscillator.start(at); oscillator.stop(at + duration + .02);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    }
  }

  private carPass() {
    if (this.context.state !== "running" || this.disposed) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    const pan = this.context.createStereoPanner();
    const at = this.context.currentTime;
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(105, at);
    oscillator.frequency.exponentialRampToValueAtTime(58, at + 1.1);
    filter.type = "lowpass"; filter.frequency.value = 190;
    pan.pan.setValueAtTime(-.65, at); pan.pan.linearRampToValueAtTime(.65, at + 1.1);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(.009, at + .3);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + 1.1);
    oscillator.connect(filter); filter.connect(envelope); envelope.connect(pan); pan.connect(this.master);
    oscillator.start(at); oscillator.stop(at + 1.15);
    oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); envelope.disconnect(); pan.disconnect(); };
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.trafficTimer !== undefined) window.clearInterval(this.trafficTimer);
    this.sources.forEach((source) => { source.stop(); source.disconnect(); });
    Object.values(this.beds).forEach((gain) => gain.disconnect());
    this.master.disconnect();
    await this.context.close();
  }
}
