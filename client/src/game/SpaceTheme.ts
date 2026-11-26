/**
 * Thème visuel « plateforme spatiale » : ciel étoilé avec nébuleuse,
 * sol en plaques métalliques cloutées et rampes sombres à liserés bleus.
 */
import * as THREE from 'three';
import { GRID } from '@shared/constants';
import type { Slope } from '@shared/geometry';
import { buildColliderMeshes } from './StructureMesh';

/** Ciel équirectangulaire : fond quasi noir, nébuleuses violettes et étoiles. */
export function spaceSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#05040c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rand = mulberry32(7);
  for (let i = 0; i < 14; i++) {
    const x = rand() * canvas.width;
    const y = 150 + rand() * 450;
    const r = 120 + rand() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = rand() < 0.7 ? '120, 40, 140' : '50, 40, 130';
    g.addColorStop(0, `rgba(${hue}, ${0.18 + rand() * 0.15})`);
    g.addColorStop(1, `rgba(${hue}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2600; i++) {
    const a = 0.35 + rand() * 0.65;
    ctx.fillStyle = `rgba(255, 255, ${220 + Math.floor(rand() * 35)}, ${a})`;
    const s = rand() < 0.04 ? 2 : 1;
    ctx.fillRect(rand() * canvas.width, rand() * canvas.height, s, s);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Une plaque métallique cloutée par cellule de grille (repère visuel des cellules). */
export function metalFloorTexture(halfSize: number) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#77725f';
  ctx.fillRect(0, 0, size, size);
  // Clous en relief : ombre + reflet.
  const step = size / 10;
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      const x = step * (i + 0.5) + (j % 2 ? step / 2 : 0);
      const y = step * (j + 0.5);
      ctx.fillStyle = '#5d594a';
      ctx.beginPath();
      ctx.arc(x + 1.5, y + 1.5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8c8771';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Joints entre plaques.
  ctx.strokeStyle = '#4a4739';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  // Le sol déborde d'1 unité de chaque côté : on décale pour aligner les joints sur la grille.
  const cells = (halfSize * 2 + 2) / GRID;
  tex.repeat.set(cells, cells);
  tex.offset.set(-1 / GRID, -1 / GRID);
  return tex;
}

const RAMP_MAT = new THREE.MeshStandardMaterial({ color: 0x323945, roughness: 0.55, metalness: 0.6 });
const RAIL_MAT = new THREE.MeshStandardMaterial({ color: 0x5b6270, roughness: 0.4, metalness: 0.8 });
const GLOW_MAT = new THREE.MeshStandardMaterial({ color: 0x3fb6ff, emissive: 0x2aa8ff, emissiveIntensity: 1.4 });

/** Rampes de l'arène : panneau sombre + rails latéraux métalliques + liserés lumineux. */
export function buildRamps(slopes: Slope[]): THREE.Group {
  const group = new THREE.Group();
  group.add(buildColliderMeshes({ boxes: [], slopes, pyramids: [] }, RAMP_MAT, false));

  const rails: Slope[] = [];
  const glows: Slope[] = [];
  const caps: THREE.Mesh[] = [];
  for (const s of slopes) {
    const alongZ = s.dir % 2 === 0;
    // Bords latéraux (perpendiculaires au sens de montée).
    const [lo, hi] = alongZ ? [s.minX, s.maxX] : [s.minZ, s.maxZ];
    for (const [a, b] of [
      [lo - 0.35, lo],
      [hi, hi + 0.35],
    ]) {
      rails.push(side(s, alongZ, a, b, 0.25));
    }
    glows.push(side(s, alongZ, lo, lo + 0.12, 0.12), side(s, alongZ, hi - 0.12, hi, 0.12));

    // Embout massif à l'extrémité haute de chaque rail.
    for (const c of [lo - 0.2, hi + 0.2]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), RAIL_MAT);
      const end = highEnd(s);
      cap.position.set(alongZ ? c : end.x, s.y + s.h, alongZ ? end.z : c);
      cap.castShadow = true;
      caps.push(cap);
    }
  }
  group.add(buildColliderMeshes({ boxes: [], slopes: rails, pyramids: [] }, RAIL_MAT, false));
  group.add(buildColliderMeshes({ boxes: [], slopes: glows, pyramids: [] }, GLOW_MAT, false));
  group.add(...caps);
  return group;
}

export const CRATE_MAT = new THREE.MeshStandardMaterial({ color: 0x3e4a52, roughness: 0.5, metalness: 0.7 });

function side(s: Slope, alongZ: boolean, a: number, b: number, lift: number): Slope {
  return alongZ ? { ...s, minX: a, maxX: b, y: s.y + lift } : { ...s, minZ: a, maxZ: b, y: s.y + lift };
}

function highEnd(s: Slope) {
  const cx = (s.minX + s.maxX) / 2;
  const cz = (s.minZ + s.maxZ) / 2;
  switch (s.dir) {
    case 0:
      return { x: cx, z: s.maxZ };
    case 1:
      return { x: s.maxX, z: cz };
    case 2:
      return { x: cx, z: s.minZ };
    default:
      return { x: s.minX, z: cz };
  }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
