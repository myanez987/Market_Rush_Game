import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { voxelClusterGeometry } from "./districtGeometry.js";
import type { ServiceSentiment } from "./serviceSentiment.js";

export type NpcAnimation = "walk" | "impatient" | "frustrated";
export type PetKind = "dog" | "cat";
export const CROWD_LIMIT = 80;
const PHASES = 4;
const STATES: NpcAnimation[] = ["walk", "impatient", "frustrated"];
// Bright molded-plastic colors keep individual customers legible from the plaza camera.
const PEG_COLORS = [0xf2785b, 0x60beb1, 0xf2c553, 0xa78dde, 0xe78ba8, 0x71a9de, 0xa6c867, 0xdb995a];
export const PEG_HEIGHT = 0.635;

export interface NpcPose {
  position: THREE.Vector3;
  heading: number;
  animation: NpcAnimation;
  visible: boolean;
  staff?: boolean;
  pegColor?: number;
  phase?: number;
  mobility?: "bicycle" | "hoverboard";
  pet?: PetKind;
  sentiment?: ServiceSentiment;
  showSentiment?: boolean;
}

const SENTIMENT_COLORS: Record<ServiceSentiment, number> = {
  satisfied: 0x58d68f,
  mixed: 0xf4c95d,
  disappointed: 0xf0736e
};

/** A tiny two-wheel silhouette, merged once and instanced for all riders. */
function bicycleGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-.22, .22]) parts.push(new THREE.TorusGeometry(.125, .024, 3, 8).rotateY(Math.PI / 2).translate(0, .145, z));
  parts.push(new THREE.BoxGeometry(.035, .035, .44).translate(0, .15, 0));
  parts.push(new THREE.BoxGeometry(.25, .025, .035).translate(0, .32, .2));
  parts.push(new THREE.BoxGeometry(.15, .025, .035).translate(0, .28, -.08));
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error("Could not build bicycle attachment");
  return merged;
}

/** Companion geometry is baked beside its owner, so both share one route and heading. */
function petGeometry(kind: PetKind) {
  const dog = kind === "dog";
  const x = .3, z = -.12;
  return voxelClusterGeometry(dog ? [
    [.2, .15, .28, x, .13, z], [.15, .14, .13, x, .21, z + .19],
    [.05, .12, .06, x - .055, .075, z + .09], [.05, .12, .06, x + .055, .075, z + .09],
    [.05, .12, .06, x - .055, .075, z - .2], [.05, .12, .06, x + .055, .075, z - .2],
    [.06, .14, .06, x - .09, .29, z + .19], [.06, .14, .06, x + .09, .29, z + .19],
    [.055, .07, .12, x, .22, z - .29]
  ] : [
    [.14, .12, .23, x, .115, z], [.13, .13, .12, x, .19, z + .16],
    [.04, .09, .04, x - .045, .055, z + .08], [.04, .09, .04, x + .045, .055, z + .08],
    [.04, .09, .04, x - .045, .055, z - .15], [.04, .09, .04, x + .045, .055, z - .15],
    [.045, .075, .045, x - .06, .29, z + .16], [.045, .075, .045, x + .06, .29, z + .16],
    [.045, .13, .045, x, .22, z - .24]
  ]);
}

export function petCompanionPoint(pose: Pick<NpcPose, "position" | "heading">) {
  const x = .3, z = -.12, c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  return { x: pose.position.x + c * x + s * z, z: pose.position.z - s * x + c * z };
}

function createRig() {
  const root = new THREE.Group();
  const bones: Record<string, THREE.Bone> = {};
  const body = new THREE.Bone(); body.name = "body"; root.add(body); bones.body = body;
  const head = new THREE.Bone(); head.name = "head"; head.position.y = 0.445; body.add(head); bones.head = head;
  return { root, bones };
}

function quaternionTrack(name: string, angles: Array<[number, number, number]>, duration: number) {
  const values: number[] = [];
  angles.forEach(([x, y, z]) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)); values.push(q.x, q.y, q.z, q.w); });
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, angles.map((_, i) => i / (angles.length - 1) * duration), values);
}

export function createNpcClip(state: NpcAnimation) {
  const duration = state === "impatient" ? 1.6 : state === "frustrated" ? 0.54 : 0.78;
  const tilt: Array<[number, number, number]> = state === "walk"
    ? [[0.025, 0, -0.075], [0.015, 0, 0.075], [0.025, 0, -0.075], [0.015, 0, 0.075], [0.025, 0, -0.075]]
    : state === "impatient"
      ? [[0, 0, 0], [0, 0, 0.055], [0, 0, -0.05], [0, 0, 0]]
      : [[0.18, 0, -0.16], [0.3, 0, 0.16], [0.2, 0, -0.14], [0.3, 0, 0.16], [0.18, 0, -0.16]];
  const bounce = state === "impatient" ? [0, 0.005, 0, 0] : state === "frustrated" ? [0, 0.05, 0, 0.05, 0] : [0, 0.027, 0, 0.027, 0];
  const position = bounce.flatMap((y) => [0, y, 0]);
  return new THREE.AnimationClip(state, duration, [
    quaternionTrack("body", tilt, duration),
    new THREE.VectorKeyframeTrack("body.position", bounce.map((_, i) => i / (bounce.length - 1) * duration), position)
  ]);
}

/** Twelve shared mixers animate peg tilt and bounce; body and head each draw in one instance batch. */
export class InstancedCrowd {
  readonly group = new THREE.Group();
  readonly poses: NpcPose[] = [];
  readonly clips = STATES.map(createNpcClip);
  private rigs = STATES.flatMap((state, stateIndex) => Array.from({ length: PHASES }, (_, phase) => {
    const rig = createRig(), mixer = new THREE.AnimationMixer(rig.root);
    const action = mixer.clipAction(this.clips[stateIndex]!); action.play();
    mixer.setTime(phase / PHASES * this.clips[stateIndex]!.duration);
    return { ...rig, mixer, state };
  }));
  private batches: Array<{ mesh: THREE.InstancedMesh; bone: string }> = [];
  private transform = new THREE.Matrix4();
  private combined = new THREE.Matrix4();
  private rotation = new THREE.Quaternion();
  private scale = new THREE.Vector3(1, 1, 1);
  private axis = new THREE.Vector3(0, 1, 0);
  private hidden = new THREE.Matrix4().makeTranslation(0, -200, 0);
  private material = new THREE.MeshPhysicalMaterial({ roughness: .38, metalness: .04, clearcoat: .38, clearcoatRoughness: .22 });
  private mobilityMeshes: THREE.InstancedMesh[] = [];
  private mobilityMaterials: THREE.MeshPhysicalMaterial[] = [];
  private petMeshes: THREE.InstancedMesh[] = [];
  private petMaterials: THREE.MeshPhysicalMaterial[] = [];
  private leashMesh: THREE.InstancedMesh;
  private leashMaterial = new THREE.MeshPhysicalMaterial({ color: 0x624b47, roughness: .86 });
  private sentimentMesh: THREE.InstancedMesh;
  private sentimentMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .28, metalness: .04, clearcoat: .5 });

  constructor(readonly limit = CROWD_LIMIT) {
    this.group.name = "instanced-board-game-pegs";
    const add = (bone: string, geometry: THREE.BufferGeometry) => {
      const mesh = new THREE.InstancedMesh(geometry, this.material, limit);
      mesh.name = `peg:${bone}`; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
      for (let i = 0; i < limit; i++) {
        mesh.setMatrixAt(i, this.hidden);
        mesh.setColorAt(i, new THREE.Color(PEG_COLORS[i % PEG_COLORS.length]!));
      }
      this.batches.push({ mesh, bone }); this.group.add(mesh);
    };
    // A small Game-of-Life peg silhouette, rebuilt as distinct molded blocks.
    add("body", voxelClusterGeometry([
      [.22, .045, .22, 0, .025, 0], [.175, .22, .175, 0, .17, 0],
      [.135, .1, .135, 0, .326, 0], [.085, .09, .085, 0, .416, 0]
    ]));
    add("head", voxelClusterGeometry([
      [.15, .12, .15, 0, .086, 0], [.105, .04, .105, 0, .166, 0]
    ]));
    const mobility = [
      { name: "bicycle", geometry: bicycleGeometry(), material: new THREE.MeshPhysicalMaterial({ color: 0x384d59, roughness: .48, metalness: .58 }) },
      { name: "hoverboard", geometry: new THREE.CylinderGeometry(.19, .19, .055, 10).translate(0, .04, 0), material: new THREE.MeshPhysicalMaterial({ color: 0x73e3e1, roughness: .22, metalness: .38, emissive: 0x2dd1ce, emissiveIntensity: 1.2 }) }
    ];
    mobility.forEach(({ name, geometry, material }) => {
      const mesh = new THREE.InstancedMesh(geometry, material, limit);
      mesh.name = `peg:${name}`; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
      for (let i = 0; i < limit; i++) mesh.setMatrixAt(i, this.hidden);
      this.group.add(mesh); this.mobilityMeshes.push(mesh); this.mobilityMaterials.push(material);
    });
    for (const [name, color] of [["dog", 0xba8b59], ["cat", 0x8e9da5]] as const) {
      const material = new THREE.MeshPhysicalMaterial({ color, roughness: .67, metalness: .01, clearcoat: .18 });
      const mesh = new THREE.InstancedMesh(petGeometry(name), material, limit);
      mesh.name = `peg:pet-${name}`; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
      for (let i = 0; i < limit; i++) mesh.setMatrixAt(i, this.hidden);
      this.group.add(mesh); this.petMeshes.push(mesh); this.petMaterials.push(material);
    }
    this.leashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.24, .012, .012).translate(.18, .245, .1), this.leashMaterial, limit);
    this.leashMesh.name = "peg:pet-leash";
    this.leashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leashMesh.frustumCulled = false;
    for (let i = 0; i < limit; i++) this.leashMesh.setMatrixAt(i, this.hidden);
    this.group.add(this.leashMesh);
    this.sentimentMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.135, .135, .045).rotateZ(Math.PI / 4).translate(0, .79, 0), this.sentimentMaterial, limit);
    this.sentimentMesh.name = "peg:service-sentiment";
    this.sentimentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sentimentMesh.frustumCulled = false;
    for (let i = 0; i < limit; i++) this.sentimentMesh.setMatrixAt(i, this.hidden);
    this.group.add(this.sentimentMesh);
  }

  add(pose: NpcPose) {
    if (this.poses.length >= this.limit) return -1;
    const index = this.poses.length; this.poses.push(pose);
    if (pose.pegColor !== undefined) for (const { mesh } of this.batches) {
      mesh.setColorAt(index, new THREE.Color(pose.pegColor)); mesh.instanceColor!.needsUpdate = true;
    }
    this.sentimentMesh.setColorAt(index, new THREE.Color(SENTIMENT_COLORS[pose.sentiment ?? "mixed"]));
    this.sentimentMesh.instanceColor!.needsUpdate = true;
    return index;
  }

  update(dt: number, reducedMotion: boolean) {
    this.rigs.forEach((rig) => { if (!reducedMotion) rig.mixer.update(dt); rig.root.updateMatrixWorld(true); });
    for (let i = 0; i < this.poses.length; i++) {
      const pose = this.poses[i]!;
      const rig = this.rigs[STATES.indexOf(pose.animation) * PHASES + (pose.phase ?? i) % PHASES]!;
      this.rotation.setFromAxisAngle(this.axis, pose.heading);
      this.transform.compose(pose.position, this.rotation, this.scale);
      for (const { mesh, bone } of this.batches) {
        this.combined.multiplyMatrices(this.transform, rig.bones[bone]!.matrixWorld);
        mesh.setMatrixAt(i, pose.visible ? this.combined : this.hidden);
      }
      this.mobilityMeshes[0]!.setMatrixAt(i, pose.visible && pose.mobility === "bicycle" ? this.transform : this.hidden);
      this.mobilityMeshes[1]!.setMatrixAt(i, pose.visible && pose.mobility === "hoverboard" ? this.transform : this.hidden);
      this.petMeshes[0]!.setMatrixAt(i, pose.visible && pose.pet === "dog" ? this.transform : this.hidden);
      this.petMeshes[1]!.setMatrixAt(i, pose.visible && pose.pet === "cat" ? this.transform : this.hidden);
      this.leashMesh.setMatrixAt(i, pose.visible && pose.pet ? this.transform : this.hidden);
      this.sentimentMesh.setMatrixAt(i, pose.visible && pose.showSentiment ? this.transform : this.hidden);
    }
    this.batches.forEach(({ mesh }) => { mesh.count = this.poses.length; mesh.instanceMatrix.needsUpdate = true; });
    this.mobilityMeshes.forEach((mesh) => { mesh.count = this.poses.length; mesh.instanceMatrix.needsUpdate = true; });
    this.petMeshes.forEach((mesh) => { mesh.count = this.poses.length; mesh.instanceMatrix.needsUpdate = true; });
    this.leashMesh.count = this.poses.length; this.leashMesh.instanceMatrix.needsUpdate = true;
    this.sentimentMesh.count = this.poses.length; this.sentimentMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.rigs.forEach(({ mixer, root }) => { mixer.stopAllAction(); mixer.uncacheRoot(root); }); this.batches.forEach(({ mesh }) => { mesh.geometry.dispose(); mesh.dispose(); }); this.mobilityMeshes.forEach((mesh) => { mesh.geometry.dispose(); mesh.dispose(); }); this.petMeshes.forEach((mesh) => { mesh.geometry.dispose(); mesh.dispose(); }); this.leashMesh.geometry.dispose(); this.leashMesh.dispose(); this.leashMaterial.dispose(); this.sentimentMesh.geometry.dispose(); this.sentimentMesh.dispose(); this.sentimentMaterial.dispose(); this.mobilityMaterials.forEach((material) => material.dispose()); this.petMaterials.forEach((material) => material.dispose()); this.material.dispose(); }
}
