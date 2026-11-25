import * as THREE from 'three';
import { PIECES, placement, viewFor } from '../../shared/arena.js';
import { buildModel, fighter, pose } from './models.js';
import { makeArena, rendererFor } from './scenery.js';

const shortest = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function makeWorld(canvas) {
  const renderer = rendererFor(canvas);
  const scene = makeArena();
  const camera = new THREE.PerspectiveCamera(65, 1, .07, 140);
  const lookAt = new THREE.Vector3();
  const models = [fighter(), fighter({ accent: 0xff567e, armor: 0xd9a8cd, enemy: true })];
  const shadows = models.map((model, i) => {
    scene.add(model.group);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.45, 24), new THREE.MeshBasicMaterial({ color: 0x090917, transparent: true, opacity: .49, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(.13, .19, 4), new THREE.MeshBasicMaterial({ color: 0xff5f88 }));
    marker.rotation.x = Math.PI;
    marker.position.y = 2.46;
    marker.visible = i === 1;
    model.group.add(marker);
    model.marker = marker;
    return shadow;
  });
  const structure = new Map();
  const visuals = new Map();
  const effects = [];
  const effectMaterial = [0xf4ffac, 0xff72a1].map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
  const bolt = new THREE.CylinderGeometry(.013, .013, 1, 4);
  const puff = new THREE.OctahedronGeometry(.12);
  const direction = new THREE.Vector3();
  const vertical = new THREE.Vector3(0, 1, 0);
  let ghost;
  let ghostKey;
  let lastShot = 0;
  let lastRound;

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 620 ? 74 : 65;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  function updatePieces(pieces) {
    const current = new Set();
    for (const piece of pieces) {
      current.add(piece.id);
      if (!structure.has(piece.id)) {
        const model = buildModel(piece);
        model.scale.y = .15;
        structure.set(piece.id, model);
        scene.add(model);
      }
      const model = structure.get(piece.id);
      model.scale.y += (1 - model.scale.y) * .28;
    }
    for (const [id, model] of structure) if (!current.has(id)) { scene.remove(model); structure.delete(id); }
  }

  function fire(shot, playerId) {
    const from = new THREE.Vector3(...shot.from);
    const to = new THREE.Vector3(...shot.to);
    direction.subVectors(to, from);
    const length = direction.length();
    const material = effectMaterial[Number(shot.player !== playerId)].clone();
    const line = new THREE.Mesh(bolt, material);
    line.position.copy(from).lerp(to, .5);
    line.scale.set(shot.tool === 'scatter' ? 1.85 : 1.2, length, 1.3);
    line.quaternion.setFromUnitVectors(vertical, direction.normalize());
    const muzzle = new THREE.Mesh(puff, material);
    muzzle.position.copy(from);
    const impact = new THREE.Mesh(puff, material);
    impact.scale.setScalar(shot.target === null ? .66 : 1.5);
    impact.position.copy(to);
    scene.add(line, muzzle, impact);
    effects.push({ line, muzzle, impact, material, ttl: .15 });
  }

  return {
    render(state, id, aim, tool, dt) {
      const myPlayer = state.players[id];
      if (!myPlayer) return;
      if (lastRound !== state.round) { visuals.clear(); lastRound = state.round; }
      const smooth = state.mode === 'online' ? 1 - Math.exp(-dt * 23) : 1;
      let self;
      for (let i = 0; i < models.length; i++) {
        const player = state.players[i];
        models[i].group.visible = shadows[i].visible = !!player && player.hp > 0;
        if (!player) continue;
        if (!visuals.has(i)) visuals.set(i, { ...player });
        const draw = visuals.get(i);
        for (const axis of ['x', 'y', 'z']) draw[axis] += (player[axis] - draw[axis]) * smooth;
        draw.yaw += shortest(draw.yaw, player.yaw) * smooth;
        Object.assign(draw, { pitch: player.pitch, moving: player.moving, tool: player.tool, grounded: player.grounded });
        if (i === id) {
          draw.yaw = aim.yaw;
          draw.pitch = aim.pitch;
          draw.tool = tool;
          self = draw;
        }
        pose(models[i], draw, state.clock);
        models[i].marker.visible = i !== id;
        shadows[i].position.set(draw.x, draw.y + .016, draw.z);
      }
      const view = viewFor(self, state.pieces);
      if (view.close) models[id].group.visible = false;
      camera.position.set(...view.position);
      camera.lookAt(lookAt.set(...view.direction).add(camera.position));
      updatePieces(state.pieces);
      const next = state.phase === 'playing' && PIECES.includes(tool) ? placement(self, tool, state.pieces, state.players.map((player) => player.id === id ? self : player)) : null;
      const validity = next?.valid && (state.mode === 'practice' || myPlayer.materials > 0) && state.pieces.length < 96;
      const key = next && `${next.kind}/${next.x}/${next.y}/${next.z}/${next.rot}/${validity}`;
      if (key !== ghostKey) {
        if (ghost) scene.remove(ghost);
        ghost = next ? buildModel(next, validity ? 'valid' : 'blocked') : null;
        if (ghost) scene.add(ghost);
        ghostKey = key;
      }
      for (const shot of state.shots) if (shot.id > lastShot) fire(shot, id);
      if (state.shots.length) lastShot = state.shots.at(-1).id;
      for (let i = effects.length - 1; i >= 0; i--) {
        const fx = effects[i];
        fx.ttl -= dt;
        if (fx.ttl <= 0) {
          scene.remove(fx.line, fx.muzzle, fx.impact);
          fx.material.dispose();
          effects.splice(i, 1);
        } else fx.material.opacity = fx.ttl / .15;
      }
      renderer.render(scene, camera);
    },
    reset() {
      lastRound = lastShot = 0;
      for (const model of structure.values()) scene.remove(model);
      structure.clear();
    },
    close() {
      observer.disconnect();
      scene.traverse((object) => {
        // Shared fighter and build meshes are cached for the next match.
        if (object.isInstancedMesh) object.dispose();
      });
      for (const fx of effects) fx.material.dispose();
      bolt.dispose();
      puff.dispose();
      effectMaterial.forEach((material) => material.dispose());
      renderer.dispose();
    },
  };
}
