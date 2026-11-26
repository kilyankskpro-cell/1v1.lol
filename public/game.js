// Logique de jeu partagée (navigateur + serveur Node). Aucune dépendance réseau.
(function (root) {
  const W = 800, H = 500, R = 16, SPEED = 220, BSPEED = 600, COOLDOWN = 0.28, DMG = 20, WIN = 5;
  const WALLS = [
    { x: 380, y: 150, w: 40, h: 200 },
    { x: 150, y: 60, w: 100, h: 30 },
    { x: 550, y: 410, w: 100, h: 30 },
  ];
  const SPAWNS = [{ x: 60, y: H / 2 }, { x: W - 60, y: H / 2 }];

  function hitsWall(x, y, r) {
    return WALLS.some(b => x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h);
  }
  function Game() {
    this.players = [0, 1].map(i => ({ x: SPAWNS[i].x, y: SPAWNS[i].y, angle: i ? Math.PI : 0, hp: 100, cd: 0, score: 0 }));
    this.bullets = [];
    this.winner = -1;
  }
  Game.prototype.step = function (dt, inputs) {
    if (this.winner >= 0) return;
    this.players.forEach((p, i) => {
      const inp = inputs[i] || {};
      let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      const l = Math.hypot(dx, dy) || 1;
      const nx = Math.min(W - R, Math.max(R, p.x + dx / l * SPEED * dt));
      const ny = Math.min(H - R, Math.max(R, p.y + dy / l * SPEED * dt));
      if (!hitsWall(nx, p.y, R)) p.x = nx;
      if (!hitsWall(p.x, ny, R)) p.y = ny;
      if (typeof inp.angle === 'number') p.angle = inp.angle;
      p.cd -= dt;
      if (inp.shoot && p.cd <= 0) {
        p.cd = COOLDOWN;
        this.bullets.push({ x: p.x + Math.cos(p.angle) * R, y: p.y + Math.sin(p.angle) * R,
          vx: Math.cos(p.angle) * BSPEED, vy: Math.sin(p.angle) * BSPEED, o: i });
      }
    });
    this.bullets = this.bullets.filter(b => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H || hitsWall(b.x, b.y, 2)) return false;
      const t = this.players[1 - b.o];
      if (Math.hypot(t.x - b.x, t.y - b.y) < R + 3) {
        t.hp -= DMG;
        if (t.hp <= 0) {
          this.players[b.o].score++;
          if (this.players[b.o].score >= WIN) this.winner = b.o;
          this.respawn();
        }
        return false;
      }
      return true;
    });
  };
  Game.prototype.respawn = function () {
    this.players.forEach((p, i) => { p.x = SPAWNS[i].x; p.y = SPAWNS[i].y; p.hp = 100; });
    this.bullets = [];
  };
  Game.prototype.snapshot = function () { return { players: this.players, bullets: this.bullets, winner: this.winner }; };

  const api = { Game, W, H, R, WALLS, WIN };
  if (typeof module !== 'undefined') module.exports = api; else root.GameLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
