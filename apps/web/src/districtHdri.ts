import * as THREE from "three";

/** A self-contained HDR panorama: broad sky fill plus three soft studio windows. */
export function createDistrictHdri(width = 256, height = 128) {
  const pixels = new Float32Array(width * height * 4);
  const lights = [
    { u: .16, v: .29, radius: .085, strength: 3.1, tint: [1, .84, .65] },
    { u: .58, v: .22, radius: .105, strength: 2.5, tint: [.67, .86, 1] },
    { u: .83, v: .36, radius: .055, strength: 2.2, tint: [1, .72, .45] }
  ];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + .5) / width, v = (y + .5) / height;
    const sky = Math.max(0, 1 - v * 1.8);
    const horizon = Math.exp(-Math.pow((v - .49) / .17, 2));
    const base = v < .5
      ? [.35 + sky * .20 + horizon * .13, .44 + sky * .23 + horizon * .08, .53 + sky * .22]
      : [.16 + horizon * .15, .19 + horizon * .16, .20 + horizon * .13];
    for (const light of lights) {
      const du = Math.min(Math.abs(u - light.u), 1 - Math.abs(u - light.u));
      const dv = v - light.v;
      const strength = Math.exp(-((du / light.radius) ** 2 + (dv / (light.radius * .62)) ** 2) * 2) * light.strength;
      for (let channel = 0; channel < 3; channel++) base[channel]! += strength * light.tint[channel]!;
    }
    const offset = (y * width + x) * 4;
    pixels[offset] = base[0]!; pixels[offset + 1] = base[1]!; pixels[offset + 2] = base[2]!; pixels[offset + 3] = 1;
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.name = "Procedural plaza HDRI";
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
