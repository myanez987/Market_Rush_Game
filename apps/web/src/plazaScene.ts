import * as THREE from "three";
import type { PublicPlayer, WorldEventVisual } from "@market-rush/shared";
import { createPlazaPockets, ROAD_INNER_RADIUS, ROAD_OUTER_RADIUS, type PlazaLayout, type PlazaLayoutEntry, type PlazaPocket } from "./plazaLayout.js";
import { buildModularStore, mergeStaticModules, playerTier, inventoryStacks } from "./districtArchitecture.js";
import { loftGeometry, panelGeometry, ringSurface, voxelClusterGeometry } from "./districtGeometry.js";

export const PLAYER_COLORS = [0xff895c, 0x57cbbd, 0xf7c955, 0xa392f3, 0xf2a4ba, 0x78bce2, 0xa9cb6b, 0xe39e67];
export interface PlazaAssets {
  material: (color: number, roughness?: number, metalness?: number, emissive?: number, opacity?: number) => THREE.MeshPhysicalMaterial;
  geometry: <T extends THREE.BufferGeometry>(key: string, factory: () => T) => T;
  dispose: () => void;
}
export interface StorefrontBuild { group: THREE.Group; selectable: THREE.Object3D[]; selectionRing: THREE.Mesh; }
export interface EnvironmentBuild { group: THREE.Group; fountainWater: THREE.Mesh; paving: THREE.Mesh[]; }
export const STOREFRONT_PROFILES = { cafe: "cafe", "online-shop": "parcel-hub", "cleaning-service": "service-garage", "app-studio": "digital-studio", "food-truck": "food-truck", "bike-repair": "bike-workshop", "content-studio": "soundstage", "pop-up-boutique": "boutique" } as const;

export function createPlazaAssets(): PlazaAssets {
  const materials = new Map<string, THREE.MeshPhysicalMaterial>(), geometries = new Map<string, THREE.BufferGeometry>();
  return {
    material(color, roughness = .75, metalness = .02, emissive = 0, opacity = 1) {
      const key = `${color}:${roughness}:${metalness}:${emissive}:${opacity}`;
      if (!materials.has(key)) materials.set(key, new THREE.MeshPhysicalMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive ? 1.6 : 0, clearcoat: roughness < .35 ? .52 : .07, clearcoatRoughness: roughness < .35 ? .12 : .6, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
      return materials.get(key)!;
    },
    geometry(key, factory) { if (!geometries.has(key)) geometries.set(key, factory()); return geometries.get(key) as ReturnType<typeof factory>; },
    dispose() { materials.forEach((m) => m.dispose()); geometries.forEach((g) => g.dispose()); }
  };
}

export function createReactionSprite(text: string, color: string, strikeThrough = false) {
  if (typeof document === "undefined") return new THREE.Sprite();
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.fillStyle = color; context.beginPath(); context.roundRect(10, 8, 76, 67, 19); context.fill();
  context.beginPath(); context.moveTo(35, 72); context.lineTo(44, 87); context.lineTo(54, 72); context.fill();
  context.fillStyle = "#20343e"; context.font = "bold 38px Segoe UI Emoji, sans-serif"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, 48, 44);
  if (strikeThrough) { context.strokeStyle = "#b6273c"; context.lineWidth = 7; context.beginPath(); context.moveTo(22, 60); context.lineTo(74, 27); context.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }));
  sprite.scale.set(.46, .46, .46); return sprite;
}

export function createStorefront(player: PublicPlayer, entry: PlazaLayoutEntry, color: number, _staffCount: number, _eventVisual: WorldEventVisual, assets: PlazaAssets, stock?: number, _severity?: string) {
  return buildModularStore(player, entry, color, assets, playerTier(player), stock ?? inventoryStacks(player));
}

/** One tiled concrete surface keeps the new seating pockets inexpensive to shade. */
function pocketSurface(pockets: PlazaPocket[]) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const pocket of pockets) {
    const steps = Math.max(2, Math.ceil((pocket.endAngle - pocket.startAngle) / .075));
    const first = positions.length / 3;
    for (let i = 0; i <= steps; i++) {
      const angle = pocket.startAngle + (pocket.endAngle - pocket.startAngle) * i / steps;
      for (const radius of [pocket.innerRadius, pocket.outerRadius]) {
        const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        positions.push(x, 0, z); uvs.push(x / 12 + .5, z / 12 + .5);
      }
      if (i < steps) { const a = first + i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createPlazaEnvironment(layout: PlazaLayout, event: WorldEventVisual, compact: boolean, assets: PlazaAssets, random: () => number): EnvironmentBuild {
  const group = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const lathe = (profile: Array<[number, number]>, segments = 72) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  add(lathe([[0, -.55], [11.25, -.55], [11.65, -.3], [11.65, -.07], [11.45, .2], [11.3, .28], [0, .28]]), assets.material(0x7b987e, .96), 0, 0, 0);
  const pavingMaterial = assets.material(0xc4beb0, .85);
  const paving = [add(ringSurface(1.06, 3.22), pavingMaterial, 0, .305, 0), add(ringSurface(6.95, 7.75), pavingMaterial, 0, .305, 0)];
  layout.entries.forEach((entry) => {
    const length = entry.radius - layout.plazaRingRadius;
    const path = add(panelGeometry(.82, .04, length), pavingMaterial, Math.cos(entry.angle) * (layout.plazaRingRadius + length / 2), .3, Math.sin(entry.angle) * (layout.plazaRingRadius + length / 2));
    path.rotation.y = Math.PI / 2 - entry.angle; paving.push(path);
  });
  // Match the actual arrival routes: perimeter gates → promenade → gaps between plots → civic square.
  const pavedSpoke = (angle: number, inner: number, outer: number, width: number) => {
    const path = add(panelGeometry(width, .04, outer - inner), pavingMaterial, Math.cos(angle) * (inner + outer) / 2, .3, Math.sin(angle) * (inner + outer) / 2);
    path.rotation.y = Math.PI / 2 - angle; paving.push(path);
  };
  layout.entries.forEach((entry) => pavedSpoke(entry.angle + Math.PI / layout.entries.length, 3.05, layout.promenadeRadius, .8));
  layout.gates.forEach((gate) => {
    const angle = Math.atan2(gate.z, gate.x);
    pavedSpoke(angle, layout.promenadeRadius, ROAD_INNER_RADIUS, .8);
    pavedSpoke(angle, ROAD_OUTER_RADIUS, Math.hypot(gate.x, gate.z), .8);
  });
  const pockets = createPlazaPockets(layout);
  if (pockets.length) {
    const concrete = add(pocketSurface(pockets), pavingMaterial, 0, .31, 0);
    concrete.name = "plaza-seating-pockets";
    paving.push(concrete);
  }
  const stone = assets.material(0xe1d5bc, .79);
  add(lathe([[.8, .3], [1.05, .3], [1.08, .39], [1.03, .55], [.88, .57], [.86, .39], [.8, .3]], 64), stone, 0, 0, 0);
  add(lathe([[0, .38], [.18, .38], [.24, .51], [.12, 1.02], [.39, 1.1], [.4, 1.2], [.18, 1.24], [.05, 1.42], [0, 1.44]], 40), stone, 0, 0, 0);
  const fountainWater = add(ringSurface(.16, .86, 48), assets.material(0x72c9cc, .19, .25, 0x164751), 0, .46, 0);
  const treeCount = compact ? 12 : 24;
  const leafGeometry = assets.geometry("voxel-tree-canopy", () => voxelClusterGeometry([
    [.46, .25, .43, 0, 0, 0], [.63, .28, .48, 0, .23, 0],
    [.49, .24, .57, -.06, .45, .015], [.29, .22, .32, .075, .65, 0],
    [.18, .16, .2, -.14, .75, -.1]
  ]));
  const leaves = new THREE.InstancedMesh(leafGeometry, assets.material(0x578b72, .9), treeCount);
  const trunks = new THREE.InstancedMesh(assets.geometry("voxel-tree-trunk", () => voxelClusterGeometry([
    [.13, .52, .13, 0, 0, 0], [.17, .12, .16, 0, -.22, 0]
  ])), assets.material(0x795e4b, .9), treeCount);
  const matrix = new THREE.Object3D();
  for (let i = 0; i < treeCount; i++) {
    const a = (i + .5) / treeCount * Math.PI * 2, r = 7.94 + random() * .08;
    matrix.position.set(Math.cos(a) * r, .58, Math.sin(a) * r); matrix.rotation.set(0, 0, 0); matrix.updateMatrix(); trunks.setMatrixAt(i, matrix.matrix);
    matrix.position.y = .94; matrix.rotation.y = Math.floor(random() * 4) * Math.PI / 2; matrix.updateMatrix(); leaves.setMatrixAt(i, matrix.matrix);
    leaves.setColorAt(i, new THREE.Color().setHSL(.38 + random() * .03, .23 + random() * .06, .36 + random() * .06));
  }
  trunks.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;
  group.add(trunks, leaves);
  const lampCount = compact ? 8 : 16;
  const lampPole = new THREE.InstancedMesh(loftGeometry([[0, .055, .055], [.12, .055, .055], [.15, .023, .023], [.96, .023, .023]], 6), assets.material(0x314958, .42, .5), lampCount);
  const lampGlow = new THREE.InstancedMesh(loftGeometry([[0, .07, .07], [.12, .1, .1], [.2, .05, .05]], 6), assets.material(0xf6d8a4, .5, .1, 0xffc784), lampCount);
  for (let i = 0; i < lampCount; i++) {
    const a = (i + .5) / lampCount * Math.PI * 2;
    matrix.position.set(Math.cos(a) * 3.52, .32, Math.sin(a) * 3.52); matrix.rotation.y = a; matrix.updateMatrix(); lampPole.setMatrixAt(i, matrix.matrix);
    matrix.position.y = 1.29; matrix.updateMatrix(); lampGlow.setMatrixAt(i, matrix.matrix);
  }
  lampPole.castShadow = true;
  group.add(lampPole, lampGlow);
  const benchCount = layout.entries.length * (compact ? 1 : 2);
  const benchAngle = (index: number) => layout.entries[0]!.angle + Math.PI / (2 * layout.entries.length) + index / benchCount * Math.PI * 2;
  const slats = new THREE.InstancedMesh(panelGeometry(.69, .04, .07, .014), assets.material(0xb89464), benchCount * 4);
  for (let i = 0; i < benchCount * 4; i++) {
    const a = benchAngle(Math.floor(i / 4));
    matrix.position.set(Math.cos(a) * 3.86, .56, Math.sin(a) * 3.86); matrix.rotation.y = -a;
    matrix.translateZ((i % 4 - 1.5) * .08); matrix.updateMatrix(); slats.setMatrixAt(i, matrix.matrix);
  }
  slats.castShadow = true; slats.receiveShadow = true;
  group.add(slats);
  const benchLegs = new THREE.InstancedMesh(panelGeometry(.055, .22, .26, .01), assets.material(0x314958, .45, .3), benchCount * 2);
  for (let i = 0; i < benchCount * 2; i++) {
    const a = benchAngle(Math.floor(i / 2));
    matrix.position.set(Math.cos(a) * 3.86, .43, Math.sin(a) * 3.86); matrix.rotation.y = -a;
    matrix.translateX(i % 2 ? .26 : -.26); matrix.updateMatrix(); benchLegs.setMatrixAt(i, matrix.matrix);
  }
  benchLegs.castShadow = true;
  group.add(benchLegs);
  // Pocket benches are larger than the inner-ring seating and face the civic fountain.
  const seatPockets = layout.entries.length >= 7 ? [] : compact ? pockets.filter((_, i) => i % 2 === 0) : pockets;
  const pocketSeat = new THREE.InstancedMesh(panelGeometry(.78, .07, .3), assets.material(0xa7754f, .78), seatPockets.length);
  const pocketFrame = new THREE.InstancedMesh(voxelClusterGeometry([
    [.05, .29, .31, -.31, .135, 0], [.05, .29, .31, .31, .135, 0],
    [.78, .22, .06, 0, .31, .14]
  ]), assets.material(0x425866, .55, .18), seatPockets.length);
  seatPockets.forEach((pocket, i) => {
    const a = pocket.centerAngle, r = pocket.benchRadius;
    matrix.position.set(Math.cos(a) * r, .58, Math.sin(a) * r); matrix.rotation.set(0, -a, 0); matrix.updateMatrix(); pocketSeat.setMatrixAt(i, matrix.matrix);
    matrix.position.y = .36; matrix.updateMatrix(); pocketFrame.setMatrixAt(i, matrix.matrix);
  });
  pocketSeat.castShadow = pocketFrame.castShadow = true;
  pocketSeat.receiveShadow = pocketFrame.receiveShadow = true;
  pocketSeat.name = "plaza-pocket-benches";
  group.add(pocketSeat, pocketFrame);
  const planterPockets = compact ? pockets.filter((_, i) => i % 2 === 1) : pockets;
  const planterBase = new THREE.InstancedMesh(panelGeometry(.37, .24, .37), assets.material(0xd0bca0, .88), planterPockets.length);
  const planterGreen = new THREE.InstancedMesh(voxelClusterGeometry([
    [.33, .16, .33, 0, .06, 0], [.22, .14, .22, -.06, .18, .04], [.16, .13, .16, .09, .2, -.07]
  ]), assets.material(0x638d6d, .95), planterPockets.length);
  planterPockets.forEach((pocket, i) => {
    const a = pocket.centerAngle, r = pocket.outerRadius - .3;
    matrix.position.set(Math.cos(a) * r, .44, Math.sin(a) * r); matrix.rotation.set(0, a, 0); matrix.updateMatrix(); planterBase.setMatrixAt(i, matrix.matrix);
    matrix.position.y = .61; matrix.updateMatrix(); planterGreen.setMatrixAt(i, matrix.matrix);
  });
  planterBase.castShadow = planterGreen.castShadow = true;
  planterBase.name = "plaza-pocket-planters";
  group.add(planterBase, planterGreen);
  if (event === "festival") {
    const flags = new THREE.InstancedMesh(panelGeometry(.21, .3, .025, .07), assets.material(0xffffff, .8), 24);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; matrix.position.set(Math.cos(a) * 1.7, 1.6 + Math.sin(i) * .08, Math.sin(a) * 1.7); matrix.rotation.set(0, -a, .13); matrix.updateMatrix(); flags.setMatrixAt(i, matrix.matrix); flags.setColorAt(i, new THREE.Color(PLAYER_COLORS[i % PLAYER_COLORS.length]!)); } group.add(flags);
  }
  if (event === "supply") {
    const pallets = new THREE.InstancedMesh(panelGeometry(.34, .27, .34), assets.material(0xc09868), 8);
    for (let i = 0; i < 8; i++) { matrix.position.set(-.7 + (i % 4) * .4, .48 + Math.floor(i / 4) * .29, -7.57); matrix.rotation.set(0, .05, 0); matrix.updateMatrix(); pallets.setMatrixAt(i, matrix.matrix); } group.add(pallets);
  }
  if (["labor", "digital", "rates"].includes(event)) {
    const sign = createReactionSprite(event === "labor" ? "!" : event === "digital" ? "◆" : "↑", event === "digital" ? "#a992ed" : "#efbc67"); sign.position.set(0, 1.6, -1.8); group.add(sign);
  }
  paving.forEach((p) => { p.userData.keepIndividual = true; }); fountainWater.userData.keepIndividual = true;
  mergeStaticModules(group);
  return { group, fountainWater, paving };
}

export function disposePlaza(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { materials.add(material); const map = (material as THREE.MeshStandardMaterial).map; if (map) textures.add(map); }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  geometries.forEach((g) => g.dispose()); textures.forEach((t) => t.dispose()); materials.forEach((m) => m.dispose());
}
