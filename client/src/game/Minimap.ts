/** Mini-carte (coin haut-gauche) : arène, rampes, constructions, joueur et adversaires. */
import type { ArenaDef } from '@shared/arena';
import { GRID } from '@shared/constants';
import { structureCenter, type Structure } from '@shared/structures';

const REFRESH = 0.1;

export interface MinimapState {
  self: { x: number; z: number; yaw: number; alive: boolean };
  enemies: { x: number; z: number }[];
  structures: Iterable<Structure>;
}

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private timer = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private arena: ArenaDef,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  update(dt: number, state: MinimapState) {
    if ((this.timer -= dt) > 0) return;
    this.timer = REFRESH;

    const { ctx, canvas, arena } = this;
    const S = canvas.width;
    const h = arena.halfSize;
    const k = S / (2 * h);
    const px = (x: number) => (x + h) * k;

    ctx.fillStyle = '#8a8571';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let c = -h; c <= h; c += GRID) {
      ctx.beginPath();
      ctx.moveTo(px(c), 0);
      ctx.lineTo(px(c), S);
      ctx.moveTo(0, px(c));
      ctx.lineTo(S, px(c));
      ctx.stroke();
    }

    // Décor fixe : rampes de l'arène et blocs (hors murs d'enceinte invisibles).
    ctx.fillStyle = '#3fb6ff';
    for (const s of arena.colliders.slopes) ctx.fillRect(px(s.minX), px(s.minZ), (s.maxX - s.minX) * k, (s.maxZ - s.minZ) * k);
    ctx.fillStyle = '#3e4a52';
    for (const b of arena.colliders.boxes.slice(1)) {
      if (b.max.y - b.min.y >= arena.wallHeight - 0.01) continue;
      ctx.fillRect(px(b.min.x), px(b.min.z), (b.max.x - b.min.x) * k, (b.max.z - b.min.z) * k);
    }

    // Constructions.
    ctx.fillStyle = '#d9a066';
    const cell = GRID * k * 0.8;
    for (const s of state.structures) {
      const c = structureCenter(s);
      ctx.fillRect(px(c.x) - cell / 2, px(c.z) - cell / 2, cell, cell);
    }

    // Adversaires.
    ctx.fillStyle = '#ff3b3b';
    for (const e of state.enemies) {
      ctx.beginPath();
      ctx.arc(px(e.x), px(e.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Joueur : flèche orientée selon le regard (yaw 0 → -Z, vers le haut de la carte).
    if (state.self.alive) {
      ctx.save();
      ctx.translate(px(state.self.x), px(state.self.z));
      ctx.rotate(-state.self.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}
