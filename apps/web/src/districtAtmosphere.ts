import * as THREE from "three";
import { MeshBasicNodeMaterial, MeshPhysicalNodeMaterial } from "three/webgpu";
import { attribute, color, float, fract, mix, positionLocal, positionWorld, reflector, sin, smoothstep, uniform, uv, vec3 } from "three/tsl";
import type { GamePhase } from "@market-rush/shared";
import { createDistrictHdri } from "./districtHdri.js";

export function phaseSunProgress(phase: GamePhase, progress: number) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  return phase === "forecast" ? .08 + .12 * t : phase === "decisions" ? .2 + .3 * t : phase === "operations" ? .5 : phase === "results" ? .72 + .22 * t : phase === "finished" ? .98 : .38;
}

export function createDistrictAtmosphere(scene: THREE.Scene, paving: THREE.Mesh[], storm: boolean, mobile: boolean, random: () => number) {
  const clock = uniform(0), wetness = uniform(storm ? 1 : 0);
  const hdri = createDistrictHdri(mobile ? 128 : 256, mobile ? 64 : 128);
  scene.environment = hdri;
  scene.environmentIntensity = storm ? .42 : .62;
  scene.environmentRotation.y = -.22;
  const target = new THREE.Object3D(); target.position.y = .34; target.rotation.x = -Math.PI / 2; scene.add(target);
  const reflection = storm ? reflector({ target, resolutionScale: mobile ? .25 : .4, bounces: false, samples: 0 }) : undefined;
  const ground = new MeshPhysicalNodeMaterial({ roughness: .86, metalness: .02, clearcoat: 0 });
  const p = positionWorld.xz;
  const noise = sin(p.x.mul(2.9).add(sin(p.y.mul(1.7)))).mul(sin(p.y.mul(2.3).sub(p.x.mul(.7)))).mul(.5).add(.5);
  const puddle = smoothstep(.48, .7, noise).mul(wetness);
  const joints = smoothstep(.025, .065, fract(p.x.mul(2)).min(fract(p.y.mul(2))));
  ground.colorNode = mix(color(0x878b83), color(0xd2c9b7), joints).mul(mix(float(1), float(.46), wetness));
  ground.roughnessNode = mix(float(.87), float(.09), puddle);
  ground.clearcoatNode = mix(float(.04), float(.96), puddle);
  ground.clearcoatRoughnessNode = mix(float(.55), float(.06), puddle);
  if (reflection) ground.emissiveNode = reflection.rgb.mul(puddle).mul(.65);
  paving.forEach((mesh) => { mesh.material = ground; });

  const rainGeometry = new THREE.InstancedBufferGeometry();
  // Crossed ribbons distribute droplets throughout a 3D volume, with GPU-only falling motion.
  rainGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-.012,-.16,0, .012,-.16,0, .012,.16,0, -.012,.16,0, 0,-.16,-.012, 0,-.16,.012, 0,.16,.012, 0,.16,-.012], 3));
  rainGeometry.setAttribute("uv", new THREE.Float32BufferAttribute([0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1], 2));
  rainGeometry.setIndex([0,1,2, 0,2,3, 4,5,6, 4,6,7]); rainGeometry.computeVertexNormals();
  const count = mobile ? 700 : 1_800, seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { seeds[i*3] = random()*17-8.5; seeds[i*3+1] = random(); seeds[i*3+2] = random()*17-8.5; }
  rainGeometry.setAttribute("dropSeed", new THREE.InstancedBufferAttribute(seeds, 3)); rainGeometry.instanceCount = storm ? count : 0;
  const seed = attribute("dropSeed", "vec3");
  const fall = fract(seed.y.sub(clock.mul(.65)));
  const rainMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xb9dfed });
  rainMaterial.positionNode = positionLocal.add(vec3(seed.x.add(fall.mul(.55)), fall.mul(8).add(.4), seed.z));
  rainMaterial.opacityNode = smoothstep(0, .35, uv().y).mul(float(1).sub(smoothstep(.55, 1, uv().y))).mul(.44);
  const rain = new THREE.Mesh(rainGeometry, rainMaterial); rain.name = "TSL-volumetric-rain"; rain.frustumCulled = false; rain.visible = storm; scene.add(rain);
  const sky = new THREE.HemisphereLight(0xdceeff, 0x667466, 1.6);
  const sun = new THREE.DirectionalLight(0xffdfb8, 2.8); sun.position.set(-8, 13, 6);
  sun.castShadow = !mobile; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -9.5; sun.shadow.camera.right = sun.shadow.camera.top = 9.5;
  sun.shadow.camera.far = 38; sun.shadow.normalBias = .025; sun.shadow.bias = -.00015; sun.shadow.radius = 2;
  scene.add(sky, sun);
  const dawn = new THREE.Color(0xe8b9a1), noon = new THREE.Color(0xd4e4e2), dusk = new THREE.Color(0x363f60), rainSky = new THREE.Color(0x657f91);
  const background = new THREE.Color(); scene.background = background; scene.fog = new THREE.Fog(background, mobile ? 30 : 18, mobile ? 55 : 35);
  return {
    rain, ground, reflection,
    update(seconds: number, phase: GamePhase, progress: number, reducedMotion: boolean) {
      clock.value = reducedMotion ? 0 : seconds;
      const t = phaseSunProgress(phase, progress), sunset = THREE.MathUtils.smoothstep(t, .55, 1);
      background.copy(t < .5 ? dawn : noon).lerp(t < .5 ? noon : dusk, t < .5 ? t * 2 : sunset);
      if (storm) background.lerp(rainSky, .65);
      (scene.fog as THREE.Fog).color.copy(background);
      sun.position.set(Math.cos(t * Math.PI) * -12, 3 + Math.sin(t * Math.PI) * 12, 6);
      sun.color.set(t > .65 || t < .2 ? 0xffb981 : 0xfff0d2);
      sun.intensity = (storm ? 1.15 : 2.8) * (1 - sunset * .82); sky.intensity = (storm ? 1.25 : 1.55) * (1 - sunset * .6);
      scene.environmentIntensity = (storm ? .42 : .62) * (1 - sunset * .4);
    },
    dispose() { reflection?.dispose(); scene.environment = null; hdri.dispose(); ground.dispose(); rainGeometry.dispose(); rainMaterial.dispose(); }
  };
}
