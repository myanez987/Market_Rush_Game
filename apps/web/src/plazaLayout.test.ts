import { describe, expect, it } from "vitest";
import { computePlazaLayout, createPedestrianRoute, distanceBetween, intersectsStorefront, PLAZA_RING_RADIUS } from "./plazaLayout.js";
import { petCompanionPoint } from "./npcCrowd.js";
import { Vector3 } from "three";

describe("adaptive plaza layout", () => {
  for (let count = 2; count <= 8; count += 1) {
    it(`keeps ${count} storefronts separated, inward-facing, and inside the island`, () => {
      const ids = Array.from({ length: count }, (_, index) => `player-${index + 1}`);
      const layout = computePlazaLayout(ids);
      expect(layout.entries.map((entry) => entry.playerId)).toEqual(ids);

      for (const entry of layout.entries) {
        const front = { x: Math.sin(entry.rotationY), z: Math.cos(entry.rotationY) };
        const inward = { x: -entry.position.x / entry.radius, z: -entry.position.z / entry.radius };
        expect(front.x * inward.x + front.z * inward.z).toBeGreaterThan(0.999);
        expect(Math.hypot(entry.position.x, entry.position.z) + 1.25 * entry.scale).toBeLessThan(layout.worldRadius);
        expect(distanceBetween(entry.servicePoint, entry.position) - .13).toBeGreaterThan(1.25 * entry.scale);
      }

      for (let left = 0; left < layout.entries.length; left += 1) {
        for (let right = left + 1; right < layout.entries.length; right += 1) {
          expect(distanceBetween(layout.entries[left]!.position, layout.entries[right]!.position)).toBeGreaterThan(2.25 * Math.max(layout.entries[left]!.scale, layout.entries[right]!.scale));
        }
      }
    });
  }

  it("creates gate and defection routes through the central pedestrian ring", () => {
    const layout = computePlazaLayout(["a", "b", "c", "d"]);
    const arrival = createPedestrianRoute(layout, "c", undefined, 2, 0.12);
    const defection = createPedestrianRoute(layout, "c", "a", 0, -0.08);
    const destination = layout.entries.find((entry) => entry.playerId === "c")!;

    expect(arrival.length).toBeGreaterThanOrEqual(5);
    expect(defection.length).toBeGreaterThanOrEqual(4);
    expect(arrival.some((p) => Math.abs(Math.hypot(p.x, p.z) - PLAZA_RING_RADIUS) < .001)).toBe(true);
    expect(distanceBetween(arrival.at(-1)!, destination.servicePoint)).toBeLessThan(0.2);
    expect(distanceBetween(defection[0]!, layout.entries[0]!.servicePoint)).toBeLessThan(0.2);
    expect(distanceBetween(defection.at(-1)!, destination.servicePoint)).toBeLessThan(0.2);
  });

  for (let count = 2; count <= 8; count++) {
    it(`routes arrivals and defections around all ${count} building footprints with body clearance`, () => {
      const layout = computePlazaLayout(Array.from({ length: count }, (_, i) => `p${i}`));
      for (const destination of layout.entries) for (const origin of [undefined, ...layout.entries.map((e) => e.playerId)]) for (let gate = 0; gate < 4; gate++) {
        const route = createPedestrianRoute(layout, destination.playerId, origin, gate, .2);
        for (let i = 1; i < route.length; i++) for (let t = 0; t <= 1; t += .025) {
          const a = route[i - 1]!, b = route[i]!;
          const point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
          expect(layout.entries.some((e) => intersectsStorefront(point, e)), `${count} players: ${origin ?? gate} → ${destination.playerId} at ${JSON.stringify(point)}`).toBe(false);
        }
      }
    });
  }

  for (let count = 2; count <= 8; count++) it(`keeps pets beside their owners and out of ${count} storefronts`, () => {
    const layout = computePlazaLayout(Array.from({ length: count }, (_, i) => `p${i}`));
    for (const destination of layout.entries) for (let gate = 0; gate < 4; gate++) {
      const route = createPedestrianRoute(layout, destination.playerId, undefined, gate);
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!, b = route[i]!;
        const heading = Math.atan2(b.x - a.x, b.z - a.z);
        for (let t = 0; t <= 1; t += .1) {
          const point = petCompanionPoint({ position: new Vector3(a.x + (b.x - a.x) * t, .35, a.z + (b.z - a.z) * t), heading });
          expect(layout.entries.some((entry) => intersectsStorefront(point, entry, .12)), `${count} players: pet at ${JSON.stringify(point)}`).toBe(false);
        }
      }
    }
  });
});
