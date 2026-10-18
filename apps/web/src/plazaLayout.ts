export interface PlazaPoint {
  x: number;
  z: number;
}

export interface PlazaLayoutEntry {
  playerId: string;
  index: number;
  angle: number;
  radius: number;
  scale: number;
  position: PlazaPoint;
  rotationY: number;
  servicePoint: PlazaPoint;
  queueTangent: PlazaPoint;
}

export interface PlazaLayout {
  worldRadius: number;
  promenadeRadius: number;
  plazaRingRadius: number;
  overviewDistance: number;
  entries: PlazaLayoutEntry[];
  gates: PlazaPoint[];
}

/** Open pockets between the shop spokes and the paths from the four gates. */
export interface PlazaPocket {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  centerAngle: number;
  benchRadius: number;
}

export const PLAZA_WORLD_RADIUS = 11.65;
export const PLAZA_RING_RADIUS = 2.72;
export const PLAZA_PROMENADE_RADIUS = 7.45;
export const ROAD_INNER_RADIUS = 8.55;
export const ROAD_OUTER_RADIUS = 10.85;
export const ROAD_LANE_RADII = [9.11, 10.25] as const;

const TAU = Math.PI * 2;

function normalizeAngle(angle: number) {
  let value = angle % TAU;
  if (value < 0) value += TAU;
  return value;
}

function signedAngleDelta(from: number, to: number) {
  let delta = normalizeAngle(to) - normalizeAngle(from);
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

function pointAt(angle: number, radius: number): PlazaPoint {
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function layoutProfile(count: number) {
  if (count <= 2) return { radius: 4.72, scale: 1.14, overviewDistance: 21.5 };
  if (count <= 4) return { radius: 5.05, scale: 1.04, overviewDistance: 22.5 };
  if (count <= 6) return { radius: 5.72, scale: 0.95, overviewDistance: 23.5 };
  return { radius: 6.28, scale: 0.86, overviewDistance: 24.5 };
}

export function computePlazaLayout(playerIds: string[]): PlazaLayout {
  const count = Math.max(1, Math.min(8, playerIds.length));
  const profile = layoutProfile(count);
  const startAngle = Math.PI / 8;
  const entries = playerIds.map((playerId, index) => {
    const angle = startAngle + (index / count) * TAU;
    const position = pointAt(angle, profile.radius);
    // Stand outside the raised plot plinth rather than sinking feet through its front edge.
    const servicePoint = pointAt(angle, profile.radius - 1.42 * profile.scale);
    return {
      playerId,
      index,
      angle,
      radius: profile.radius,
      scale: profile.scale,
      position,
      rotationY: -angle - Math.PI / 2,
      servicePoint,
      queueTangent: { x: -Math.sin(angle), z: Math.cos(angle) }
    } satisfies PlazaLayoutEntry;
  });

  // Visitors arrive outside the road and cross at the four marked pedestrian gates.
  const gates = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => pointAt(angle, ROAD_OUTER_RADIUS + .42));
  return {
    worldRadius: PLAZA_WORLD_RADIUS,
    promenadeRadius: PLAZA_PROMENADE_RADIUS,
    plazaRingRadius: PLAZA_RING_RADIUS,
    overviewDistance: profile.overviewDistance,
    entries,
    gates
  };
}

export function createPlazaPockets(layout: PlazaLayout): PlazaPocket[] {
  const count = layout.entries.length;
  if (count < 2) return [];
  const halfPlotSpan = Math.PI / count;
  const margin = count >= 7 ? .13 : .145;
  const innerRadius = count >= 7 ? 3.82 : 3.55;
  const outerRadius = count >= 7 ? 4.55 : count >= 5 ? 4.8 : 6.45;
  return layout.entries.flatMap((entry) => [0, 1].map((side) => {
    const startAngle = entry.angle + side * halfPlotSpan + margin;
    const endAngle = entry.angle + (side + 1) * halfPlotSpan - margin;
    return { startAngle, endAngle, innerRadius, outerRadius, centerAngle: (startAngle + endAngle) / 2, benchRadius: (innerRadius + outerRadius) / 2 };
  }));
}

function nearestGapAngle(layout: PlazaLayout, gateAngle: number) {
  if (layout.entries.length === 1) return normalizeAngle(layout.entries[0]!.angle + Math.PI);
  const sorted = layout.entries.map((entry) => normalizeAngle(entry.angle)).sort((a, b) => a - b);
  const gaps = sorted.map((angle, index) => {
    const next = sorted[(index + 1) % sorted.length]! + (index === sorted.length - 1 ? TAU : 0);
    return normalizeAngle(angle + (next - angle) / 2);
  });
  return gaps.reduce((best, candidate) => Math.abs(signedAngleDelta(gateAngle, candidate)) < Math.abs(signedAngleDelta(gateAngle, best)) ? candidate : best, gaps[0]!);
}

function appendArc(points: PlazaPoint[], fromAngle: number, toAngle: number, radius: number) {
  const delta = signedAngleDelta(fromAngle, toAngle);
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 18)));
  for (let index = 1; index <= steps; index += 1) points.push(pointAt(fromAngle + delta * (index / steps), radius));
}

export function createPedestrianRoute(
  layout: PlazaLayout,
  destinationPlayerId: string,
  originPlayerId?: string,
  gateIndex = 0,
  laneOffset = 0
): PlazaPoint[] {
  const destination = layout.entries.find((entry) => entry.playerId === destinationPlayerId);
  if (!destination) return [];

  const origin = originPlayerId ? layout.entries.find((entry) => entry.playerId === originPlayerId) : undefined;
  const points: PlazaPoint[] = [];
  let sourceAngle: number;
  if (origin) {
    points.push({
      x: origin.servicePoint.x + origin.queueTangent.x * laneOffset * 0.35,
      z: origin.servicePoint.z + origin.queueTangent.z * laneOffset * 0.35
    });
    sourceAngle = origin.angle;
    points.push(pointAt(sourceAngle, layout.plazaRingRadius));
  } else {
    const normalizedGate = ((gateIndex % layout.gates.length) + layout.gates.length) % layout.gates.length;
    const gateAngle = normalizedGate * Math.PI / 2;
    sourceAngle = nearestGapAngle(layout, gateAngle);
    points.push(layout.gates[normalizedGate]!);
    points.push(pointAt(gateAngle, layout.promenadeRadius));
    appendArc(points, gateAngle, sourceAngle, layout.promenadeRadius);
    points.push(pointAt(sourceAngle, layout.plazaRingRadius));
  }

  appendArc(points, sourceAngle, destination.angle, layout.plazaRingRadius);
  points.push({
    x: destination.servicePoint.x + destination.queueTangent.x * laneOffset,
    z: destination.servicePoint.z + destination.queueTangent.z * laneOffset
  });
  return points;
}

export function distanceBetween(a: PlazaPoint, b: PlazaPoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Shared by routing tests and the live diagnostic overlay, with room for a full peg body. */
export function intersectsStorefront(point: PlazaPoint, entry: PlazaLayoutEntry, bodyRadius = .22) {
  const dx = point.x - entry.position.x, dz = point.z - entry.position.z;
  const cos = Math.cos(entry.rotationY), sin = Math.sin(entry.rotationY);
  const x = (cos * dx - sin * dz) / entry.scale;
  const z = (sin * dx + cos * dz) / entry.scale;
  const padding = bodyRadius / entry.scale;
  return Math.abs(x) < .95 + padding && z > -.95 - padding && z < .49 + padding;
}
