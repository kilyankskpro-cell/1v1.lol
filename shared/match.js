import { PIECES, TOOLS, clamp, placement, shotFrom, spawn, stepActor } from './arena.js';

export const ROUND_TIME = 90;
export const WINS = 3;
export const MATERIALS = 24;
export const WEAPONS = {
  burst: { name: 'Rafale', damage: 19, clip: 24, delay: .145, reload: 1.3, range: 85 },
  scatter: { name: 'Percuteur', damage: 73, clip: 5, delay: .69, reload: 1.65, range: 37 },
};

export function cleanInput(input, player) {
  const number = (value, min, max, fallback = 0) => Number.isFinite(value) ? clamp(value, min, max) : fallback;
  return {
    mx: number(input?.mx, -1, 1), mz: number(input?.mz, -1, 1),
    yaw: number(input?.yaw, -Math.PI * 2, Math.PI * 2, player.yaw),
    pitch: number(input?.pitch, -1.23, 1.12, player.pitch),
    tool: TOOLS.includes(input?.tool) ? input.tool : player.tool,
    jump: input?.jump === true, fire: input?.fire === true, reload: input?.reload === true,
  };
}

function createPlayer(id) {
  return {
    id, ...spawn(id), hp: 100, shield: 50, tool: 'burst', materials: MATERIALS,
    ammo: { burst: WEAPONS.burst.clip, scatter: WEAPONS.scatter.clip },
    moving: 0, readyAt: 0, reloadUntil: 0, reloadTool: null, buildingAt: 0,
  };
}

export class Match {
  constructor(mode) {
    this.mode = mode;
    this.clock = 0;
    this.serial = 0;
    this.scores = [0, 0];
    this.round = 1;
    this.shots = [];
    this.resetRound();
  }

  resetRound() {
    this.players = this.mode === 'practice' ? [createPlayer(0)] : [createPlayer(0), createPlayer(1)];
    this.inputs = this.players.map((p) => cleanInput(null, p));
    this.pieces = [];
    this.phase = this.mode === 'practice' ? 'playing' : 'countdown';
    this.remaining = this.mode === 'practice' ? 0 : 2.4;
    this.roundWinner = null;
    this.botChoice = null;
  }

  setInput(id, input) {
    if (this.players[id]) this.inputs[id] = cleanInput(input, this.players[id]);
  }

  clearBuilds() {
    if (this.mode === 'practice') this.pieces.length = 0;
  }

  botInput(dt) {
    const [target, bot] = this.players;
    const dx = target.x - bot.x;
    const dz = target.z - bot.z;
    const distance = Math.hypot(dx, dz);
    if (!this.botChoice || this.clock >= this.botChoice.until) {
      this.botChoice = {
        until: this.clock + .8 + Math.random() * 1.35,
        strafe: Math.sign(Math.random() - .5), jump: Math.random() < .16,
        cover: bot.hp < 83 && distance < 17 && Math.random() < .18,
      };
    }
    const { strafe, jump, cover } = this.botChoice;
    return {
      yaw: Math.atan2(dx, -dz) - Math.atan2(.87, Math.max(distance, 1)) + Math.sin(this.clock * 3.5) * .048,
      pitch: clamp(Math.atan2(target.y - bot.y - 1.08, Math.max(distance, 1)) + Math.sin(this.clock * 4.6) * .035, -.8, .9),
      mx: strafe * (distance > 20 ? .32 : .7), mz: distance > 12 ? 1 : distance < 6 ? -.62 : .16,
      tool: cover ? 'wall' : 'burst', jump: jump && this.botChoice.until - this.clock < dt * 2,
      fire: cover || (distance < 25 && this.clock > 3.5),
    };
  }

  startReload(player, tool) {
    if (!player.reloadTool && player.ammo[tool] < WEAPONS[tool].clip) {
      player.reloadTool = tool;
      player.reloadUntil = this.clock + WEAPONS[tool].reload;
    }
  }

  act(player, input) {
    if (player.reloadTool && this.clock >= player.reloadUntil) {
      player.ammo[player.reloadTool] = WEAPONS[player.reloadTool].clip;
      player.reloadTool = null;
    }
    const { tool } = player;
    if (PIECES.includes(tool)) {
      if (!input.fire || this.clock < player.buildingAt || this.pieces.length >= 96 || (this.mode !== 'practice' && !player.materials)) return;
      player.buildingAt = this.clock + .19;
      const next = placement(player, tool, this.pieces, this.players);
      if (!next?.valid) return;
      const { valid, ...piece } = next;
      this.pieces.push({ ...piece, id: ++this.serial, owner: player.id, hp: 100 });
      if (this.mode !== 'practice') player.materials--;
      return;
    }
    if (input.reload) this.startReload(player, tool);
    if (!input.fire || player.readyAt > this.clock || player.reloadTool === tool) return;
    if (!player.ammo[tool]) return this.startReload(player, tool);
    const weapon = WEAPONS[tool];
    const bot = this.mode === 'solo' && player.id === 1;
    player.readyAt = this.clock + (bot ? .54 + Math.random() * .27 : weapon.delay);
    player.ammo[tool]--;
    const opponents = this.players.filter((p) => p !== player && p.hp > 0);
    const hit = shotFrom(player, this.pieces, opponents, weapon.range);
    const falloff = tool === 'scatter' ? clamp(1.1 - hit.distance / 38, .14, 1) : 1;
    const damage = Math.round(weapon.damage * falloff * (bot ? .68 : 1));
    if (hit.type === 'actor') {
      const absorbed = Math.min(hit.item.shield, damage);
      hit.item.shield -= absorbed;
      hit.item.hp = Math.max(0, hit.item.hp - (damage - absorbed));
    } else if (hit.type === 'piece') {
      hit.item.hp -= damage;
      if (hit.item.hp <= 0) this.pieces = this.pieces.filter((p) => p !== hit.item);
    }
    this.shots.push({ id: ++this.serial, player: player.id, tool, from: hit.from, to: hit.point, target: hit.type === 'actor' ? hit.item.id : null });
    if (this.shots.length > 8) this.shots.shift();
  }

  finishRound(winner) {
    this.roundWinner = winner;
    if (winner !== null) this.scores[winner]++;
    this.phase = this.scores.includes(WINS) ? 'finished' : 'between';
    this.remaining = this.phase === 'finished' ? 0 : 2.65;
  }

  update(dt) {
    this.clock += dt;
    if (this.phase === 'finished') return;
    if (this.phase !== 'playing') {
      this.remaining -= dt;
      if (this.remaining > 0) return;
      if (this.phase === 'between') {
        this.round++;
        this.resetRound();
      } else {
        this.phase = 'playing';
        this.remaining = ROUND_TIME;
      }
      return;
    }
    if (this.mode === 'solo') this.inputs[1] = this.botInput(dt);
    for (const player of this.players) {
      const input = this.inputs[player.id];
      player.yaw = input.yaw;
      player.pitch = input.pitch;
      player.tool = input.tool;
      player.moving = Math.min(1, Math.hypot(input.mx, input.mz));
      stepActor(player, input, this.pieces, dt, this.mode === 'solo' && player.id === 1 ? 4.45 : 6.8);
    }
    for (const player of this.players) if (player.hp > 0) this.act(player, this.inputs[player.id]);
    if (this.mode === 'practice') return;
    this.remaining = Math.max(0, this.remaining - dt);
    const [first, second] = this.players;
    if (!first.hp) this.finishRound(1);
    else if (!second.hp) this.finishRound(0);
    else if (!this.remaining) {
      const diff = first.hp + first.shield - second.hp - second.shield;
      this.finishRound(diff === 0 ? null : diff > 0 ? 0 : 1);
    }
  }

  snapshot() {
    return { mode: this.mode, players: this.players, pieces: this.pieces, shots: this.shots, round: this.round, scores: this.scores,
      clock: this.clock, phase: this.phase, remaining: Math.max(0, this.remaining), roundWinner: this.roundWinner };
  }
}
