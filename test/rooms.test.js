import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { attachRooms } from '../server/rooms.mjs';

async function joinWire(server) {
  const host = `127.0.0.1:${server.address().port}`;
  const socket = new WebSocket(`ws://${host}/duel`, { origin: `http://${host}` });
  const queue = [];
  let expect;
  socket.on('message', (raw) => {
    const data = JSON.parse(raw);
    if (expect?.predicate(data)) expect.resolve(data);
    else {
      queue.push(data);
      if (queue.length > 128) queue.shift();
    }
  });
  await once(socket, 'open');
  return {
    send(message) { socket.send(JSON.stringify(message)); },
    read(predicate) {
      const index = queue.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { expect = null; reject(new Error('Salon: réponse non reçue')); }, 5500);
        expect = { predicate, resolve(data) { expect = null; clearTimeout(timer); resolve(data); } };
      });
    },
    close() { socket.close(); },
  };
}

const type = (name) => (message) => message.type === name;

test('a private code starts a shared duel, replicates construction and releases the room on leave', async (t) => {
  const server = createServer();
  const dispose = attachRooms(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { dispose(); return new Promise((resolve) => server.close(resolve)); });
  const host = await joinWire(server);
  const friend = await joinWire(server);
  const outsider = await joinWire(server);
  host.send({ type: 'create' });
  const { code } = await host.read(type('joined'));
  assert.match(code, /^[A-Z2-9]{6}$/);
  friend.send({ type: 'join', code: 'INEXIS' });
  assert.match((await friend.read(type('error'))).message, /introuvable/);
  friend.send({ type: 'join', code: code.toLowerCase() });
  assert.equal((await friend.read(type('joined'))).player, 1);
  const [first, second] = await Promise.all([host.read(type('start')), friend.read(type('start'))]);
  assert.deepEqual(first.state, second.state);
  outsider.send({ type: 'join', code });
  assert.match((await outsider.read(type('error'))).message, /complet/);
  await host.read((event) => event.type === 'state' && event.state.phase === 'playing');
  host.send({ type: 'input', input: { tool: 'wall', fire: true } });
  const wall = (await friend.read((event) => event.type === 'state' && event.state.pieces.length > 0)).state.pieces[0];
  assert.equal(wall.kind, 'wall');
  assert.equal(wall.owner, 0);
  host.send({ type: 'input', input: { mz: 1 } });
  const moved = (await friend.read((event) => event.type === 'state' && event.state.players[0].z < 18.7)).state;
  const stopped = (await friend.read((event) => event.type === 'state' && event.state.clock > moved.clock + .45)).state;
  assert.ok(stopped.players[0].z < moved.players[0].z);
  assert.equal(stopped.players[0].moving, 0);
  host.close();
  await friend.read(type('left'));
  outsider.send({ type: 'join', code });
  assert.match((await outsider.read(type('error'))).message, /introuvable/);
});
