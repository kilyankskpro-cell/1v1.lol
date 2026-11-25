export const TILE = 4;
export const LEVEL = 3;
export const ARENA_EDGE = 26;
export const PLAYER_HEIGHT = 1.85;
export const PIECES = ['wall', 'ramp', 'floor', 'roof'];
export const TOOLS = ['burst', 'scatter', ...PIECES];
export const COVER = [
  { x: -8, y: 0, z: 9, w: 3, h: 2.6, d: 2.8 },
  { x: 8, y: 0, z: -9, w: 3, h: 2.6, d: 2.8 },
  { x: 11, y: 0, z: 5, w: 3, h: 1.3, d: 3 },
  { x: -11, y: 0, z: -5, w: 3, h: 1.3, d: 3 },
  { x: -16, y: 0, z: 0, w: 5, h: 2.2, d: 2.6 },
  { x: 16, y: 0, z: 0, w: 5, h: 2.2, d: 2.6 },
];

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const spawn = (index) => ({ x: 0, y: 0, z: index ? -19 : 19, yaw: index ? Math.PI : 0, pitch: 0, vy: 0, grounded: true });
export const forward = (yaw, pitch = 0) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
export const right = (yaw) => [Math.cos(yaw), 0, Math.sin(yaw)];
const axes = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const half = TILE / 2;
const radius = .34;
const step = .45;
const add = (a, b, scale = 1) => a.map((v, i) => v + b[i] * scale);

function local(x, z, rot) {
  const [dx, dz] = axes[rot];
  return [-dz * x + dx * z, -dx * x - dz * z];
}

export function pieceBox(piece) {
  const { kind, x, y, z, rot } = piece;
  if (kind === 'wall') return { x, y, z, w: rot % 2 ? .22 : TILE, h: LEVEL, d: rot % 2 ? TILE : .22 };
  if (kind === 'floor') return { x, y: y - .18, z, w: TILE, h: .3, d: TILE };
  return { x, y: y - .08, z, w: TILE, h: (kind === 'ramp' ? LEVEL : 1.65) + .08, d: TILE };
}

export function placement(actor, kind, pieces, actors = [actor]) {
  if (!PIECES.includes(kind)) return null;
  const rot = ((Math.round(actor.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  const [dx, dz] = axes[rot];
  const distance = kind === 'ramp' ? 5 : kind === 'floor' && actor.pitch < -.55 ? 2 : 3.8;
  const snap = (v) => Math.round(v / TILE) * TILE;
  const y = Math.max(0, Math.floor((actor.y + .52) / LEVEL) * LEVEL);
  const cellX = snap(actor.x + dx * distance);
  const cellZ = snap(actor.z + dz * distance);
  const x = cellX + (kind === 'wall' ? dx * half : 0);
  const z = cellZ + (kind === 'wall' ? dz * half : 0);
  const piece = { kind, rot, x, y, z };
  const box = pieceBox(piece);
  const bounds = Math.abs(cellX) + half <= ARENA_EDGE && Math.abs(cellZ) + half <= ARENA_EDGE && y <= 15;
  const duplicate = pieces.some((p) => p.kind === kind && p.x === x && p.z === z && p.y === y && (kind !== 'wall' || p.rot % 2 === rot % 2));
  const obstructed = COVER.some((b) => Math.abs(x - b.x) < (b.w + box.w) / 2 - .02 && Math.abs(z - b.z) < (b.d + box.d) / 2 - .02 && y < b.y + b.h);
  const occupied = actors.some((other) => {
    if (other.hp === 0 || other.y + PLAYER_HEIGHT <= box.y || other.y >= box.y + box.h - .2) return false;
    if (kind === 'ramp' || kind === 'roof') {
      const height = slopeAt(piece, other.x, other.z);
      return height !== null && height > other.y + step;
    }
    return overlap(other.x, other.z, box, radius);
  });
  return { ...piece, valid: bounds && !duplicate && !obstructed && !occupied };
}

function overlap(x, z, box, padding = 0) {
  return Math.abs(x - box.x) < box.w / 2 + padding && Math.abs(z - box.z) < box.d / 2 + padding;
}

function slopeAt(piece, x, z) {
  const [lx, lz] = local(x - piece.x, z - piece.z, piece.rot);
  if (Math.abs(lx) > half || Math.abs(lz) > half) return null;
  return piece.y + (piece.kind === 'ramp' ? (half - lz) / TILE * LEVEL : (1 - Math.max(Math.abs(lx), Math.abs(lz)) / half) * 1.65);
}

export function stepActor(actor, input, pieces, dt, speed = 6.8) {
  const solids = [...COVER, ...pieces.filter((p) => p.kind === 'wall' || p.kind === 'floor').map(pieceBox)];
  const slopes = pieces.filter((p) => p.kind === 'ramp' || p.kind === 'roof');
  const grounded = actor.grounded;
  const mx = input.mx || 0;
  const mz = input.mz || 0;
  const travel = speed * dt / Math.max(1, Math.hypot(mx, mz));
  const [fx, , fz] = forward(actor.yaw);
  const [rx, , rz] = right(actor.yaw);
  const blocked = (x, z) => solids.some((b) => overlap(x, z, b, radius) && actor.y + PLAYER_HEIGHT > b.y + .02 && actor.y < b.y + b.h - (grounded ? step : .02)) || slopes.some((p) => {
    const surface = slopeAt(p, x, z);
    return surface !== null && actor.y + PLAYER_HEIGHT > p.y && actor.y < surface - (grounded ? step : .12);
  });
  const x = clamp(actor.x + (fx * mz + rx * mx) * travel, -ARENA_EDGE + radius, ARENA_EDGE - radius);
  const z = clamp(actor.z + (fz * mz + rz * mx) * travel, -ARENA_EDGE + radius, ARENA_EDGE - radius);
  if (!blocked(x, actor.z)) actor.x = x;
  if (!blocked(actor.x, z)) actor.z = z;

  if (grounded && input.jump) actor.vy = 8.6;
  actor.vy -= 22 * dt;
  let nextY = actor.y + actor.vy * dt;
  if (actor.vy > 0) {
    for (const box of solids) {
      if (overlap(actor.x, actor.z, box, radius) && actor.y + PLAYER_HEIGHT <= box.y && nextY + PLAYER_HEIGHT >= box.y) {
        nextY = box.y - PLAYER_HEIGHT;
        actor.vy = 0;
      }
    }
  }
  const maxStep = actor.y + (grounded && !input.jump ? step : .03);
  let top = 0;
  for (const box of solids) {
    if (overlap(actor.x, actor.z, box, .12) && box.y + box.h <= maxStep) top = Math.max(top, box.y + box.h);
  }
  for (const piece of slopes) {
    const surface = slopeAt(piece, actor.x, actor.z);
    if (surface !== null && surface <= maxStep) top = Math.max(top, surface);
  }
  actor.grounded = actor.vy <= 0 && nextY <= top;
  if (actor.grounded) actor.vy = 0;
  actor.y = Math.max(top, nextY);
}

function boxRange(origin, direction, box, limit) {
  const mins = [box.x - box.w / 2, box.y, box.z - box.d / 2];
  const maxs = [box.x + box.w / 2, box.y + box.h, box.z + box.d / 2];
  let lo = 0;
  let hi = limit;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(direction[i]) < 1e-8) {
      if (origin[i] < mins[i] || origin[i] > maxs[i]) return null;
    } else {
      const a = (mins[i] - origin[i]) / direction[i];
      const b = (maxs[i] - origin[i]) / direction[i];
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
      if (lo > hi) return null;
    }
  }
  return [lo, hi];
}

function hitPiece(origin, direction, piece, limit) {
  const range = boxRange(origin, direction, pieceBox(piece), limit);
  if (!range || piece.kind === 'floor' || piece.kind === 'wall') return range?.[0];
  const [x, z] = local(origin[0] - piece.x, origin[2] - piece.z, piece.rot);
  const [dx, dz] = local(direction[0], direction[2], piece.rot);
  const y = origin[1] - piece.y;
  const dy = direction[1];
  const planes = piece.kind === 'ramp'
    ? [[y - LEVEL / 2 + z * LEVEL / TILE, dy + dz * LEVEL / TILE]]
    : [[x, dx], [-x, -dx], [z, dz], [-z, -dz]].map(([v, d]) => [y - 1.65 + v * 1.65 / half, dy + d * 1.65 / half]);
  let [lo, hi] = range;
  for (const [start, delta] of planes) {
    if (Math.abs(delta) < 1e-8) {
      if (start > 0) return undefined;
    } else if (delta > 0) hi = Math.min(hi, -start / delta);
    else lo = Math.max(lo, -start / delta);
    if (lo > hi) return undefined;
  }
  return lo;
}

export function trace(origin, direction, limit, pieces, actors = []) {
  const result = { distance: limit };
  const hit = (distance, type, item) => {
    if (distance !== undefined && distance < result.distance) Object.assign(result, { distance, type, item });
  };
  if (origin[1] > 0 && direction[1] < 0) hit(-origin[1] / direction[1], 'ground');
  for (const box of COVER) hit(boxRange(origin, direction, box, result.distance)?.[0], 'cover', box);
  for (const piece of pieces) hit(hitPiece(origin, direction, piece, result.distance), 'piece', piece);
  for (const actor of actors) {
    hit(boxRange(origin, direction, { ...actor, w: 1.02, d: .94, h: 2.05 }, result.distance)?.[0], 'actor', actor);
  }
  result.point = add(origin, direction, result.distance);
  return result;
}

export function viewFor(actor, pieces) {
  const direction = forward(actor.yaw, actor.pitch);
  const eye = [actor.x, actor.y + 1.65, actor.z];
  const offset = add(add([0, .5, 0], right(actor.yaw), .87), direction, -4.7);
  const length = Math.hypot(...offset);
  const back = offset.map((v) => v / length);
  const obstruction = trace(eye, back, length, pieces);
  const position = add(eye, back, Math.max(.16, obstruction.distance - .16));
  return { direction, position, close: obstruction.distance < 1.18 };
}

export function shotFrom(actor, pieces, opponents, range) {
  const { position, direction } = viewFor(actor, pieces);
  const target = trace(position, direction, range, pieces, opponents);
  const muzzle = add(add([actor.x, actor.y + 1.38, actor.z], right(actor.yaw), .39), forward(actor.yaw), .44);
  const offset = target.point.map((v, i) => v - muzzle[i]);
  const length = Math.hypot(...offset);
  const result = trace(muzzle, offset.map((v) => v / (length || 1)), Math.min(range, length + .03), pieces, opponents);
  return { ...result, from: muzzle };
}
