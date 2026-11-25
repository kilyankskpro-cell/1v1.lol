import assert from 'node:assert/strict';
import test from 'node:test';
import { placement, shotFrom, spawn, stepActor, trace } from '../shared/arena.js';

const tick = (actor, input, pieces, count) => {
  for (let i = 0; i < count; i++) stepActor(actor, input, pieces, 1 / 60);
};

test('build pieces snap to the grid, reject duplicates and stay in the arena', () => {
  const actor = spawn(0);
  const wall = placement(actor, 'wall', []);
  assert.deepEqual(wall, { kind: 'wall', x: 0, y: 0, z: 14, rot: 0, valid: true });
  assert.equal(placement(actor, 'wall', [wall]).valid, false);
  assert.equal(placement({ ...actor, x: 25, yaw: Math.PI / 2 }, 'ramp', []).valid, false);
  assert.equal(placement({ ...actor, y: 3.11 }, 'floor', []).y, 3);
});

test('a wall blocks walking; a ramp can be climbed onto an elevated floor', () => {
  const actor = spawn(0);
  const wall = { kind: 'wall', x: 0, y: 0, z: 14, rot: 0 };
  tick(actor, { mz: 1 }, [wall], 120);
  assert.ok(actor.z > 14.4);
  const climber = spawn(0);
  const ramp = { kind: 'ramp', x: 0, y: 0, z: 16, rot: 0 };
  const floor = { kind: 'floor', x: 0, y: 3, z: 12, rot: 0 };
  tick(climber, { mz: 1 }, [ramp, floor], 66);
  assert.ok(climber.z < 14 && climber.z > 10);
  assert.ok(climber.y >= 3);
  tick(climber, { mz: 1 }, [ramp, floor], 60);
  assert.ok(climber.y < .1);
});

test('movement supports jumping off the ground', () => {
  const actor = spawn(0);
  tick(actor, { jump: true }, [], 1);
  tick(actor, {}, [], 20);
  assert.ok(actor.y > 1.2);
  tick(actor, {}, [], 80);
  assert.equal(actor.y, 0);
  assert.equal(actor.grounded, true);
});

test('shots hit the first target and are absorbed by cover', () => {
  const actor = { ...spawn(0), pitch: -.037 };
  const opponent = { ...spawn(1), x: .86, z: 6 };
  const wall = { kind: 'wall', x: 0, y: 0, z: 14, rot: 0 };
  assert.equal(shotFrom(actor, [], [opponent], 40).item, opponent);
  assert.equal(shotFrom(actor, [wall], [opponent], 40).item, wall);
});

test('a shot over the low end of a ramp does not hit its invisible bounding box', () => {
  const ramp = { kind: 'ramp', x: 0, y: 0, z: 0, rot: 0 };
  assert.equal(trace([3, 2, 1.5], [-1, 0, 0], 6, [ramp]).type, undefined);
  assert.equal(trace([3, 2, -1.5], [-1, 0, 0], 6, [ramp]).item, ramp);
});
