import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanInput, Match, MATERIALS, WEAPONS } from '../shared/match.js';

const step = (match, duration) => {
  for (let i = 0; i < Math.ceil(duration * 60); i++) match.update(1 / 60);
};

test('a practice player can use all four pieces and clear the arena', () => {
  const match = new Match('practice');
  for (const tool of ['wall', 'ramp', 'floor', 'roof']) {
    match.setInput(0, { tool, fire: true });
    step(match, .22);
  }
  assert.deepEqual(match.pieces.map((piece) => piece.kind), ['wall', 'ramp', 'floor', 'roof']);
  assert.equal(match.players[0].materials, MATERIALS);
  match.clearBuilds();
  assert.equal(match.pieces.length, 0);
});

test('shots cost ammunition, break shields first and can be reloaded', () => {
  const match = new Match('online');
  step(match, 2.5);
  Object.assign(match.players[1], { x: .86, z: 6 });
  match.setInput(0, { tool: 'burst', pitch: -.037, fire: true });
  step(match, .33);
  assert.equal(match.players[0].ammo.burst, WEAPONS.burst.clip - 3);
  assert.equal(match.players[1].shield, 0);
  assert.equal(match.players[1].hp, 93);
  match.setInput(0, { reload: true });
  step(match, 1.5);
  assert.equal(match.players[0].ammo.burst, WEAPONS.burst.clip);
});

test('a duel resets resources and ends when one player wins three rounds', () => {
  const match = new Match('online');
  for (let round = 1; round <= 3; round++) {
    step(match, 2.5);
    assert.equal(match.phase, 'playing');
    assert.equal(match.round, round);
    assert.equal(match.players[0].materials, MATERIALS);
    match.setInput(0, { tool: 'wall', fire: true });
    step(match, .08);
    assert.equal(match.players[0].materials, MATERIALS - 1);
    match.players[1].hp = 0;
    step(match, .017);
    assert.equal(match.scores[0], round);
    assert.equal(match.roundWinner, 0);
    if (round < 3) step(match, 2.7);
  }
  assert.equal(match.phase, 'finished');
  assert.deepEqual(match.snapshot().scores, [3, 0]);
});

test('the bot moves toward the duel and server input constrains axes and tools', () => {
  const match = new Match('solo');
  step(match, 4.2);
  assert.ok(match.players[1].z > -17);
  const p = match.players[0];
  const input = cleanInput({ mx: 100, mz: -100, yaw: NaN, pitch: -99, tool: 'invalid', fire: 'true' }, p);
  assert.deepEqual(input, { mx: 1, mz: -1, yaw: p.yaw, pitch: -1.23, tool: p.tool, jump: false, fire: false, reload: false });
});
