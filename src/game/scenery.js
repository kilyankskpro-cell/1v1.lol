import * as THREE from 'three';
import { ARENA_EDGE, COVER } from '../../shared/arena.js';
import { block, edged, fighter, surface } from './models.js';
import { makeSky } from './sky.js';

function randomSource(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
const glow = (color, strength = .85) => surface(color, .7, .1, color, strength);

export function rendererFor(canvas, transparent = false) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: transparent, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  return renderer;
}

function lighting(scene, cinematic = false) {
  scene.add(new THREE.HemisphereLight(cinematic ? 0xc2c7ff : 0xb5bbff, 0x63557d, cinematic ? 2.05 : 2.2));
  const key = new THREE.DirectionalLight(0xf3ebff, cinematic ? 2.7 : 2.3);
  key.position.set(-14, 20, -18);
  scene.add(key);
  const edge = new THREE.DirectionalLight(cinematic ? 0xb74bff : 0x7279ff, cinematic ? 3.5 : 1.75);
  edge.position.set(7, 4, 11);
  scene.add(edge);
  const fill = new THREE.DirectionalLight(0x65adff, cinematic ? 1.15 : .55);
  fill.position.set(12, 2, -2);
  scene.add(fill);
}

function rock(scene, x, y, z, width, height, seed) {
  const rng = randomSource(seed);
  const sides = 6;
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = i / sides * Math.PI * 2;
    const r = .72 + rng() * .34;
    points.push([Math.cos(angle) * width * r, rng() * .9, Math.sin(angle) * width * r]);
  }
  const tip = [width * (rng() - .5) * .55, -height, width * (rng() - .5) * .55];
  const vertices = [];
  const colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    for (const triangle of [[[0, .5, 0], points[next], points[i]], [points[i], points[next], tip]]) {
      color.setHSL(.69 + rng() * .075, .33 + rng() * .1, .15 + rng() * .14);
      for (const p of triangle) { vertices.push(...p); colors.push(color.r, color.g, color.b); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }));
  mesh.position.set(x, y, z);
  scene.add(mesh);
}

function tower(scene, x, y, z, width, height, hue = 0x9060ff) {
  const metal = surface(0x282441, .69, .35);
  const light = glow(hue, 1.1);
  const pillar = new THREE.Group();
  pillar.position.set(x, y, z);
  pillar.add(block(width, height, width, metal, 0, height / 2, 0, .075), block(width * 1.2, .21, width * 1.2, metal, 0, .105, 0, .05),
    block(width * .68, .16, width * .68, light, 0, height + .04, 0, .03), block(width * .085, height * .72, .024, light, width * .22, height * .54, -width / 2),
    block(.024, height * .51, width * .087, light, -width / 2, height * .60, width * .22));
  scene.add(pillar);
}

function pad(scene, width, z, hue) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(width - .055, width, 6), new THREE.MeshBasicMaterial({ color: hue, side: THREE.DoubleSide, transparent: true, opacity: .75 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, .024, z);
  scene.add(ring);
  const inlay = new THREE.Mesh(new THREE.CircleGeometry(width - .12, 6), new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: .115, depthWrite: false }));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(0, .018, z);
  scene.add(inlay);
}

export function makeArena() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x554770);
  scene.fog = new THREE.Fog(0x554770, 40, 124);
  scene.add(makeSky());
  lighting(scene);
  const dark = surface(0x272a42, .82, .31);
  const purple = glow(0xa978ff, .67);
  const cyan = glow(0x56bfff, .73);
  scene.add(block(53.6, 2.1, 53.6, dark, 0, -1.1, 0, .16));
  const rng = randomSource(27);
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(3.96, .16, 3.96), surface(0xa7a9be, .82, .15), 169);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  let index = 0;
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
    tiles.setMatrixAt(index, matrix.makeTranslation(x * 4, -.08, z * 4));
    tiles.setColorAt(index++, color.setHSL(.64 + rng() * .045, .19, .17 + rng() * .067));
  }
  scene.add(tiles);
  const grid = new THREE.GridHelper(52, 52, 0x5e588f, 0x464760);
  grid.material.transparent = true;
  grid.material.opacity = .39;
  grid.position.y = .008;
  scene.add(grid);
  for (const sign of [-1, 1]) {
    scene.add(block(52.35, .047, .14, purple, 0, .025, sign * ARENA_EDGE), block(.14, .047, 52.35, purple, sign * ARENA_EDGE, .025, 0));
    pad(scene, 2.05, sign * 19, sign > 0 ? 0xb6ef5a : 0xff6e98);
    for (const offset of [-19, -9, 9, 19]) {
      tower(scene, offset, -.65, sign * 27, .69, 3.55, offset > 0 ? 0x8f67fa : 0x72b3ff);
      tower(scene, sign * 27, -.65, offset, .69, 3.55, 0x8f67fa);
    }
    for (const x of [-3.6, 3.6]) {
      tower(scene, x, -.35, sign * 25.3, .38, 4.3, sign > 0 ? 0xb0dc62 : 0xff6e98);
    }
  }
  for (const cover of COVER) {
    const { x, y, z, w, h, d } = cover;
    scene.add(edged(block(w, h, d, surface(0x35344d, .62, .46), x, y + h / 2, z, .09), 0x8274bf, .48));
    for (const sign of [-1, 1]) {
      scene.add(block(w - .38, .062, .032, cyan, x, y + h - .24, z + sign * (d / 2 + .015)));
      scene.add(block(w - .38, .038, .026, dark, x, y + .37, z + sign * (d / 2 + .015)));
    }
  }
  scene.add(edged(block(3.9, .012, 3.9, dark, 0, .01, 0), 0xb490ff, .64));
  pad(scene, 1.38, 0, 0xb791ff);
  const markings = surface(0x9085c5, .8, .04, 0x56407b, .36);
  for (const sign of [-1, 1]) for (let index = 1; index <= 6; index++) {
    scene.add(block(.057, .01, .95, markings, 0, .015, sign * (index * 2.2 + 1.7)));
  }
  for (let i = 0; i < 19; i++) {
    const theta = i / 19 * Math.PI * 2;
    const dist = 45 + rng() * 47;
    const y = 2 + (rng() - .45) * 17;
    const x = Math.cos(theta) * dist;
    const z = Math.sin(theta) * dist;
    rock(scene, x, y, z, 3.8 + rng() * 8.5, 8 + rng() * 19, i + 3);
    if (i % 3 !== 1) {
      tower(scene, x, y, z, 1.15, 4 + rng() * 10);
      tower(scene, x + 2, y, z - 1.4, .87, 2 + rng() * 6, 0x6f9df9);
    }
  }
  return scene;
}

function emblem(scene, x, y, z) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.18, .017, 6, 90), new THREE.MeshBasicMaterial({ color: 0xbb8fff, transparent: true, opacity: .54 }));
  ring.position.set(x, y, z);
  ring.rotation.y = .28;
  scene.add(ring);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(3.51, .013, 6, 80, Math.PI * 1.46), new THREE.MeshBasicMaterial({ color: 0xa970ff, transparent: true, opacity: .32 }));
  outer.position.copy(ring.position);
  outer.rotation.set(0, .28, .57);
  scene.add(outer);
}

export function renderHero(canvas) {
  const renderer = rendererFor(canvas, true);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x292044, .038);
  lighting(scene, true);
  const camera = new THREE.PerspectiveCamera(40, 1, .06, 135);
  camera.position.set(2.62, 1.86, -5.35);
  camera.lookAt(0, 1.30, 0);
  const hero = fighter();
  hero.group.rotation.y = -.45;
  hero.group.scale.setScalar(1.35);
  hero.body.rotation.z = -.045;
  hero.head.rotation.y = .03;
  hero.legs[0].leg.rotation.x = -.11;
  hero.legs[1].leg.rotation.x = .12;
  hero.blaster.rotation.set(-.20, -.12, -.09);
  scene.add(hero.group);

  const metal = surface(0x2e2b50, .62, .38);
  const violet = glow(0x9f69ff, .9);
  const floor = block(48, .17, 51, surface(0x242235, .86), 0, -.15, 14);
  scene.add(floor);
  const grid = new THREE.GridHelper(47, 41, 0x8b62e4, 0x55427f);
  grid.material.transparent = true;
  grid.material.opacity = .57;
  grid.position.set(0, -.06, 13);
  scene.add(grid);
  scene.add(block(7, .11, 4.3, metal, -.5, -.081, .35, .09), block(6.7, .027, .032, violet, -.5, -.015, -1.8));
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.80, 40), new THREE.MeshBasicMaterial({ color: 0x07080f, transparent: true, opacity: .5, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.y = .60;
  shadow.position.set(0, -.011, .03);
  scene.add(shadow);
  emblem(scene, -1.95, 2.05, 5.3);

  const rng = randomSource(21);
  for (let i = 0; i < 16; i++) {
    const x = (i - 7.5) * 2.65;
    const z = 8 + rng() * 18;
    const h = 1.1 + rng() * 7;
    tower(scene, x, -1.15, z, .55 + rng() * 1.37, h, i % 3 ? 0x9874e3 : 0xb5a1ff);
    if (i % 3 === 0) rock(scene, x + 2, h + 2.6, z + 3, .73 + rng() * 1.75, 2 + rng() * 1.95, i + 81);
  }
  for (const [x,z,y,r] of [[-4.0,2.8,1.2,.48],[3.6,3.7,1.4,-.42],[-7.9,5.2,.7,.31]]) {
    const panel = edged(block(3.05, .15, 4.2, metal, x, y, z, .04), 0x9f79ff, .90);
    panel.rotation.set(r, -.3, 0);
    scene.add(panel);
    const lip = block(3.04, .055, .044, violet, 0, .081, -2.08);
    panel.add(lip);
  }
  const starPoints = Array.from({ length: 125 }, () => [(rng() - .5) * 55, rng() * 15 + 1, 7 + rng() * 33]).flat();
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.Float32BufferAttribute(starPoints, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ size: .048, color: 0xc6a9ff, opacity: .75, transparent: true })));
  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.setViewOffset(width, height, -width * (width < 680 ? .15 : .218), height * (width < 680 ? .05 : -.02), width, height);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  return () => observer.disconnect();
}
