import * as THREE from "three";
import type { WorldEventVisual } from "@market-rush/shared";
import { ROAD_INNER_RADIUS, ROAD_LANE_RADII, ROAD_OUTER_RADIUS, type PlazaLayout } from "./plazaLayout.js";
import { panelGeometry, ringSurface } from "./districtGeometry.js";
import type { PlazaAssets } from "./plazaScene.js";

const TAU = Math.PI * 2;
export interface MarketingStop { playerId: string; gateIndex: number; color: number; }
export interface VehicleTrack { curve: THREE.CatmullRomCurve3; radius: number; direction: 1 | -1; }
export interface CrossingPedestrian { position: { x: number; z: number }; visible: boolean; }

export function nearestRoadGate(angle: number) {
  return ((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4;
}

/** Only pegs actually on one of the four marked road crossings get right of way. */
export function occupiedRoadGates(pedestrians: readonly CrossingPedestrian[]) {
  const occupied = new Set<number>();
  for (const pedestrian of pedestrians) {
    if (!pedestrian.visible) continue;
    const { x, z } = pedestrian.position;
    const radius = Math.hypot(x, z);
    if (radius < ROAD_INNER_RADIUS - .28 || radius > ROAD_OUTER_RADIUS + .55) continue;
    const angle = Math.atan2(z, x), gate = nearestRoadGate(angle);
    const gateAngle = gate * Math.PI / 2;
    if (Math.abs(Math.atan2(Math.sin(angle - gateAngle), Math.cos(angle - gateAngle))) < .08) occupied.add(gate);
  }
  return occupied;
}

function stopBeforeCrossing(progress: number, step: number, track: VehicleTrack, occupied: ReadonlySet<number>, vehicleHalfLength: number) {
  const current = ((progress % 1) + 1) % 1;
  let allowed = Math.max(0, step), stopped = false;
  for (const gate of occupied) {
    const gateProgress = track.direction === 1 ? gate / 4 : (1 - gate / 4) % 1;
    const stopDistance = vehicleHalfLength + .62;
    const stopFraction = stopDistance / (TAU * track.radius);
    const stopProgress = ((gateProgress - stopFraction) % 1 + 1) % 1;
    const passedStop = (current - stopProgress + 1) % 1;
    // A crossing can become occupied after a car has entered its approach. Pull it
    // back to the stop line instead of leaving it inside a pedestrian's path.
    if (passedStop > 0 && passedStop < stopFraction) return { progress: stopProgress, stopped: true };
    const untilStop = (stopProgress - current + 1) % 1;
    if (untilStop <= allowed) { allowed = untilStop; stopped = true; }
  }
  return { progress: (current + allowed) % 1, stopped };
}

function driverArgument(text: string) {
  const sprite = new THREE.Sprite();
  sprite.name = "driver-argument";
  sprite.position.set(0, 1.24, 0);
  sprite.scale.set(2.16, .86, 1);
  sprite.visible = false;
  if (typeof document === "undefined") return sprite;
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 192;
  const context = canvas.getContext("2d");
  if (!context) return sprite;
  context.fillStyle = "#fff5df";
  context.beginPath(); context.roundRect(10, 10, 492, 142, 34); context.fill();
  context.strokeStyle = "#b74d3c"; context.lineWidth = 9; context.stroke();
  context.beginPath(); context.moveTo(220, 145); context.lineTo(255, 185); context.lineTo(282, 145); context.fill();
  context.fillStyle = "#8f342c"; context.font = "bold 37px sans-serif";
  context.textAlign = "center"; context.textBaseline = "middle";
  context.fillText(text, 256, 81, 452);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  sprite.material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
  return sprite;
}

/** Closed, arc-length-sampled tracks keep all vehicles inside their own road lane. */
export function createVehicleTracks(): [VehicleTrack, VehicleTrack] {
  return ROAD_LANE_RADII.map((radius, lane) => ({
    radius,
    direction: lane === 0 ? 1 as const : -1 as const,
    curve: new THREE.CatmullRomCurve3(
      Array.from({ length: 48 }, (_, i) => new THREE.Vector3(Math.cos(i / 48 * TAU) * radius, .47, Math.sin(i / 48 * TAU) * radius)),
      true,
      "centripetal"
    )
  })) as [VehicleTrack, VehicleTrack];
}

export function sampleVehicleTrack(track: VehicleTrack, progress: number) {
  const u = ((progress % 1) + 1) % 1;
  const parameter = track.direction === 1 ? u : (1 - u) % 1;
  const position = track.curve.getPointAt(parameter);
  const tangent = track.curve.getTangentAt(parameter).multiplyScalar(track.direction);
  return { position, heading: Math.atan2(tangent.x, tangent.z) };
}

export function createRingRoad(assets: PlazaAssets, event: WorldEventVisual) {
  const group = new THREE.Group(); group.name = "two-lane-ring-road";
  const wet = event === "rain";
  const asphalt = assets.material(wet ? 0x252c37 : 0x343b45, wet ? .2 : .87, wet ? .18 : .04);
  asphalt.clearcoat = wet ? .94 : .08;
  asphalt.clearcoatRoughness = wet ? .09 : .62;
  const surface = new THREE.Mesh(ringSurface(ROAD_INNER_RADIUS, ROAD_OUTER_RADIUS, 128), asphalt);
  surface.name = "ring-road-asphalt"; surface.position.y = .323; surface.receiveShadow = true; group.add(surface);
  const curb = assets.material(0xc4bdb0, .73);
  for (const radius of [ROAD_INNER_RADIUS - .045, ROAD_OUTER_RADIUS + .045]) {
    const edge = new THREE.Mesh(ringSurface(radius - .07, radius + .07, 128), curb);
    edge.name = "road-curb"; edge.position.y = .34; edge.receiveShadow = true; group.add(edge);
  }
  const line = assets.material(0xf2ddad, .58, .03, wet ? 0x4b3813 : 0);
  const dashGeometry = panelGeometry(.025, .012, .35);
  const dashes = new THREE.InstancedMesh(dashGeometry, line, 64);
  dashes.name = "lane-divider"; dashes.frustumCulled = false;
  const stamp = new THREE.Object3D();
  for (let i = 0; i < 64; i++) {
    const angle = i / 64 * TAU;
    stamp.position.set(Math.cos(angle) * 9.68, .352, Math.sin(angle) * 9.68);
    stamp.rotation.y = -angle; stamp.updateMatrix(); dashes.setMatrixAt(i, stamp.matrix);
  }
  group.add(dashes);
  const bars = new THREE.InstancedMesh(panelGeometry(.88, .013, .16), assets.material(0xf1eee1, .63), 4 * 9);
  bars.name = "pedestrian-crosswalks"; bars.frustumCulled = false; bars.receiveShadow = true;
  for (let gate = 0; gate < 4; gate++) for (let stripe = 0; stripe < 9; stripe++) {
    const angle = gate * Math.PI / 2, radius = ROAD_INNER_RADIUS + .18 + stripe * .25;
    stamp.position.set(Math.cos(angle) * radius, .356, Math.sin(angle) * radius);
    stamp.rotation.y = Math.PI / 2 - angle; stamp.updateMatrix(); bars.setMatrixAt(gate * 9 + stripe, stamp.matrix);
  }
  group.add(bars);
  return group;
}

function vehicle(assets: PlazaAssets, type: "car" | "bus", color: number) {
  const bus = type === "bus", group = new THREE.Group();
  group.name = bus ? "marketing-city-bus" : "ambient-car";
  const body = assets.material(color, .3, .14), glass = assets.material(0x618999, .13, .48);
  const dark = assets.material(0x273039, .7), lamp = assets.material(0xffedbd, .22, .02, 0xffd794);
  const add = (key: string, size: [number, number, number], material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(assets.geometry(key, () => panelGeometry(...size)), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  };
  const length = bus ? 1.83 : 1.02;
  add(`vehicle-base-${type}`, [bus ? .8 : .62, .34, length], body, 0, .3, 0);
  add(`vehicle-roof-${type}`, [bus ? .76 : .46, bus ? .42 : .25, bus ? 1.63 : .63], bus ? body : glass, 0, bus ? .65 : .57, bus ? -.02 : -.07);
  if (bus) {
    add("bus-windshield", [.66, .28, .02], glass, 0, .67, .89);
    add("bus-ad-panel", [.82, .13, 1.25], assets.material(0xfff1c5, .4, .02, color), 0, .79, -.05);
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) add("bus-window", [.018, .19, .24], glass, side * .4, .67, -.61 + i * .38);
  }
  for (const side of [-1, 1]) {
    for (const z of [bus ? -.62 : -.32, bus ? .64 : .32]) {
      add("voxel-wheel", [.12, .2, .21], dark, side * (bus ? .42 : .33), .14, z);
    }
    add("vehicle-headlight", [.13, .12, .025], lamp, side * (bus ? .29 : .23), .36, length / 2 + .01);
  }
  return group;
}

/** Traffic is presentation-only; marketing passengers are drawn from existing authoritative cohorts. */
export function createDistrictTraffic(layout: PlazaLayout, event: WorldEventVisual, assets: PlazaAssets, stops: MarketingStop[], compact: boolean) {
  const group = createRingRoad(assets, event), tracks = createVehicleTracks();
  const argumentsByDriver = ["HEY! I'M DRIVING HERE!", "HEY! WATCH IT!"] as const;
  const cars = Array.from({ length: compact ? 2 : 4 }, (_, i) => {
    const mesh = vehicle(assets, "car", [0xb96f5d, 0x5b94b0, 0xb5a564, 0x819b85][i]!);
    mesh.add(driverArgument(argumentsByDriver[i % 2]!));
    group.add(mesh); return mesh;
  });
  const carProgress = cars.map((_, i) => (i * .24 + .1) % 1);
  let lastElapsed = 0;
  const buses = stops.filter((stop) => stop.gateIndex >= 0 && stop.gateIndex < layout.gates.length).slice(0, 3).map((stop) => {
    const mesh = vehicle(assets, "bus", stop.color); group.add(mesh); return { mesh, stop };
  });
  const update = (elapsedSeconds: number, pedestrians: readonly CrossingPedestrian[] = []) => {
    const elapsedStep = Math.max(0, elapsedSeconds - lastElapsed);
    lastElapsed = Math.max(lastElapsed, elapsedSeconds);
    const occupied = occupiedRoadGates(pedestrians);
    cars.forEach((mesh, i) => {
      const track = tracks[i % 2]!;
      const next = stopBeforeCrossing(carProgress[i]!, elapsedStep / (i % 2 ? 34 : 28), track, occupied, .51);
      carProgress[i] = next.progress;
      const point = sampleVehicleTrack(track, next.progress);
      mesh.position.copy(point.position); mesh.rotation.y = point.heading;
      mesh.getObjectByName("driver-argument")!.visible = next.stopped;
    });
    buses.forEach(({ mesh, stop }, i) => {
      // Travel to a curbside stop in four seconds, dwell for six, then rejoin the loop.
      const gateU = stop.gateIndex / 4 + .012;
      const stopU = (1 - gateU + 1) % 1; // Outer lane travels clockwise.
      const startU = stopU - .18 - i * .065;
      const u = elapsedSeconds < 4 ? startU + (stopU - startU) * elapsedSeconds / 4
        : elapsedSeconds < 10 ? stopU : stopU + (elapsedSeconds - 10) / 38;
      const point = sampleVehicleTrack(tracks[1], u);
      mesh.position.copy(point.position); mesh.rotation.y = point.heading;
    });
  };
  update(0);
  return {
    group, tracks, buses, update,
    arguingDriver: () => {
      const index = cars.findIndex((car) => car.getObjectByName("driver-argument")?.visible);
      return index < 0 ? undefined : { car: cars[index]!, text: argumentsByDriver[index % 2]! };
    },
    busHasArrived: (playerId: string, elapsedSeconds: number) => buses.some(({ stop }) => stop.playerId === playerId) && elapsedSeconds >= 4,
    dispose: () => { /* Shared geometry and materials are released with the plaza scene. */ }
  };
}
