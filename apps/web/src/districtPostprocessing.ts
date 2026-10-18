import type * as THREE from "three";
import { PostProcessing, type WebGPURenderer } from "three/webgpu";
import { emissive, float, mix, mrt, normalView, output, pass, uniform } from "three/tsl";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { dof } from "three/addons/tsl/display/DepthOfFieldNode.js";

/** The node-based counterpart to EffectComposer for our TSL/WebGL2 renderer. */
export function createDistrictPostprocessing(renderer: WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, mobile: boolean) {
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, normal: normalView, emissive }));

  const color = scenePass.getTextureNode("output");
  const depth = scenePass.getTextureNode("depth");
  const normals = scenePass.getTextureNode("normal");
  const emittedLight = scenePass.getTextureNode("emissive");

  // GTAO is Three's modern screen-space ambient occlusion. Keep its render
  // target at half resolution and blend strength as a live uniform for tuning.
  const ambientOcclusion = ao(depth, normals, camera);
  ambientOcclusion.resolutionScale = mobile ? .45 : .55;
  ambientOcclusion.samples.value = mobile ? 8 : 12;
  ambientOcclusion.radius.value = .8;
  ambientOcclusion.thickness.value = 1.5;
  const aoIntensity = uniform(.7);
  const shaded = color.mul(mix(float(1), ambientOcclusion.getTextureNode().r, aoIntensity));

  // MRT isolates the actual emissive material output, so white pavement and
  // sunlit walls do not glow just because they are bright.
  const glow = bloom(emittedLight, .58, .32, .05);
  const lit = shaded.add(glow);

  // The focus plane follows the camera target as the player selects a store.
  const focusDistance = uniform(camera.position.length());
  const softened = dof(lit, scenePass.getViewZNode(), focusDistance, mobile ? 18 : 15, mobile ? .6 : .9);
  const postprocessing = new PostProcessing(renderer);
  postprocessing.outputNode = softened;

  return {
    compileAsync: () => scenePass.compileAsync(renderer),
    render: () => postprocessing.render(),
    setFocusDistance: (distance: number) => { focusDistance.value = distance; },
    setAmbientOcclusion: (intensity: number) => { aoIntensity.value = Math.max(0, Math.min(1, intensity)); },
    dispose: () => { postprocessing.dispose(); scenePass.dispose(); ambientOcclusion.dispose(); glow.dispose(); softened.dispose(); }
  };
}
