import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DT = 1 / 120;
const TAU = 0.07;          // how fast the piece chases the finger
const MAX_V = 6, MAX_W = 5; // speed limits keep thin wires from tunnelling
const LEASH = 0.45, LEASH_ROT = 0.5;

// ---------- shapes ----------
function curveOf(points, closed) {
  return new THREE.CatmullRomCurve3(points.map(p => V(...p)), closed, 'centripetal');
}
function circle(r, n = 24) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([r * Math.cos(a), r * Math.sin(a), 0]); }
  return pts;
}
function helix({ start, r, pitch, turns, step = 18 }) {
  const pts = [];
  const n = Math.round(turns * 360 / step);
  for (let i = 0; i <= n; i++) {
    const a = i / n * turns * Math.PI * 2;
    pts.push([start[0] + r - r * Math.cos(a), start[1] + pitch * a / (Math.PI * 2), start[2] + r * Math.sin(a)]);
  }
  return pts;
}

// A ring that slides along `curve`: its axis follows the tangent (parallel transport).
function ringPath(curve, s0, s1, exitLen) {
  const len = curve.getLength() * Math.abs(s1 - s0);
  const steps = Math.max(20, Math.ceil(len / 0.04));
  const poses = [];
  let prevT = curve.getTangentAt(s0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), prevT);
  for (let k = 0; k <= steps; k++) {
    const s = s0 + (s1 - s0) * k / steps;
    const t = curve.getTangentAt(Math.min(1, Math.max(0, s)));
    q.premultiply(new THREE.Quaternion().setFromUnitVectors(prevT, t)); prevT = t;
    poses.push({ p: curve.getPointAt(Math.min(1, Math.max(0, s))), q: q.clone() });
  }
  const last = poses[poses.length - 1], dir = curve.getTangentAt(s1 > s0 ? 1 : 0).multiplyScalar(s1 > s0 ? 1 : -1);
  const n = Math.ceil(exitLen / 0.04);
  for (let k = 1; k <= n; k++) poses.push({ p: last.p.clone().addScaledVector(dir, exitLen * k / n), q: last.q.clone() });
  return poses;
}
// Same relative motion, but the hook moves around a fixed ring at pose F.
function invertPath(path, F) {
  return path.map(({ p, q }) => {
    const qi = q.clone().invert();
    const pi = p.clone().applyQuaternion(qi).negate();
    return { p: F.p.clone().add(pi.applyQuaternion(F.q)), q: F.q.clone().multiply(qi) };
  });
}

// ---------- levels ----------
function buildLevels() {
  const L = [];
  const ringPiece = (R, r = 0.09) => ({ wires: [{ points: circle(R), closed: true, radius: r }], balls: [] });

  { // 1
    const pts = [[-2, -2.2, 0], [-2, -0.5, 0], [-1.8, 1.0, 0], [-0.9, 2.0, 0], [0.5, 2.2, 0], [1.6, 1.4, 0], [1.9, 0.2, 0]];
    const c = curveOf(pts, false);
    const path = ringPath(c, 0.16, 1, 1.6);
    L.push({ name: '갈고리', level: 1, diff: '쉬움', sep: 0.95,
      hint: '고리를 철사를 따라 끝까지 밀어 보세요. 굽은 곳에서는 고리를 살짝 돌려야 합니다.',
      fixed: { wires: [{ points: pts, closed: false, radius: 0.12 }], balls: [{ c: [1.9, 0.2, 0], r: 0.19 }], boxes: [{ c: [-2, -2.55, 0], h: [0.9, 0.3, 0.9] }] },
      moving: ringPiece(0.55), path });
  }
  { // 2
    const pts = [[0, -2.6, 0], [0, -1.4, 0], [1.2, -0.8, 0], [1.4, 0, 1.2], [0.2, 0.6, 1.6], [-1.2, 1.0, 0.6], [-1.4, 1.8, -0.8], [-0.2, 2.4, -1.4], [1.0, 2.6, -0.6]];
    const c = curveOf(pts, false);
    L.push({ name: '지그재그', level: 2, diff: '보통', sep: 0.9,
      hint: '꺾이는 방향이 매번 다릅니다. 시점을 돌려 다음 굽이가 어느 쪽으로 꺾이는지 먼저 보세요.',
      fixed: { wires: [{ points: pts, closed: false, radius: 0.12 }], balls: [{ c: [1.0, 2.6, -0.6], r: 0.19 }], boxes: [{ c: [0, -2.9, 0], h: [0.9, 0.3, 0.9] }] },
      moving: ringPiece(0.5), path: ringPath(c, 0.1, 1, 1.6) });
  }
  { // 3
    const pts = [[0, -2.4, 0], [0, -1.8, 0], ...helix({ start: [0, -1.5, 0], r: 1.1, pitch: 1.5, turns: 2.25 }).slice(0)];
    const tail = pts[pts.length - 1];
    pts.push([tail[0], tail[1] + 0.8, tail[2] + 0.2]);
    const c = curveOf(pts, false);
    L.push({ name: '스프링', level: 3, diff: '보통', sep: 0.9,
      hint: '나선을 따라 돌면서 올라가야 합니다. 회전 모드에서 두 손가락으로 비틀며 조금씩 밀어 보세요.',
      fixed: { wires: [{ points: pts, closed: false, radius: 0.12 }], balls: [{ c: pts[pts.length - 1], r: 0.19 }], boxes: [{ c: [0, -2.7, 0], h: [0.9, 0.3, 0.9] }] },
      moving: ringPiece(0.5), path: ringPath(c, 0.08, 1, 1.6) });
  }
  { // 4
    const pts = [[0.75, -2.6, 0], [0.55, -1.6, 0], [0.5, -0.6, 0.3], [1.4, 0.4, 0], [1.8, 1.6, -0.3], [0.9, 2.7, 0], [-0.9, 2.7, 0], [-1.8, 1.6, 0.3], [-1.4, 0.4, 0], [-0.5, -0.6, -0.3], [-0.55, -1.6, 0], [-0.75, -2.6, 0]];
    const c = curveOf(pts, false);
    L.push({ name: '좁은 목', level: 4, diff: '어려움', sep: 0.9,
      hint: '아래쪽 두 끝 사이가 출구입니다. 좁은 목에서는 고리를 철사와 수직으로 세워야 지나갑니다.',
      fixed: { wires: [{ points: pts, closed: false, radius: 0.12 }], balls: [{ c: pts[0], r: 0.19 }, { c: pts[pts.length - 1], r: 0.19 }], boxes: [] },
      moving: ringPiece(0.5), path: ringPath(c, 0.5, 0, 1.6) });
  }
  { // 5: the hook moves, the ring stays
    const handle = [[0, -2.6, 0], [0, -1.6, 0], [0, -0.6, 0]];
    const coil = helix({ start: [0, -0.2, 0], r: 1.0, pitch: 1.25, turns: 1.75 });
    const pts = [...handle, ...coil];
    const centre = V(0.5, 0.2, 0);
    const local = pts.map(p => [p[0] - centre.x, p[1] - centre.y, p[2] - centre.z]);
    const c = curveOf(local, false);
    const F = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    const path = invertPath(ringPath(c, 0.12, 1, 1.6), F);
    L.push({ name: '꼬리 갈고리', level: 5, diff: '어려움', sep: 0.85, theta: 1.45,
      hint: '이번에는 고리가 고정되고 은색 갈고리가 움직입니다. 나사를 풀듯 갈고리를 돌리면서 꼬리 끝으로 빼내세요.',
      fixed: { wires: [{ points: circle(0.55), closed: true, radius: 0.1 }], balls: [], boxes: [] },
      moving: { wires: [{ points: local, closed: false, radius: 0.1 }], balls: [{ c: [-centre.x, -3.1 - centre.y, -centre.z], r: 0.62 }] },
      path });
  }
  return L;
}

// ---------- physics ----------
function sampleWire(w) {
  const c = curveOf(w.points, w.closed);
  const n = Math.max(12, Math.ceil(c.getLength() / 0.14));
  const pts = c.getSpacedPoints(n);
  if (w.closed) pts.pop();
  return { curve: c, pts };
}
function addColliders(world, body, part, density) {
  const up = V(0, 1, 0), samples = [];
  for (const w of part.wires) {
    const { pts } = sampleWire(w);
    const n = w.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const d = b.clone().sub(a), len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(up, d.normalize());
      const m = a.clone().add(b).multiplyScalar(0.5);
      world.createCollider(RAPIER.ColliderDesc.capsule(len / 2, w.radius).setTranslation(m.x, m.y, m.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setDensity(density).setFriction(0.15).setRestitution(0), body);
    }
    for (const p of pts) samples.push(p);
  }
  for (const b of part.balls || []) {
    world.createCollider(RAPIER.ColliderDesc.ball(b.r).setTranslation(...b.c).setDensity(density * 0.2).setFriction(0.15), body);
    samples.push(V(...b.c));
  }
  for (const b of part.boxes || []) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(...b.h).setTranslation(...b.c).setFriction(0.15), body);
  }
  return samples;
}

class Sim {
  constructor(level) {
    this.level = level;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = DT;
    Object.assign(this.world.integrationParameters, { allowedLinearError: 0.0005, predictionDistance: 0.004, maxCcdSubsteps: 4 });
    const fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.fixedPts = addColliders(this.world, fixed, level.fixed, 1);
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setCanSleep(false));
    this.movingPts = addColliders(this.world, this.body, level.moving, 1);
    this.tp = new THREE.Vector3(); this.tq = new THREE.Quaternion();
    this.reset();
  }
  reset() { this.setPose(this.level.path[0].p, this.level.path[0].q); }
  setPose(p, q) {
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.tp.copy(p); this.tq.copy(q);
  }
  pos() { const t = this.body.translation(); return V(t.x, t.y, t.z); }
  rot() { const r = this.body.rotation(); return new THREE.Quaternion(r.x, r.y, r.z, r.w); }
  step() {
    const p = this.pos(), q = this.rot();
    const v = this.tp.clone().sub(p).divideScalar(TAU).clampLength(0, MAX_V);
    const dq = this.tq.clone().multiply(q.clone().invert());
    if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
    const s = Math.sqrt(Math.max(0, 1 - dq.w * dq.w)), angle = 2 * Math.acos(Math.min(1, dq.w));
    const w = s < 1e-6 ? V(0, 0, 0) : V(dq.x / s, dq.y / s, dq.z / s).multiplyScalar(angle / TAU).clampLength(0, MAX_W);
    const com = this.body.worldCom();
    v.add(w.clone().cross(V(com.x, com.y, com.z).sub(p)));
    this.body.setLinvel(v, true); this.body.setAngvel(w, true);
    this.world.step();
  }
  // Never let the target run away from a blocked piece.
  leash() {
    const p = this.pos(), q = this.rot();
    const d = this.tp.clone().sub(p);
    if (d.length() > LEASH) this.tp.copy(p).add(d.setLength(LEASH));
    const ang = q.angleTo(this.tq);
    if (ang > LEASH_ROT) this.tq.copy(q).slerp(this.tq, LEASH_ROT / ang);
  }
  lag() { return { d: this.tp.distanceTo(this.pos()), a: this.rot().angleTo(this.tq) }; }
  separation() {
    const p = this.pos(), q = this.rot();
    let best = Infinity;
    for (let i = 0; i < this.movingPts.length; i += 2) {
      const m = this.movingPts[i].clone().applyQuaternion(q).add(p);
      for (let j = 0; j < this.fixedPts.length; j += 2) {
        const d = m.distanceToSquared(this.fixedPts[j]);
        if (d < best) best = d;
      }
    }
    return Math.sqrt(best);
  }
  free() { this.world.free(); }
}

// Follow the designed solution with the real controller and contacts.
function verify(level) {
  const sim = new Sim(level);
  let maxLag = 0, worst = -1;
  level.path.forEach((pose, i) => {
    sim.tp.copy(pose.p); sim.tq.copy(pose.q);
    for (let k = 0; k < 40; k++) { sim.step(); const l = sim.lag(); if (l.d < 0.01 && l.a < 0.01) break; }
    const l = sim.lag(); const m = Math.max(l.d, l.a * 0.6);
    if (m > maxLag) { maxLag = m; worst = i; }
  });
  const sep = sim.separation();
  sim.free();
  return { ok: sep > level.sep && maxLag < 0.12, maxLag: +maxLag.toFixed(3), worstAt: +(worst / level.path.length).toFixed(2), sep: +sep.toFixed(2), poses: level.path.length };
}

// ---------- rendering & game ----------
function start() {
  const levels = buildLevels();
  window.__puzzle = { levels, verify: i => verify(levels[i]), verifyPath: (i, path) => verify(Object.assign({}, levels[i], { path })) };
  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
  };
  const best = store.get('wirePuzzleBest') || {};

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  $('stage').appendChild(renderer.domElement);
  const dom = renderer.domElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16191f);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2420, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 8, 6); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.9); rim.position.set(-6, 2, -5); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd6b278, metalness: 0.75, roughness: 0.3 });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.7, roughness: 0.25 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a36, metalness: 0, roughness: 0.75 });

  function partMesh(part, mat) {
    const g = new THREE.Group();
    for (const w of part.wires) {
      const c = curveOf(w.points, w.closed);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(c, Math.ceil(c.getLength() / 0.05), w.radius, 14, w.closed), mat));
    }
    for (const b of part.balls || []) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(b.r, 24, 16), b.r > 0.3 ? woodMat : mat); m.position.set(...b.c); g.add(m);
    }
    for (const b of part.boxes || []) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2), woodMat); m.position.set(...b.c); g.add(m);
    }
    return g;
  }

  let sim = null, idx = 0, fixedG = null, pieceG = null;
  let mode = 'move', solved = false, t0 = null, elapsed = 0, demo = null, watched = false, acc = 0;
  const orbit = { center: V(0, 0, 0), dist: 10, theta: 0.6, phi: 1.2 };

  function placeCamera() {
    const { center, dist, theta, phi } = orbit;
    camera.position.set(center.x + dist * Math.sin(phi) * Math.sin(theta), center.y + dist * Math.cos(phi), center.z + dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(center); camera.updateMatrixWorld();
  }
  function fit() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function load(i) {
    idx = i; const level = levels[i];
    if (sim) { sim.free(); scene.remove(fixedG, pieceG); for (const g of [fixedG, pieceG]) g.traverse(o => o.geometry?.dispose()); }
    sim = new Sim(level);
    fixedG = partMesh(level.fixed, goldMat); pieceG = partMesh(level.moving, silverMat);
    scene.add(fixedG, pieceG); sync();
    const box = new THREE.Box3().setFromObject(fixedG).expandByObject(pieceG);
    box.getCenter(orbit.center);
    const size = box.getSize(V(0, 0, 0)).length();
    orbit.dist = size / (2 * Math.tan(camera.fov * Math.PI / 360)) * (camera.aspect < 1 ? 1.25 / camera.aspect ** 0.5 : 0.95);
    orbit.theta = level.theta ?? 0.55; orbit.phi = 1.25; placeCamera();
    solved = false; t0 = null; elapsed = 0; demo = null; watched = false; acc = 0;
    $('title').textContent = `${level.level}. ${level.name}`;
    $('win').hidden = true; $('demoBar').hidden = true; $('hintBox').hidden = true;
    $('menu').hidden = true; $('game').hidden = false;
    setMode('move');
  }
  function sync() {
    pieceG.position.copy(sim.pos()); pieceG.quaternion.copy(sim.rot());
  }
  function setMode(m) {
    mode = m;
    for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    showStatus();
  }
  const modeText = {
    move: '한 손가락: 위아래·좌우로 옮기기 · 두 손가락 벌리기/모으기: 앞뒤로',
    rotate: '한 손가락: 굴리듯 돌리기 · 두 손가락 비틀기: 화면 방향으로 돌리기',
    view: '한 손가락: 시점 돌리기 · 두 손가락: 확대/축소'
  };
  let statusOverride = '';
  function showStatus() {
    $('status').textContent = demo ? '정답 동작을 보는 중입니다.' : watched ? '해설을 봤습니다. ↺ 를 눌러 직접 풀어 보세요.' : statusOverride || modeText[mode];
  }

  // ----- touch -----
  const pointers = new Map(); let pinch = null;
  const camAxis = i => V(0, 0, 0).setFromMatrixColumn(camera.matrixWorld, i).normalize();
  function worldPerPx() {
    const d = camera.position.distanceTo(sim.pos());
    return 2 * d * Math.tan(camera.fov * Math.PI / 360) / innerHeight;
  }
  function rotateTarget(axis, angle) {
    sim.tq.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
  }
  function begin() { if (!t0 && !demo && !watched) t0 = performance.now(); }
  function twoFinger() {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  dom.addEventListener('pointerdown', e => {
    if (demo || solved) return;
    dom.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinch = twoFinger();
    $('hintBox').hidden = true;
  });
  dom.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p || demo || solved) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      if (mode === 'view') {
        orbit.theta -= dx * 0.008; orbit.phi = Math.min(3.0, Math.max(0.15, orbit.phi - dy * 0.008)); placeCamera();
      } else if (mode === 'move') {
        begin(); const k = worldPerPx();
        sim.tp.addScaledVector(camAxis(0), dx * k).addScaledVector(camAxis(1), -dy * k);
      } else {
        begin(); rotateTarget(camAxis(1), dx * 0.009); rotateTarget(camAxis(0), dy * 0.009);
      }
    } else if (pointers.size === 2 && pinch) {
      const now = twoFinger();
      const dd = now.d - pinch.d; let da = now.ang - pinch.ang;
      if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      pinch = now;
      if (mode === 'view') { orbit.dist = Math.min(60, Math.max(3, orbit.dist * Math.exp(-dd * 0.004))); placeCamera(); }
      else {
        begin();
        rotateTarget(camAxis(2), -da);
        if (mode === 'move') sim.tp.addScaledVector(camAxis(2), -dd * worldPerPx() * 1.4);
      }
    }
  });
  const up = e => { pointers.delete(e.pointerId); pinch = pointers.size === 2 ? twoFinger() : null; };
  dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
  dom.addEventListener('contextmenu', e => e.preventDefault());
  // Desktop testing: wheel = depth in move mode, zoom in view mode
  dom.addEventListener('wheel', e => {
    e.preventDefault(); if (demo || solved) return;
    if (mode === 'move') { begin(); sim.tp.addScaledVector(camAxis(2), Math.sign(e.deltaY) * 0.12); }
    else if (mode === 'rotate') { begin(); rotateTarget(camAxis(2), Math.sign(e.deltaY) * 0.06); }
    else { orbit.dist = Math.min(60, Math.max(3, orbit.dist * Math.exp(e.deltaY * 0.001))); placeCamera(); }
  }, { passive: false });

  // ----- buttons -----
  for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => setMode(b.dataset.mode);
  $('reset').onclick = () => load(idx);
  $('hint').onclick = () => { $('hintBox').textContent = levels[idx].hint; $('hintBox').hidden = !$('hintBox').hidden; };
  $('back').onclick = showMenu;
  $('again').onclick = () => load(idx);
  $('next').onclick = () => idx + 1 < levels.length ? load(idx + 1) : showMenu();
  $('demo').onclick = () => { $('hintBox').hidden = true; sim.reset(); demo = { i: 0 }; watched = true; t0 = null; elapsed = 0; $('demoBar').hidden = false; };
  $('demoStop').onclick = () => load(idx);

  function showMenu() {
    $('game').hidden = true; $('win').hidden = true; $('menu').hidden = false;
    const list = $('levels'); list.innerHTML = '';
    levels.forEach((lv, i) => {
      const b = document.createElement('button'); b.className = 'lv';
      const t = best[lv.name];
      b.innerHTML = `<span class="no">${lv.level}</span><span class="nm">${lv.name}<small>${lv.diff}</small></span><span class="bt">${t ? '✓ ' + t.toFixed(1) + '초' : ''}</span>`;
      b.onclick = () => load(i); list.appendChild(b);
    });
  }

  addEventListener('resize', () => { fit(); placeCamera(); });
  fit(); showMenu(); $('loading').remove();

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!sim || $('game').hidden) { renderer.render(scene, camera); return; }
    if (demo) {
      demo.i += dt * 75;
      const path = levels[idx].path, i = Math.min(path.length - 1, Math.floor(demo.i));
      sim.setPose(path[i].p, path[i].q);
      if (i === path.length - 1) { demo = null; $('demoBar').hidden = true; }
    } else {
      acc += dt; let n = 0;
      while (acc >= DT && n < 6) { sim.step(); sim.leash(); acc -= DT; n++; }
      if (n === 6) acc = 0;
    }
    sync();
    const lag = sim.lag(), blocked = !demo && pointers.size > 0 && (lag.d > 0.2 || lag.a > 0.3);
    silverMat.emissive.setHex(blocked ? 0x3a1a14 : pointers.size ? 0x18263a : 0x000000);
    statusOverride = blocked ? '철사에 걸렸어요. 방향을 바꾸거나 돌려 보세요.' : '';
    showStatus();
    if (t0 && !solved && !demo) {
      elapsed = (now - t0) / 1000;
      if (sim.separation() > levels[idx].sep) {
        solved = true; pointers.clear();
        const name = levels[idx].name;
        if (!best[name] || elapsed < best[name]) { best[name] = elapsed; store.set('wirePuzzleBest', best); }
        $('wintime').textContent = `${elapsed.toFixed(1)}초 걸렸어요`;
        $('next').textContent = idx + 1 < levels.length ? '다음 단계 →' : '단계 목록';
        $('win').hidden = false;
      }
    }
    $('timer').textContent = `${elapsed.toFixed(1)}초`;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

RAPIER.init().then(start).catch(err => {
  const l = document.getElementById('loading');
  if (l) l.textContent = '퍼즐을 실행하지 못했습니다. 최신 Chrome이나 Safari에서 열어 주세요. (' + (err.message || err) + ')';
  console.error(err);
});
