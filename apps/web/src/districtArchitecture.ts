import * as THREE from "three";
import { getVenture, rankBusinesses, type PublicPlayer } from "@market-rush/shared";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PlazaAssets, StorefrontBuild } from "./plazaScene.js";
import type { PlazaLayoutEntry } from "./plazaLayout.js";
import { panelGeometry, ringSurface } from "./districtGeometry.js";

export type ArchitectureTier = 1 | 2 | 3;
export const TIER_THRESHOLDS = [0, 25_000, 55_000] as const;
export function valuationTier(value: number): ArchitectureTier { return value >= TIER_THRESHOLDS[2] ? 3 : value >= TIER_THRESHOLDS[1] ? 2 : 1; }
export function playerTier(player: PublicPlayer) { return valuationTier(player.business ? rankBusinesses([{ playerId: player.id, business: player.business }])[0]!.companyValuation : 0); }
export const TIER_LABELS = { 1: "Startup", 2: "Growth", 3: "Market leader" } as const;

export function inventoryStacks(player: PublicPlayer) {
  const latest = player.business?.history.at(-1);
  if (!latest) return 0;
  const ratio = latest.inventory.endingUnits / Math.max(1, latest.unitsSold);
  return ratio < .25 ? 0 : Math.min(12, Math.ceil(ratio * 10));
}

/** Merge stationary modules by material while retaining a dedicated picking shell. */
export function mergeStaticModules(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  group.traverse((item) => {
    if (!(item instanceof THREE.Mesh) || item instanceof THREE.InstancedMesh || Array.isArray(item.material) || item.userData.keepIndividual) return;
    const bucket = buckets.get(item.material) ?? { geometries: [], meshes: [] };
    const geometry = item.geometry.clone().applyMatrix4(item.matrixWorld);
    const local = new THREE.Matrix4().copy(group.matrixWorld).invert(); geometry.applyMatrix4(local);
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); bucket.geometries.push(flat); } else bucket.geometries.push(geometry);
    bucket.meshes.push(item); buckets.set(item.material, bucket);
  });
  buckets.forEach(({ geometries, meshes }, material) => {
    if (meshes.length < 2) { geometries.forEach((g) => g.dispose()); return; }
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true;
    meshes.forEach((old) => old.removeFromParent()); group.add(mesh);
  });
}

function signTexture(text: string, subtitle: string, accent: string) {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext("2d"); if (!context) return undefined;
  context.fillStyle = "#162d39"; context.fillRect(0, 0, 512, 128);
  context.fillStyle = accent; context.fillRect(12, 12, 5, 104);
  context.textAlign = "center"; context.textBaseline = "middle";
  context.font = "800 38px system-ui"; context.fillStyle = "#f9f2d9";
  context.fillText(text.toUpperCase(), 268, 49, 458);
  context.font = "600 19px system-ui"; context.fillStyle = accent; context.fillText(subtitle.toUpperCase(), 268, 94, 458);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildModularStore(player: PublicPlayer, entry: PlazaLayoutEntry, color: number, assets: PlazaAssets, tier = playerTier(player), stock = inventoryStacks(player)): StorefrontBuild {
  const group = new THREE.Group(); group.name = `storefront:${player.id}`;
  group.position.set(entry.position.x, .31, entry.position.z); group.rotation.y = entry.rotationY;
  group.scale.setScalar(entry.scale); // Occupancy layout only. Tiers use distinct authored modules below.
  const venture = getVenture(player.ventureId ?? "");
  const wall = assets.material(tier === 1 ? 0xa77b61 : 0xe4e0cf, .82);
  const trim = assets.material(0x314754, .45, .3);
  const glass = assets.material(tier === 3 ? 0x79b7c7 : 0x487a88, .17, .5);
  const neon = assets.material(color, .3, .25, color);
  const module = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, r = 0) => {
    const key = `profile:${w}:${h}:${d}`;
    const mesh = new THREE.Mesh(assets.geometry(key, () => panelGeometry(w, h, d)), material);
    mesh.position.set(x, y, z); mesh.rotation.y = r; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  module(2.35, .14, 2.5, 0, .07, 0, assets.material(0xcdbf9f, .88));
  const stories = tier === 1 ? 1 : tier === 2 ? 2 : 3;
  for (let level = 0; level < stories; level++) {
    const y = .22 + level * .87, setback = tier === 3 && level === 2 ? .13 : 0;
    const width = 1.7 - setback * 2, depth = 1.25 - setback;
    module(width + .14, .11, depth + .14, 0, y, -.22, trim);
    module(width, .77, depth, 0, y + .43, -.22 - setback / 2, tier === 3 ? glass : wall);
    const bays = tier === 1 ? 3 : 4;
    for (let bay = 0; bay < bays; bay++) {
      const bx = -width / 2 + (bay + .5) * width / bays;
      module(width / bays - .035, .61, .025, bx, y + .44, .423 - setback, glass);
      module(.035, .71, .04, bx - width / bays / 2, y + .44, .445 - setback, trim);
    }
    for (const side of [-1, 1]) for (let bay = 0; bay < 3; bay++) {
      module(.33, .58, .025, side * (width / 2 + .008), y + .44, -.65 + bay * .37, glass, Math.PI / 2);
      module(.035, .7, .035, side * (width / 2 + .028), y + .43, -.84 + bay * .37, trim);
    }
    if (tier === 3) module(width + .15, .034, depth + .15, 0, y + .82, -.22, neon);
  }
  const roofY = .28 + stories * .87;
  module(1.86, .14, 1.44, 0, roofY, -.22, trim);
  // Layered roof blocks give each tier a crisp, built-from-voxels silhouette.
  for (let i = 0; i < 7; i++) {
    const x = -.78 + i * .26;
    module(.22, .09, .13, x, roofY + .105, .435, tier === 3 ? neon : trim);
    module(.22, .09, .13, x, roofY + .105, -.875, trim);
  }
  if (tier > 1) for (let level = 0; level < stories - 1; level++) {
    module(1.83, .055, 1.31, 0, 1.09 + level * .87, -.22, tier === 3 ? neon : trim);
  }
  if (tier === 1) {
    // Offset running-bond brick courses, instanced as one facade batch.
    const brick = assets.geometry("brick-module", () => panelGeometry(.177, .078, .038, .009));
    const transforms: THREE.Matrix4[] = [], transform = new THREE.Object3D();
    for (let row = 0; row < 8; row++) for (let column = 0; column < 8; column++) for (const side of [-1, 1]) {
      transform.position.set(side * .859, .3 + row * .087, -.8 + column * .155 + (row % 2) * .025);
      transform.rotation.y = Math.PI / 2; transform.updateMatrix(); transforms.push(transform.matrix.clone());
    }
    const bricks = new THREE.InstancedMesh(brick, assets.material(0xc18f70, .95), transforms.length);
    transforms.forEach((matrix, i) => bricks.setMatrixAt(i, matrix)); group.add(bricks);
  }
  const shadeColor = venture?.sector === "food" ? color : player.ventureId === "pop-up-boutique" ? 0xdca8b9 : 0xc7d8d0;
  if (tier < 3) {
    for (let strip = 0; strip < 8; strip++) {
      const awning = module(.21, .065, .43, -.735 + strip * .21, 1.015, .65, assets.material(strip % 2 ? 0xf7ebce : shadeColor));
      awning.rotation.x = -.16;
    }
  } else {
    module(1.96, .065, .5, 0, 1.09, .64, glass);
    for (const x of [-.81, .81]) module(.04, 1.04, .04, x, .65, .7, trim);
  }
  // Venture-specific facade attachments use repeated modules, not building scale changes.
  if (venture?.sector === "retail") for (let i = 0; i < 6; i++) module(.17, .17, .06, -.65 + (i % 3) * .2, .38 + Math.floor(i / 3) * .2, .467, assets.material(i % 2 ? color : 0xd5e2d9));
  if (venture?.sector === "services") for (let i = 0; i < 7; i++) module(.53, .035, .05, -.39, .38 + i * .06, .47, trim);
  if (venture?.sector === "digital") for (let i = 0; i < 3; i++) module(.035, .19 + i * .11, .04, -.59 + i * .13, .56, .47, neon);
  if (venture?.sector === "food") {
    module(.37, .025, .32, -.57, .42, .87, assets.material(0xbf9460));
    for (const x of [-.72, -.42]) module(.025, .23, .025, x, .29, .87, trim);
  }
  const sign = signTexture(venture?.name ?? "New venture", tier === 3 ? "Market leader" : player.nickname, `#${color.toString(16).padStart(6, "0")}`);
  const signMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: sign ?? null, emissive: tier === 3 ? 0xffffff : 0x444444, emissiveMap: sign ?? null, emissiveIntensity: tier === 3 ? 2.2 : .3, roughness: .36, metalness: .1, clearcoat: .45, clearcoatRoughness: .18 });
  module(1.7, .33, .055, 0, tier === 3 ? roofY + .2 : 1.16, .49, signMat);
  const crates = new THREE.InstancedMesh(assets.geometry("inventory-crate", () => panelGeometry(.24, .22, .25, .022)), assets.material(0xb78252, .9), Math.max(1, stock));
  crates.name = "inventory-stack"; crates.count = stock; crates.castShadow = true;
  const cratePose = new THREE.Object3D();
  for (let i = 0; i < stock; i++) {
    cratePose.position.set(-.62 + i % 4 * .31, .24 + Math.floor(i / 4) * .225, -1.04);
    cratePose.rotation.y = (i % 3 - 1) * .07; cratePose.updateMatrix(); crates.setMatrixAt(i, cratePose.matrix);
  }
  group.add(crates);
  mergeStaticModules(group);
  const selectionRing = new THREE.Mesh(ringSurface(1.26, 1.3, 48), neon); selectionRing.position.y = .16;
  selectionRing.visible = false; selectionRing.userData.keepIndividual = true; group.add(selectionRing);
  const selectable: THREE.Object3D[] = [];
  group.traverse((object) => { if (object instanceof THREE.Mesh && object !== selectionRing) { object.userData.playerId = player.id; selectable.push(object); } });
  group.userData.tier = tier; group.userData.inventoryCount = stock;
  return { group, selectable, selectionRing };
}
