/** Mini-librairie vectorielle sans dépendance (utilisable côté serveur sans Three.js). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-9 ? scale(a, 1 / l) : { x: 0, y: 0, z: -1 };
}

/** Point le long d'un rayon : o + d * t */
export const along = (o: Vec3, d: Vec3, t: number): Vec3 => ({
  x: o.x + d.x * t,
  y: o.y + d.y * t,
  z: o.z + d.z * t,
});

/**
 * Convention d'orientation : yaw = 0 regarde vers -Z (comme une caméra Three.js),
 * pitch > 0 regarde vers le haut.
 */
export function dirFromYawPitch(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function isVec3(v: unknown): v is Vec3 {
  const o = v as Vec3;
  return !!o && Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z);
}
