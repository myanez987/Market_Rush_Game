import { describe, expect, it } from "vitest";
import { InstancedMesh } from "three";
import type { PublicPlayer } from "@market-rush/shared";
import { VENTURES } from "@market-rush/shared";
import { computePlazaLayout, createPlazaPockets, intersectsStorefront } from "./plazaLayout.js";
import { createPlazaAssets, createPlazaEnvironment, createStorefront, disposePlaza, STOREFRONT_PROFILES } from "./plazaScene.js";

describe("procedural storefront kit", () => {
  it("defines a distinct visual profile for every venture", () => {
    expect(Object.keys(STOREFRONT_PROFILES).sort()).toEqual(VENTURES.map((venture) => venture.id).sort());
    expect(new Set(Object.values(STOREFRONT_PROFILES)).size).toBe(VENTURES.length);
  });

  for (const venture of VENTURES) {
    it(`builds a selectable ${venture.name} storefront`, () => {
      const player: PublicPlayer = {
        id: `owner-${venture.id}`,
        nickname: "Founder",
        isBot: false,
        isHost: true,
        connected: true,
        ready: true,
        spectator: false,
        ventureId: venture.id,
        decisionSubmitted: false
      };
      const layout = computePlazaLayout([player.id, "competitor"]);
      const assets = createPlazaAssets();
      const storefront = createStorefront(player, layout.entries[0]!, 0xff6f47, 2, "clear", assets);
      expect(storefront.group.name).toBe(`storefront:${player.id}`);
      expect(storefront.selectable.length).toBeGreaterThan(3);
      expect(storefront.selectable.every((object) => object.userData.playerId === player.id)).toBe(true);
      expect(storefront.selectionRing.visible).toBe(false);
      disposePlaza(storefront.group);
    });
  }

  it("renders authoritative inventory bloat as physical storefront props", () => {
    const player: PublicPlayer = { id: "stocked", nickname: "Stocked", isBot: false, isHost: true, connected: true, ready: true, spectator: false, ventureId: "online-shop", decisionSubmitted: false };
    const layout = computePlazaLayout([player.id, "competitor"]);
    const storefront = createStorefront(player, layout.entries[0]!, 0xff6f47, 2, "clear", createPlazaAssets(), 7, "high");
    expect((storefront.group.getObjectByName("inventory-stack") as InstancedMesh).count).toBe(7);
    disposePlaza(storefront.group);
  });
});

describe("concrete seating pockets", () => {
  for (const count of [2, 4, 6, 8]) it(`fits paved pockets between walking paths with ${count} storefronts`, () => {
    const layout = computePlazaLayout(Array.from({ length: count }, (_, i) => `p${i}`));
    const pockets = createPlazaPockets(layout);
    expect(pockets).toHaveLength(count * 2);
    for (const pocket of pockets) {
      expect(pocket.endAngle).toBeGreaterThan(pocket.startAngle);
      for (const radius of [pocket.innerRadius, pocket.benchRadius, pocket.outerRadius]) {
        const point = { x: Math.cos(pocket.centerAngle) * radius, z: Math.sin(pocket.centerAngle) * radius };
        expect(layout.entries.some((entry) => intersectsStorefront(point, entry, .35))).toBe(false);
      }
    }
    const assets = createPlazaAssets();
    const environment = createPlazaEnvironment(layout, "clear", false, assets, () => .5);
    expect(environment.paving.some((mesh) => mesh.name === "plaza-seating-pockets")).toBe(true);
    expect(environment.group.getObjectByName("plaza-pocket-benches")).toBeDefined();
    expect(environment.group.getObjectByName("plaza-pocket-planters")).toBeDefined();
    disposePlaza(environment.group); assets.dispose();
  });
});
