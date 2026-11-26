/**
 * Textures procédurales des constructions (générées une seule fois puis partagées) :
 *  - mur   : planches verticales cloutées,
 *  - sol   : dalles de pierre,
 *  - rampe : planches avec marches antidérapantes,
 *  - toit  : tuiles en écailles.
 * Chaque construction a son propre matériau (teinte de dégâts, fondu de destruction)
 * mais réutilise la texture commune à son type.
 */
import * as THREE from 'three';
import type { StructureType } from '@shared/structures';

const SIZE = 256;

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function rand(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function planks(ctx: CanvasRenderingContext2D, vertical: boolean, base: [number, number, number], seed: number) {
  const r = rand(seed);
  const n = 6;
  const w = SIZE / n;
  for (let i = 0; i < n; i++) {
    const k = 0.85 + r() * 0.3;
    ctx.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
    if (vertical) ctx.fillRect(i * w, 0, w, SIZE);
    else ctx.fillRect(0, i * w, SIZE, w);
    // Veinage du bois.
    ctx.strokeStyle = 'rgba(70,40,15,0.18)';
    ctx.lineWidth = 1;
    for (let j = 0; j < 5; j++) {
      ctx.beginPath();
      const o = i * w + 4 + r() * (w - 8);
      if (vertical) {
        ctx.moveTo(o, 0);
        ctx.bezierCurveTo(o + 4, SIZE * 0.3, o - 4, SIZE * 0.7, o + 2, SIZE);
      } else {
        ctx.moveTo(0, o);
        ctx.bezierCurveTo(SIZE * 0.3, o + 4, SIZE * 0.7, o - 4, SIZE, o + 2);
      }
      ctx.stroke();
    }
    // Joints entre planches.
    ctx.fillStyle = 'rgba(40,22,8,0.55)';
    if (vertical) ctx.fillRect(i * w, 0, 2, SIZE);
    else ctx.fillRect(0, i * w, SIZE, 2);
  }
  // Clous sur les traverses.
  ctx.fillStyle = 'rgba(60,60,60,0.8)';
  for (let i = 0; i < n; i++) {
    for (const t of [0.12, 0.88]) {
      const a = i * w + w / 2;
      const b = SIZE * t;
      ctx.beginPath();
      ctx.arc(vertical ? a : b, vertical ? b : a, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Cadre.
  ctx.strokeStyle = 'rgba(45,25,10,0.7)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, SIZE - 6, SIZE - 6);
}

let cache: Record<StructureType, THREE.Texture> | null = null;

function textures(): Record<StructureType, THREE.Texture> {
  if (cache) return cache;
  cache = {
    wall: canvasTexture((ctx) => planks(ctx, true, [214, 160, 102], 11)),
    ramp: canvasTexture((ctx) => {
      planks(ctx, false, [196, 146, 92], 23);
      ctx.fillStyle = 'rgba(50,30,12,0.45)';
      for (let i = 0; i < 8; i++) ctx.fillRect(0, i * (SIZE / 8) + 10, SIZE, 5);
    }),
    floor: canvasTexture((ctx) => {
      const r = rand(37);
      const n = 4;
      const s = SIZE / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const k = 0.85 + r() * 0.25;
          ctx.fillStyle = `rgb(${168 * k},${160 * k},${146 * k})`;
          ctx.fillRect(i * s, j * s, s, s);
          for (let d = 0; d < 30; d++) {
            ctx.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
            ctx.fillRect(i * s + r() * s, j * s + r() * s, 3, 3);
          }
        }
      }
      ctx.strokeStyle = 'rgba(60,55,50,0.8)';
      ctx.lineWidth = 3;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath();
        ctx.moveTo(i * s, 0);
        ctx.lineTo(i * s, SIZE);
        ctx.moveTo(0, i * s);
        ctx.lineTo(SIZE, i * s);
        ctx.stroke();
      }
    }),
    roof: canvasTexture((ctx) => {
      ctx.fillStyle = '#7a3324';
      ctx.fillRect(0, 0, SIZE, SIZE);
      const rows = 8;
      const h = SIZE / rows;
      for (let row = 0; row < rows; row++) {
        for (let i = -1; i < 9; i++) {
          const x = i * 32 + (row % 2 ? 16 : 0);
          const y = row * h;
          const g = ctx.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, '#b65a3e');
          g.addColorStop(1, '#7a3324');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 32, y);
          ctx.lineTo(x + 32, y + h * 0.7);
          ctx.quadraticCurveTo(x + 16, y + h * 1.15, x, y + h * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,12,6,0.6)';
          ctx.stroke();
        }
      }
    }),
  };
  return cache;
}

export const STRUCTURE_TINT = new THREE.Color(0xffffff);
export const STRUCTURE_DAMAGED = new THREE.Color(0x4a2618);

/** Couleur dominante (particules de destruction). */
export const DEBRIS_COLORS: Record<StructureType, number> = {
  wall: 0xc8925a,
  ramp: 0xb5844f,
  floor: 0xa39b8c,
  roof: 0x9c4630,
};

export function createStructureMaterial(type: StructureType) {
  return new THREE.MeshStandardMaterial({ map: textures()[type], color: STRUCTURE_TINT, roughness: 0.85, metalness: 0.02 });
}
