import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createNpcClip, InstancedCrowd, PEG_HEIGHT, petCompanionPoint } from "./npcCrowd.js";
import { buildModularStore, valuationTier } from "./districtArchitecture.js";
import { createPlazaAssets, disposePlaza } from "./plazaScene.js";
import { computePlazaLayout } from "./plazaLayout.js";
import { phaseSunProgress } from "./districtAtmosphere.js";
import { createDistrictHdri } from "./districtHdri.js";
import { panelGeometry, voxelClusterGeometry } from "./districtGeometry.js";
import { createDistrictTraffic, createVehicleTracks, nearestRoadGate, occupiedRoadGates, sampleVehicleTrack } from "./districtTraffic.js";
import { ROAD_INNER_RADIUS, ROAD_LANE_RADII, ROAD_OUTER_RADIUS } from "./plazaLayout.js";
import type { PublicPlayer } from "@market-rush/shared";

describe("instanced board-game pegs", () => {
  it("uses valid looping clips with different movements", () => {
    const clips = ["walk", "impatient", "frustrated"].map((state) => createNpcClip(state as "walk"));
    expect(clips.every((clip) => clip.validate())).toBe(true);
    expect(new Set(clips.map((clip) => clip.duration)).size).toBe(3);
    expect(clips[1]!.tracks.find((track) => track.name === "body.quaternion")!.values).not.toEqual(clips[0]!.tracks.find((track) => track.name === "body.quaternion")!.values);
  });
  it("animates 80 small single-color pegs and instanced rider attachments", () => {
    const crowd = new InstancedCrowd();
    for (let i = 0; i < 80; i++) expect(crowd.add({ position: new THREE.Vector3(i, 0, 0), heading: 0, animation: "walk", visible: true, phase: 0, pegColor: i === 0 ? 0xff895c : undefined, mobility: i === 0 ? "bicycle" : i === 1 ? "hoverboard" : undefined, pet: i === 2 ? "dog" : i === 3 ? "cat" : undefined, sentiment: i === 0 ? "disappointed" : "satisfied", showSentiment: i === 0 })).toBe(i);
    expect(crowd.add(crowd.poses[0]!)).toBe(-1);
    expect(crowd.group.children.length).toBe(8);
    expect(crowd.group.children.every((item) => item instanceof THREE.InstancedMesh)).toBe(true);
    expect(PEG_HEIGHT).toBeLessThan(.7);
    const peg = crowd.group.getObjectByName("peg:body") as THREE.InstancedMesh;
    const head = crowd.group.getObjectByName("peg:head") as THREE.InstancedMesh;
    peg.geometry.computeBoundingBox();
    expect(peg.geometry.boundingBox!.max.x - peg.geometry.boundingBox!.min.x).toBeLessThan(.25);
    const color = new THREE.Color();
    peg.getColorAt(0, color); expect(color.getHex()).toBe(0xff895c);
    head.getColorAt(0, color); expect(color.getHex()).toBe(0xff895c);
    crowd.update(0, false);
    const bicycle = crowd.group.getObjectByName("peg:bicycle") as THREE.InstancedMesh;
    const hoverboard = crowd.group.getObjectByName("peg:hoverboard") as THREE.InstancedMesh;
    const attached = new THREE.Matrix4(); bicycle.getMatrixAt(0, attached);
    expect(attached.elements[13]).toBe(0);
    hoverboard.getMatrixAt(1, attached);
    expect(attached.elements[12]).toBe(1);
    const dog = crowd.group.getObjectByName("peg:pet-dog") as THREE.InstancedMesh;
    const cat = crowd.group.getObjectByName("peg:pet-cat") as THREE.InstancedMesh;
    dog.getMatrixAt(2, attached); expect(attached.elements[12]).toBe(2);
    cat.getMatrixAt(3, attached); expect(attached.elements[12]).toBe(3);
    dog.getMatrixAt(3, attached); expect(attached.elements[13]).toBe(-200);
    const leash = crowd.group.getObjectByName("peg:pet-leash") as THREE.InstancedMesh;
    leash.getMatrixAt(2, attached); expect(attached.elements[12]).toBe(2);
    leash.getMatrixAt(4, attached); expect(attached.elements[13]).toBe(-200);
    expect(petCompanionPoint({ position: new THREE.Vector3(2, .35, 3), heading: 0 })).toEqual({ x: 2.3, z: 2.88 });
    const sentiment = crowd.group.getObjectByName("peg:service-sentiment") as THREE.InstancedMesh;
    sentiment.getColorAt(0, color); expect(color.getHex()).toBe(0xf0736e);
    sentiment.getMatrixAt(0, attached); expect(attached.elements[13]).toBe(0);
    sentiment.getMatrixAt(1, attached); expect(attached.elements[13]).toBe(-200);
    const before = new THREE.Matrix4(); peg.getMatrixAt(0, before);
    crowd.update(.2, false);
    const after = new THREE.Matrix4(); peg.getMatrixAt(0, after);
    expect(after.equals(before)).toBe(false);
    crowd.update(.2, true);
    const paused = new THREE.Matrix4(); peg.getMatrixAt(0, paused);
    expect(paused.equals(after)).toBe(true);
    expect(peg.count).toBe(80);
    crowd.poses[0]!.animation = "frustrated";
    crowd.update(.2, false);
    peg.getMatrixAt(0, before);
    expect(before.equals(after)).toBe(false);
    crowd.dispose();
  });
});

describe("outer ring road traffic", () => {
  it("uses two closed, separated Catmull-Rom lanes inside the roadway", () => {
    const tracks = createVehicleTracks();
    for (let lane = 0; lane < 2; lane++) {
      expect(tracks[lane]!.curve).toBeInstanceOf(THREE.CatmullRomCurve3);
      expect(tracks[lane]!.curve.closed).toBe(true);
      for (let step = 0; step < 40; step++) {
        const { position } = sampleVehicleTrack(tracks[lane]!, step / 40);
        const radius = Math.hypot(position.x, position.z);
        expect(radius).toBeGreaterThan(ROAD_INNER_RADIUS + .25);
        expect(radius).toBeLessThan(ROAD_OUTER_RADIUS - .25);
        expect(radius).toBeCloseTo(ROAD_LANE_RADII[lane]!, 2);
      }
    }
  });
  it("places four marked crossings and stops a marketing bus at the nearest gate", () => {
    const assets = createPlazaAssets(), layout = computePlazaLayout(["a", "b", "c", "d"]);
    const gateIndex = nearestRoadGate(layout.entries[2]!.angle);
    const traffic = createDistrictTraffic(layout, "clear", assets, [{ playerId: "c", gateIndex, color: 0xff895c }], false);
    expect((traffic.group.getObjectByName("pedestrian-crosswalks") as THREE.InstancedMesh).count).toBe(36);
    const car = traffic.group.getObjectByName("ambient-car")!;
    const before = car.position.clone(); traffic.update(5);
    expect(car.position.distanceTo(before)).toBeGreaterThan(.1);
    traffic.update(4); const busAtStop = traffic.buses[0]!.mesh.position.clone();
    traffic.update(9); expect(traffic.buses[0]!.mesh.position.distanceTo(busAtStop)).toBeLessThan(.001);
    expect(traffic.busHasArrived("c", 4)).toBe(true);
    expect(traffic.busHasArrived("c", 3.9)).toBe(false);
    const angularError = Math.atan2(Math.sin(Math.atan2(busAtStop.z, busAtStop.x) - gateIndex * Math.PI / 2), Math.cos(Math.atan2(busAtStop.z, busAtStop.x) - gateIndex * Math.PI / 2));
    expect(Math.abs(angularError)).toBeLessThan(.1);
    disposePlaza(traffic.group); assets.dispose();
  });
  it("yields both road lanes to crossing pegs and shows the driver's argument only while stopped", () => {
    const assets = createPlazaAssets(), layout = computePlazaLayout(["a", "b"]);
    const traffic = createDistrictTraffic(layout, "clear", assets, [], false);
    const cars = traffic.group.children.filter((item) => item.name === "ambient-car");
    const firstCrossing = { position: new THREE.Vector3(0, .35, ROAD_LANE_RADII[0]), visible: true };
    const secondCrossing = { position: new THREE.Vector3(-ROAD_LANE_RADII[1], .35, 0), visible: true };
    expect([...occupiedRoadGates([firstCrossing, secondCrossing])]).toEqual([1, 2]);
    expect(occupiedRoadGates([{ ...firstCrossing, visible: false }]).size).toBe(0);
    traffic.update(5, [firstCrossing, secondCrossing]);
    const held = cars.slice(0, 2).map((car) => car.position.clone());
    const firstGap = Math.abs(Math.atan2(Math.sin(Math.atan2(held[0]!.z, held[0]!.x) - Math.PI / 2), Math.cos(Math.atan2(held[0]!.z, held[0]!.x) - Math.PI / 2)));
    const secondGap = Math.abs(Math.atan2(Math.sin(Math.atan2(held[1]!.z, held[1]!.x) - Math.PI), Math.cos(Math.atan2(held[1]!.z, held[1]!.x) - Math.PI)));
    expect(firstGap).toBeGreaterThan(.1);
    expect(secondGap).toBeGreaterThan(.1);
    expect(cars[0]!.getObjectByName("driver-argument")!.visible).toBe(true);
    expect(cars[1]!.getObjectByName("driver-argument")!.visible).toBe(true);
    expect(traffic.arguingDriver()?.text).toBe("HEY! I'M DRIVING HERE!");
    traffic.update(8, [firstCrossing, secondCrossing]);
    expect(cars[0]!.position.distanceTo(held[0]!)).toBeLessThan(.001);
    expect(cars[1]!.position.distanceTo(held[1]!)).toBeLessThan(.001);
    traffic.update(9, []);
    expect(cars[0]!.position.distanceTo(held[0]!)).toBeGreaterThan(.1);
    expect(cars[1]!.position.distanceTo(held[1]!)).toBeGreaterThan(.1);
    expect(cars[0]!.getObjectByName("driver-argument")!.visible).toBe(false);
    expect(traffic.arguingDriver()).toBeUndefined();
    disposePlaza(traffic.group); assets.dispose();
  });
});

describe("financial architecture and lighting", () => {
  it("builds a float HDR light environment and physically based voxel kit", () => {
    const panorama = createDistrictHdri(64, 32);
    expect(panorama.type).toBe(THREE.FloatType);
    expect(panorama.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(Math.max(...(panorama.image.data as Float32Array))).toBeGreaterThan(1);
    const assets = createPlazaAssets();
    expect(assets.material(0xffffff)).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    const panel = panelGeometry(1, 1, 1);
    expect(panel.attributes.normal?.count).toBe(24);
    const cluster = voxelClusterGeometry([[.2, .2, .2, 0, 0, 0], [.1, .1, .1, 0, .2, 0]]);
    expect(cluster.attributes.position?.count).toBe(48);
    panel.dispose(); cluster.dispose(); panorama.dispose(); assets.dispose();
  });
  it("upgrades only at explicit company valuation thresholds", () => {
    expect([-100, 0, 24999, 25000, 54999, 55000].map(valuationTier)).toEqual([1, 1, 1, 2, 2, 3]);
  });
  it("assembles distinct tiers without scaling the building into pedestrian paths", () => {
    const player: PublicPlayer = { id: "founder", nickname: "Founder", ventureId: "app-studio", isBot: false, isHost: true, ready: true, connected: true, spectator: false, decisionSubmitted: false };
    const entry = computePlazaLayout([player.id, "rival"]).entries[0]!;
    const assets = createPlazaAssets();
    const stores = ([1, 2, 3] as const).map((tier) => buildModularStore(player, entry, 0x88ccbb, assets, tier, 12));
    const boxes = stores.map((store) => { store.group.position.set(0, 0, 0); store.group.rotation.set(0, 0, 0); store.group.scale.setScalar(1); return new THREE.Box3().setFromObject(store.group); });
    expect(boxes[2]!.max.y).toBeGreaterThan(boxes[1]!.max.y);
    expect(boxes[1]!.max.y).toBeGreaterThan(boxes[0]!.max.y);
    expect(boxes.every((box) => box.max.x <= 1.31 && box.min.x >= -1.31 && box.max.z <= 1.31 && box.min.z >= -1.31)).toBe(true);
    expect(stores.every((store) => store.selectable.every((part) => part.userData.playerId === player.id))).toBe(true);
    stores.forEach((store) => disposePlaza(store.group)); assets.dispose();
  });
  it("maps authoritative phases to sunrise, midday and sunset", () => {
    expect(phaseSunProgress("forecast", 0)).toBeLessThan(phaseSunProgress("decisions", 0));
    expect(phaseSunProgress("decisions", 1)).toBe(phaseSunProgress("operations", 0));
    expect(phaseSunProgress("results", 1)).toBeGreaterThan(phaseSunProgress("results", 0));
  });
});
