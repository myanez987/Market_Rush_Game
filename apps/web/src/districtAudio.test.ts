import { afterEach, describe, expect, it, vi } from "vitest";
import { audioLevels, DistrictAudio, PHASE_CUES } from "./districtAudio.js";

afterEach(() => vi.unstubAllGlobals());

describe("Living District sound plan", () => {
  it("keeps rain exclusive to storm scenes and lowers street noise during planning", () => {
    expect(audioLevels("operations", "rain").rain).toBeGreaterThan(0);
    expect(audioLevels("operations", "clear").rain).toBe(0);
    expect(audioLevels("decisions", "clear").traffic).toBeLessThan(audioLevels("operations", "clear").traffic);
    expect(audioLevels("decisions", "clear").crowd).toBeLessThan(audioLevels("operations", "clear").crowd);
  });

  it("provides brief, subdued cues for every timed phase", () => {
    for (const phase of ["forecast", "decisions", "operations", "results", "finished"] as const) {
      expect(PHASE_CUES[phase]!.length).toBeGreaterThan(1);
      expect(PHASE_CUES[phase]!.every(([frequency, delay, duration, volume]) => frequency > 0 && delay >= 0 && duration <= .4 && volume <= .03)).toBe(true);
    }
  });

  it("starts only on request, changes its sound bed, and closes cleanly", async () => {
    class Parameter {
      value = 0;
      setTargetAtTime(value: number) { this.value = value; }
      setValueAtTime(value: number) { this.value = value; }
      linearRampToValueAtTime(value: number) { this.value = value; }
      exponentialRampToValueAtTime(value: number) { this.value = value; }
    }
    class Node {
      gain = new Parameter(); frequency = new Parameter(); Q = new Parameter(); pan = new Parameter();
      type = ""; loop = false; buffer: unknown; onended?: () => void;
      connect() { return this; } disconnect() { /* no-op */ } start() { /* no-op */ } stop() { /* no-op */ }
    }
    class FakeAudioContext {
      static instances: FakeAudioContext[] = [];
      sampleRate = 100; currentTime = 0; state = "suspended"; destination = new Node(); closed = false;
      constructor() { FakeAudioContext.instances.push(this); }
      createGain() { return new Node(); } createBufferSource() { return new Node(); }
      createBiquadFilter() { return new Node(); } createOscillator() { return new Node(); }
      createStereoPanner() { return new Node(); }
      createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
      async resume() { this.state = "running"; }
      async suspend() { this.state = "suspended"; }
      async close() { this.closed = true; this.state = "closed"; }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("window", { setInterval: () => 1, clearInterval: () => undefined });
    vi.stubGlobal("document", { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined });
    const audio = new DistrictAudio();
    expect(FakeAudioContext.instances[0]!.state).toBe("suspended");
    await audio.start();
    audio.setScene("operations", "rain");
    const beds = (audio as unknown as { beds: { rain: Node; traffic: Node } }).beds;
    expect(beds.rain.gain.value).toBe(.04);
    expect(beds.traffic.gain.value).toBe(.014);
    audio.setScene("decisions", "clear");
    expect(beds.rain.gain.value).toBe(0);
    expect(beds.traffic.gain.value).toBe(.003);
    await audio.dispose();
    expect(FakeAudioContext.instances[0]!.closed).toBe(true);
  });
});
