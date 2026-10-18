import { describe, expect, it } from "vitest";
import { serviceSample, serviceSentiment } from "./serviceSentiment.js";

describe("customer service reactions", () => {
  it("samples the same cohort consistently on reconnect", () => {
    const samples = Array.from({ length: 80 }, (_, index) => serviceSample(1234, "week-2-cafe", index));
    expect(samples.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(samples).size).toBe(80);
    expect(serviceSample(1234, "week-2-cafe", 12)).toBe(samples[12]);
    expect(serviceSample(1235, "week-2-cafe", 12)).not.toBe(samples[12]);
  });

  it("maps actual purchases and server satisfaction into honest reactions", () => {
    expect(serviceSentiment(90, true, 4, .5)).toBe("satisfied");
    expect(serviceSentiment(60, true, 12, .7)).toBe("mixed");
    expect(serviceSentiment(60, true, 12, .95)).toBe("disappointed");
    expect(serviceSentiment(100, true, 5, .99)).toBe("satisfied");
    expect(serviceSentiment(0, true, 5, .9)).toBe("disappointed");
    expect(serviceSentiment(95, false, 18, .1)).toBe("disappointed");
    expect(serviceSentiment(95, false, 5, .1)).toBe("mixed");
  });
});
