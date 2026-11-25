import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LEVEL, TILE } from '../../shared/arena.js';

const geometries = new Map();
const materials = new Map();
const outlines = new Map();

export function surface(color, roughness = .7, metalness = .15, emissive = 0, intensity = 1) {
  const key = [color, roughness, metalness, emissive, intensity].join('/');
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: intensity }));
  return materials.get(key);
}

export function block(w, h, d, material, x = 0, y = 0, z = 0, bevel = 0) {
  const key = [w, h, d, bevel].join('/');
  if (!geometries.has(key)) geometries.set(key, bevel ? new RoundedBoxGeometry(w, h, d, 2, bevel) : new THREE.BoxGeometry(w, h, d));
  const mesh = new THREE.Mesh(geometries.get(key), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function bright(color) { return surface(color, .44, .05, color, .8); }

export function edged(mesh, color, opacity = .55) {
  if (!outlines.has(mesh.geometry)) outlines.set(mesh.geometry, new THREE.EdgesGeometry(mesh.geometry, 25));
  const line = new THREE.LineSegments(outlines.get(mesh.geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  mesh.add(line);
  return mesh;
}

function plate(parent, points, material, x, y, z, reverse = false) {
  const shape = new THREE.Shape(points.map(([px, py]) => new THREE.Vector2(px, py)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: .025, bevelEnabled: true, bevelThickness: .012, bevelSize: .009, bevelSegments: 1 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  if (reverse) mesh.rotation.y = Math.PI;
  parent.add(mesh);
  return mesh;
}

export function fighter({ accent = 0xd4ff46, armor = 0xe1e7f3, enemy = false } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const shell = surface(armor, .49, .25);
  const inner = surface(enemy ? 0x301624 : 0x171d37, .81, .16);
  const joint = surface(0x373c60, .73, .38);
  const dark = surface(0x0b1021, .55, .4);
  const glow = bright(accent);
  const visor = surface(enemy ? 0x651632 : 0x321a5b, .24, .62, enemy ? 0x641533 : 0x471593, .5);
  const set = (node, ...items) => { for (const item of items) { item.castShadow = true; node.add(item); } };

  set(body, block(.45, .26, .34, inner, 0, .95, 0, .045), block(.55, .40, .37, inner, 0, 1.30, 0, .06),
    block(.45, .36, .11, joint, 0, 1.34, .21, .035), block(.28, .15, .26, joint, 0, 1.59, 0, .028),
    block(.48, .10, .40, joint, 0, 1.04, 0, .024), block(.15, .073, .044, glow, 0, 1.042, -.22, .012));
  plate(body, [[-.34,.12],[-.24,.23],[.24,.23],[.34,.12],[.21,-.10],[-.21,-.10]], shell, 0, 1.34, -.185, true).castShadow = true;
  plate(body, [[-.19,.11],[.19,.11],[.133,.018],[0,-.04],[-.133,.018]], inner, 0, 1.43, -.224, true);
  plate(body, [[-.12,.033],[0,-.018],[.12,.033],[.08,-.038],[0,-.085],[-.08,-.038]], glow, 0, 1.41, -.254, true);
  plate(body, [[-.155,.12],[.155,.12],[.13,-.08],[0,-.16],[-.13,-.08]], shell, 0, 1.35, .275);
  plate(body, [[-.128,.065],[0,-.025],[.128,.065],[.10,-.038],[0,-.103],[-.10,-.038]], glow, 0, 1.37, .308);

  const head = new THREE.Group();
  head.position.y = 1.85;
  set(head, block(.56, .51, .51, dark, 0, 0, 0, .103), block(.46, .22, .41, shell, 0, .138, .027, .065),
    block(.57, .105, .214, inner, 0, -.134, -.154, .034), block(.444, .11, .105, visor, 0, .005, -.242, .025),
    block(.348, .027, .024, glow, 0, .035, -.302, .011), block(.15, .024, .027, glow, 0, -.118, .246, .01));
  for (const sign of [-1, 1]) {
    const cheek = block(.118, .26, .34, shell, sign * .243, -.019, -.021, .035);
    cheek.rotation.z = sign * .11;
    const vent = block(.028, .078, .117, joint, sign * .315, .009, -.021, .009);
    const ridge = block(.153, .031, .37, shell, sign * .114, .23, -.027, .014);
    set(head, cheek, vent, ridge, block(.09, .044, .029, glow, sign * .191, -.072, -.257, .008));
  }
  body.add(head);

  const legs = [];
  for (const sign of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sign * .153, .934, .009);
    leg.rotation.z = sign * .045;
    const boot = new THREE.Group();
    boot.position.set(0, -.49, 0);
    set(leg, block(.218, .454, .274, inner, 0, -.212, .004, .038), block(.225, .304, .116, shell, sign * .018, -.216, -.131, .033));
    set(boot, block(.205, .331, .238, joint, 0, -.153, .011, .028), block(.238, .317, .125, shell, 0, -.143, -.105, .027),
      block(.236, .135, .388, dark, 0, -.366, -.063, .035), block(.21, .05, .209, shell, 0, -.323, -.157, .013),
      block(.126, .024, .033, glow, 0, -.091, -.176, .006));
    leg.add(boot);
    body.add(leg);
    legs.push({ leg, boot });
  }
  for (const sign of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sign * .385, 1.47, 0);
    arm.rotation.set(sign > 0 ? .77 : 1.00, 0, sign > 0 ? .20 : .44);
    const elbow = new THREE.Group();
    elbow.position.y = -.264;
    elbow.rotation.x = sign > 0 ? .67 : .90;
    set(arm, block(.218, .316, .233, inner, 0, -.132, 0, .032), block(.288, .225, .314, shell, sign * .014, .016, -.015, .055),
      block(.079, .042, .018, glow, sign * .075, .057, -.178, .006));
    set(elbow, block(.202, .25, .203, joint, 0, -.118, 0, .028), block(.116, .201, .208, shell, sign * .078, -.100, -.01, .029),
      block(.169, .115, .171, dark, 0, -.253, 0, .023));
    arm.add(elbow);
    body.add(arm);
  }

  const blaster = new THREE.Group();
  blaster.position.set(.35, 1.27, -.405);
  set(blaster, block(.213, .177, .55, dark, 0, 0, -.12, .034), block(.25, .124, .46, shell, 0, .073, -.09, .022),
    block(.135, .145, .52, joint, 0, .014, -.48, .018), block(.17, .161, .138, dark, 0, .014, -.706, .026),
    block(.081, .070, .018, glow, 0, .013, -.781, .01), block(.092, .205, .12, inner, 0, -.121, -.064, .016),
    block(.027, .041, .27, glow, .119, .068, -.122, .007), block(.027, .041, .27, glow, -.119, .068, -.122, .007),
    block(.112, .051, .117, dark, 0, .151, -.045, .012));
  body.add(blaster);
  return { group, body, head, legs, blaster };
}

export function pose(model, player, clock) {
  const { group, body, head, legs, blaster } = model;
  group.position.set(player.x, player.y, player.z);
  group.rotation.y = -player.yaw;
  body.rotation.x = -player.moving * .065;
  body.position.y = player.grounded ? Math.sin(clock * 19) * .022 * player.moving : 0;
  head.rotation.x = Math.max(-.38, Math.min(.38, player.pitch * .52));
  for (let i = 0; i < legs.length; i++) {
    const swing = Math.sin(clock * 10.75 + Math.PI * i) * player.moving;
    legs[i].leg.rotation.x = player.grounded ? swing * .69 : i ? .34 : -.35;
    legs[i].boot.rotation.x = Math.max(0, -swing * .58);
  }
  blaster.rotation.x = player.pitch * .57;
  blaster.visible = player.tool === 'burst' || player.tool === 'scatter';
  blaster.scale.set(player.tool === 'scatter' ? 1.24 : 1, 1, player.tool === 'scatter' ? .84 : 1);
}

const templates = new Map();
function slopeGeometry(kind) {
  const v = kind === 'ramp'
    ? [[-2,0,2],[2,0,2],[2,0,-2],[-2,0,-2],[-2,LEVEL,-2],[2,LEVEL,-2]]
    : [[-2,0,2],[2,0,2],[2,0,-2],[-2,0,-2],[0,1.65,0]];
  const indices = kind === 'ramp' ? [0,1,5,0,5,4,3,4,5,3,5,2,0,4,3,1,2,5,0,3,2,0,2,1] : [0,1,4,1,2,4,2,3,4,3,0,4,0,3,2,0,2,1];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(indices.flatMap((i) => v[i]), 3));
  geo.computeVertexNormals();
  return geo;
}

function pieceTemplate(kind, owner, ghost) {
  const key = `${kind}/${owner}/${ghost}`;
  if (templates.has(key)) return templates.get(key);
  const group = new THREE.Group();
  const hue = ghost === 'blocked' ? 0xff5c83 : ghost ? 0xcfff59 : owner ? 0xfc6a95 : 0x7ddcff;
  const erase = new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: .20, depthWrite: false, side: THREE.DoubleSide });
  const frame = ghost ? erase : surface(owner ? 0x644060 : 0x375677, .52, .5, hue, .11);
  const sheet = ghost ? erase : surface(owner ? 0x5b405e : 0x365376, .72, .25, hue, .095);
  const lit = ghost ? erase : bright(hue);
  const outline = (mesh, opacity = .68) => group.add(edged(mesh, hue, opacity));
  if (kind === 'wall') {
    outline(block(TILE, LEVEL, .17, sheet, 0, LEVEL / 2, 0));
    if (!ghost) for (const side of [-1, 1]) {
      for (const x of [-1.9, 0, 1.9]) group.add(block(.07, LEVEL - .04, .055, x ? frame : lit, x, LEVEL / 2, side * .1));
      group.add(block(3.86, .066, .062, lit, 0, 2.92, side * .101));
      group.add(block(3.85, .04, .046, frame, 0, .42, side * .104));
      for (let j = -6; j <= 6; j++) group.add(block(.082, .022, .02, lit, j * .28, 1.06, side * .115));
    }
  } else if (kind === 'floor') {
    outline(block(TILE, .3, TILE, sheet, 0, -.03, 0));
    if (!ghost) for (const side of [-1, 1]) {
      group.add(block(3.85, .018, .046, lit, 0, .121, side * 1.9));
      group.add(block(.046, .018, 3.85, lit, side * 1.9, .121, 0));
    }
  } else {
    const mesh = new THREE.Mesh(slopeGeometry(kind), sheet);
    outline(mesh, .82);
    if (kind === 'ramp' && !ghost) for (let i = 1; i < 8; i++) {
      group.add(block(3.92, .022, .036, i % 2 ? frame : lit, 0, i * LEVEL / 8 + .014, 2 - i * TILE / 8));
    }
  }
  templates.set(key, group);
  return group;
}

export function buildModel(piece, ghost = '') {
  const group = pieceTemplate(piece.kind, piece.owner || 0, ghost).clone();
  group.position.set(piece.x, piece.y, piece.z);
  group.rotation.y = -piece.rot * Math.PI / 2;
  return group;
}
