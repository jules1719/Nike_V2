// Procedural 3D foot model (no external model file needed) and the interactive viewer.
// Units: 1 scene unit = 1 cm. x = heel -> toe, y = up, z = lateral (+) / medial (-) for a right foot.
import * as THREE from './three.module.min.js';

function interp(table, t) {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [t1, v1] = table[i];
    if (t <= t1) {
      const [t0, v0] = table[i - 1];
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return table[table.length - 1][1];
}

export const WIDTH_TABLE = [[0, 0.02], [0.015, 0.36], [0.05, 0.56], [0.14, 0.655], [0.3, 0.61], [0.45, 0.67], [0.62, 0.88], [0.72, 1.0], [0.82, 0.97], [0.9, 0.84], [0.96, 0.6], [0.99, 0.3], [1, 0.02]];

function pressureColor(v) {
  // 0 = no contact (dark green), 0.5 = volt, 1 = hot red
  const a = new THREE.Color('#16210a'), b = new THREE.Color('#d4ff00'), c = new THREE.Color('#ff3b1f');
  return v < 0.5 ? a.clone().lerp(b, v * 2) : b.clone().lerp(c, (v - 0.5) * 2);
}

export function buildFootGeometry(spec, mirror = false) {
  const { len, ballW, heelW, archMm, instep, archType } = spec;
  const N = 120, M = 56;
  const heelScale = (heelW / ballW) / 0.655;
  const topTable = [[0, 0.7], [0.03, 3.0], [0.1, 4.9], [0.22, instep - 0.2], [0.36, instep], [0.5, instep * 0.82], [0.64, 3.9], [0.78, 2.9], [0.9, 2.25], [0.97, 1.55], [1, 0.7]];
  const bottomTable = [[0, 0.7], [0.04, 0.12], [0.18, 0], [0.82, 0], [0.95, 0.12], [1, 0.55]];
  const archPeak = archMm / 10;
  const flat = archType === 'Flat foot';
  const pos = [], col = [], idx = [];
  // precompute profiles and smooth them so the shading has no bands
  const HW = [], TOP = [], YB = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let hw = interp(WIDTH_TABLE, t) * ballW / 2;
    if (t < 0.32) hw *= 1 + (heelScale - 1) * (1 - t / 0.32);
    HW.push(hw); TOP.push(interp(topTable, t)); YB.push(interp(bottomTable, t));
  }
  const smooth = arr => { for (let pass = 0; pass < 4; pass++) { const c = arr.slice(); for (let i = 2; i < arr.length - 2; i++) arr[i] = (c[i - 2] + 2 * c[i - 1] + 3 * c[i] + 2 * c[i + 1] + c[i + 2]) / 9; } };
  smooth(HW); smooth(TOP); smooth(YB);
  const toeZ = [-0.62, -0.18, 0.12, 0.38, 0.6];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = t * len;
    const hw = HW[i];
    const zc = -0.06 * ballW * Math.max(0, (t - 0.55) / 0.45);         // toes drift slightly medial
    const top = TOP[i], yb = YB[i];
    const y0 = yb + 0.45;
    const archBump = Math.exp(-Math.pow((t - 0.47) / 0.13, 2)) * archPeak;
    for (let j = 0; j < M; j++) {
      const th = (j / M) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const z = hw * Math.sign(c) * Math.pow(Math.abs(c), 0.62) + zc;
      let y;
      if (s >= 0) {
        y = y0 + (top - y0) * Math.pow(Math.abs(s), 0.78);
        if (t > 0.8) {   // individual toes as gentle ridges on the top surface
          const zn = (z - zc) / hw;
          let ridge = 0; for (const tz of toeZ) ridge += Math.exp(-Math.pow((zn - tz) / 0.11, 2));
          y += ridge * 0.32 * Math.min(1, (t - 0.8) / 0.08) * Math.pow(Math.abs(s), 0.5);
        }
      }
      else {
        y = y0 - 0.45 * Math.pow(Math.abs(s), 0.5);
        const medial = Math.max(0, Math.min(1, (-(z - zc) / hw + 0.2) / 1.0));   // medial side z < 0
        y += archBump * Math.pow(medial, 1.4) * (flat ? 0.25 : 1);
      }
      pos.push(x, y, mirror ? -z : z);
      // pressure only on the sole
      let pv = 0;
      if (s < 0) {
        const medialness = -(z - zc) / hw;               // -1 lateral ... +1 medial
        const heelP = Math.exp(-Math.pow((t - 0.11) / 0.09, 2)) * 0.95;
        const ballP = Math.exp(-Math.pow((t - 0.74) / 0.08, 2)) * (0.75 + 0.2 * Math.max(0, medialness));
        const toeP = Math.exp(-Math.pow((t - 0.94) / 0.035, 2)) * 0.55 * (medialness > 0.2 ? 1 : 0.6);
        const midP = Math.exp(-Math.pow((t - 0.47) / 0.14, 2)) * (flat ? 0.6 : archType === 'High arch' ? 0.08 : 0.3) * (medialness < 0 ? 1 : (flat ? 0.9 : 0.25));
        pv = Math.min(1, (heelP + ballP + toeP + midP) * Math.pow(Math.abs(s), 0.3));
      }
      const cc = s < 0 ? pressureColor(pv) : new THREE.Color('#2a3314');
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + (j + 1) % M, c = (i + 1) * M + j, d = (i + 1) * M + (j + 1) % M;
      if (mirror) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function toeSpheres(spec, mirror) {
  const { len, ballW } = spec;
  const toes = [
    { t: 0.965, z: -0.30, r: 1.15, y: 1.05 },
    { t: 0.94, z: -0.06, r: 0.82, y: 1.0 },
    { t: 0.915, z: 0.13, r: 0.76, y: 0.95 },
    { t: 0.885, z: 0.29, r: 0.7, y: 0.9 },
    { t: 0.85, z: 0.42, r: 0.62, y: 0.85 }
  ];
  return toes.map(o => ({ x: o.t * len, y: o.y, z: (mirror ? -1 : 1) * o.z * ballW * 0.95 - (mirror ? -1 : 1) * 0.06 * ballW * 0.8, r: o.r }));
}

export async function createViewer(container, feet, opts = {}) {
  const lite = !!opts.lite;
  const renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 600);
  let dist = 66, elev = 0.62;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1d2a08, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(25, 40, 30); scene.add(key);
  const rim = new THREE.DirectionalLight(0xd4ff00, 0.55); rim.position.set(-30, 18, -30); scene.add(rim);
  const grid = new THREE.GridHelper(90, 36, 0x4a5e14, 0x1a2308); grid.position.y = -0.6; scene.add(grid);

  const group = new THREE.Group(); scene.add(group);
  const flip = new THREE.Group(); group.add(flip);
  const holder = new THREE.Group(); holder.rotation.y = Math.PI / 2; flip.add(holder);
  let flipTarget = 0;

  const solidMat = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 1 });
  const pressureMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, transparent: true, opacity: 1 });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xd4ff00, wireframe: true, transparent: true, opacity: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0c0f06, roughness: 1, transparent: true, opacity: 1 });

  const meshes = [];
  const pointSources = [];
  let maxLen = 0;
  feet.forEach((spec, k) => {
    const mirror = spec.side === 'left';
    const geo = buildFootGeometry(spec, mirror);
    const mesh = new THREE.Mesh(geo, solidMat);
    const sideOffset = (spec.ballW * 0.62 + 1.6) * (mirror ? -1 : 1);
    mesh.position.set(-spec.len / 2, 0, sideOffset);
    holder.add(mesh); meshes.push(mesh);
    pointSources.push({ geo, offset: new THREE.Vector3(-spec.len / 2, 0, sideOffset) });
    maxLen = Math.max(maxLen, spec.len);
  });

  let mode = 'solid';
  function setMode(m) {
    mode = m;
    meshes.forEach(me => {
      const isToe = me.geometry.type === 'SphereGeometry';
      if (m === 'solid') me.material = solidMat;
      else if (m === 'mesh') me.material = isToe ? wireMat : wireMat;
      else me.material = isToe ? darkMat : pressureMat;
    });
    flipTarget = m === 'pressure' ? 1 : 0;
  }
  let elevTarget = elev;

  // point cloud for reconstruction
  let points = null, pointTargets = null, pointStarts = null;
  function buildPoints(count) {
    const tgt = [];
    pointSources.forEach(ps => {
      const p = ps.geo.getAttribute('position');
      for (let i = 0; i < p.count; i += 1) tgt.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).add(ps.offset));
    });
    const n = Math.min(count, tgt.length);
    const arr = new Float32Array(n * 3), cols = new Float32Array(n * 3);
    pointTargets = []; pointStarts = [];
    for (let i = 0; i < n; i++) {
      const v = tgt[Math.floor(Math.random() * tgt.length)].clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
      pointTargets.push(v);
      const s = new THREE.Vector3((Math.random() - 0.5) * 70, Math.random() * 30, (Math.random() - 0.5) * 50);
      pointStarts.push(s);
      arr.set([s.x, s.y, s.z], i * 3);
      const b = 0.45 + Math.min(0.55, v.y / 8);
      cols.set([0.83 * b, 1.0 * b, 0], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    points = new THREE.Points(g, new THREE.PointsMaterial({ size: lite ? 0.45 : 0.32, vertexColors: true, transparent: true, opacity: 1, depthWrite: false }));
    holder.add(points);
  }

  // interaction
  let rotY = -0.5, rotX = 0, autoRotate = true, dragging = null;
  const pointers = new Map(); let pinch0 = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); autoRotate = false; dragging = { x: e.clientX, y: e.clientY }; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), dist }; } });
  el.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch0) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); dist = Math.max(32, Math.min(110, pinch0.dist * pinch0.d / d)); return; }
    if (dragging) { rotY += (e.clientX - dragging.x) * 0.01; rotX = Math.max(-0.6, Math.min(0.9, rotX + (e.clientY - dragging.y) * 0.006)); dragging = { x: e.clientX, y: e.clientY }; }
  });
  const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = null; if (!pointers.size) dragging = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => { e.preventDefault(); dist = Math.max(32, Math.min(110, dist + e.deltaY * 0.04)); autoRotate = false; }, { passive: false });

  function resize() {
    const w = container.clientWidth || 300, h = container.clientHeight || 270;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  let anim = null, alive = true, rafId = 0;
  function frame(now) {
    if (!alive) return;
    if (autoRotate) rotY += 0.004;
    elev += (elevTarget - elev) * 0.08;
    flip.rotation.z += (flipTarget * Math.PI - flip.rotation.z) * 0.08;
    flip.position.y += (flipTarget * 7.5 - flip.position.y) * 0.08;
    group.rotation.y = rotY; group.rotation.x = rotX;
    camera.position.set(0, Math.sin(elev) * dist + 2, Math.cos(elev) * dist);
    camera.lookAt(0, 2.5, 0);
    if (anim) anim(now);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  function reconstruct(onStatus, duration = 6500) {
    return new Promise(resolve => {
      buildPoints(lite ? 2500 : 7000);
      meshes.forEach(m => { m.visible = false; });
      solidMat.opacity = 0; wireMat.opacity = 0;
      const start = performance.now(); let stage = -1;
      const labels = opts.labels || ['Reconstructing surface…', 'Smoothing mesh…', 'Detecting landmarks…'];
      anim = now => {
        const t = Math.min(1, (now - start) / duration);
        const st = t < 0.38 ? 0 : t < 0.72 ? 1 : 2;
        if (st !== stage) { stage = st; onStatus && onStatus(labels[st], st); }
        const u = Math.min(1, t / 0.55), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const arr = points.geometry.attributes.position.array;
        for (let i = 0; i < pointTargets.length; i++) {
          const a = pointStarts[i], b = pointTargets[i];
          arr[i * 3] = a.x + (b.x - a.x) * e; arr[i * 3 + 1] = a.y + (b.y - a.y) * e; arr[i * 3 + 2] = a.z + (b.z - a.z) * e;
        }
        points.geometry.attributes.position.needsUpdate = true;
        if (t > 0.45) { meshes.forEach(m => { m.visible = true; }); wireMat.opacity = Math.min(0.55, (t - 0.45) * 2.2); }
        if (t > 0.7) { solidMat.opacity = Math.min(1, (t - 0.7) / 0.25); points.material.opacity = Math.max(0, 1 - (t - 0.7) / 0.25); }
        if (t >= 1) {
          anim = null; holder.remove(points); points.geometry.dispose(); points = null;
          solidMat.opacity = 1; wireMat.opacity = 0.55; setMode(mode); resolve();
        }
      };
    });
  }

  return {
    setMode, reconstruct,
    snapshot: () => renderer.domElement.toDataURL('image/png'),
    dispose() { alive = false; cancelAnimationFrame(rafId); ro.disconnect(); renderer.dispose(); el.remove(); }
  };
}

export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
