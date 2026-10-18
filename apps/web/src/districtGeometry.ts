import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Crisp faces and uninterrupted cube UVs make the modular kit read as blocks. */
export function panelGeometry(width: number, height: number, depth: number, _chamfer = 0.035) {
  return new THREE.BoxGeometry(width, height, depth);
}

/** Bake a multi-block silhouette into one instanced mesh, without extra draws. */
export function voxelClusterGeometry(blocks: Array<[width: number, height: number, depth: number, x: number, y: number, z: number]>) {
  const parts = blocks.map(([width, height, depth, x, y, z]) => new THREE.BoxGeometry(width, height, depth).translate(x, y, z));
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error("Could not assemble voxel cluster");
  return geometry;
}

export type RingProfile = [y: number, halfWidth: number, halfDepth: number, z?: number];

/** Faceted tailored cross sections for civic furniture and landscape details. */
export function loftGeometry(rings: RingProfile[], segments = 8) {
  const vertices: number[] = [], indices: number[] = [];
  rings.forEach(([y, width, depth, z = 0]) => {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2 + Math.PI / 8;
      vertices.push(Math.cos(a) * width, y, Math.sin(a) * depth + z);
    }
  });
  for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < segments; i++) {
    const a = row * segments + i, b = row * segments + (i + 1) % segments;
    indices.push(a, a + segments, b, b, a + segments, b + segments);
  }
  for (let i = 1; i < segments - 1; i++) {
    indices.push(0, i, i + 1);
    const end = (rings.length - 1) * segments;
    indices.push(end, end + i + 1, end + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function ringSurface(inner: number, outer: number, segments = 96) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    for (const r of [inner, outer]) {
      const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
      positions.push(x, 0, z); uvs.push(x / outer / 2 + 0.5, z / outer / 2 + 0.5);
    }
    if (i < segments) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
