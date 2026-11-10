// Running-video recording and in-browser pose analysis (MediaPipe Pose Landmarker, loaded on demand).
// If MediaPipe cannot load or finds no runner, the app falls back to simulated metrics.
import { runtime, sleep } from './util.js';

const MP_VER = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export function pickMime() {
  const c = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of c) { try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* ignore */ } }
  return '';
}

export async function openCamera(facing = 'environment') {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  runtime.streams.push(stream);
  return stream;
}

export function recordClip(stream, seconds, onTick) {
  return new Promise((resolve, reject) => {
    const mime = pickMime();
    let rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (e) { reject(e); return; }
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => resolve(new Blob(chunks, { type: mime || chunks[0]?.type || 'video/webm' }));
    rec.onerror = e => reject(e.error || e);
    rec.start(250);
    const t0 = performance.now();
    const iv = setInterval(() => {
      const el = (performance.now() - t0) / 1000;
      onTick && onTick(Math.min(seconds, el));
      if (el >= seconds) { clearInterval(iv); if (rec.state !== 'inactive') rec.stop(); }
    }, 100);
    runtime.timers.push(iv);
  });
}

let landmarkerPromise = null;
async function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import(/* @vite-ignore */ `${MP_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numPoses: 1 });
      try { return await vision.PoseLandmarker.createFromOptions(fileset, opts('GPU')); }
      catch (e) { return await vision.PoseLandmarker.createFromOptions(fileset, opts('CPU')); }
    })();
    landmarkerPromise.catch(() => { landmarkerPromise = null; });
  }
  return landmarkerPromise;
}

function seek(video, t) {
  return new Promise(res => {
    const done = () => { video.removeEventListener('seeked', done); res(); };
    video.addEventListener('seeked', done);
    video.currentTime = t;
    setTimeout(done, 1500);
  });
}

// Returns { metrics, frames } or throws if the pose model is unavailable / no runner detected.
export async function analyzeClip(url, onProgress) {
  const lm = await Promise.race([getLandmarker(), sleep(25000).then(() => { throw new Error('timeout'); })]);
  const v = document.createElement('video');
  v.src = url; v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(res, 4000); });
  let dur = v.duration;
  if (!isFinite(dur) || dur <= 0) { v.currentTime = 1e6; await sleep(400); dur = v.currentTime || 10; v.currentTime = 0; }
  dur = Math.min(dur, 15);
  const fps = 15, frames = [];
  let ts = 1;
  for (let t = 0; t < dur; t += 1 / fps) {
    await seek(v, t);
    const res = lm.detectForVideo(v, ts); ts += 1000 / fps;
    const p = res?.landmarks?.[0];
    if (p) frames.push({ t, p: p.map(q => ({ x: q.x, y: q.y, v: q.visibility ?? 1 })) });
    onProgress && onProgress(t / dur);
  }
  if (frames.length < fps * 2) throw new Error('no-runner');
  return { metrics: computeMetrics(frames, dur), frames };
}

function angle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
  const d = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / d))) * 180 / Math.PI;
}

function computeMetrics(frames, dur) {
  // steps: sign changes of the horizontal distance between the ankles
  let steps = 0, prev = 0;
  for (const f of frames) {
    const d = f.p[27].x - f.p[28].x;
    const s = Math.abs(d) < 0.01 ? prev : Math.sign(d);
    if (prev && s && s !== prev) steps++;
    if (s) prev = s;
  }
  const span = frames[frames.length - 1].t - frames[0].t || dur;
  let cadence = Math.round((steps / span) * 60);
  if (cadence < 120 || cadence > 210) cadence = Math.round(Math.max(150, Math.min(190, cadence || 168)));
  // contact frames: the ankle closest to the bottom of the frame at a local maximum of y
  const strikes = [], knees = [];
  for (let i = 1; i < frames.length - 1; i++) {
    for (const [ank, heel, toe, hip, knee] of [[27, 29, 31, 23, 25], [28, 30, 32, 24, 26]]) {
      const y0 = frames[i - 1].p[ank].y, y1 = frames[i].p[ank].y, y2 = frames[i + 1].p[ank].y;
      if (y1 >= y0 && y1 >= y2 && frames[i].p[ank].v > 0.5) {
        const f = frames[i].p;
        strikes.push(f[heel].y - f[toe].y);
        knees.push(angle(f[hip], f[knee], f[ank]));
      }
    }
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const sd = mean(strikes);
  const strike = sd > 0.008 ? 'Heel strike' : sd < -0.008 ? 'Forefoot strike' : 'Midfoot strike';
  const knee = Math.round(Math.max(140, Math.min(178, mean(knees) || 160)));
  const leans = frames.map(f => {
    const sh = { x: (f.p[11].x + f.p[12].x) / 2, y: (f.p[11].y + f.p[12].y) / 2 }, hp = { x: (f.p[23].x + f.p[24].x) / 2, y: (f.p[23].y + f.p[24].y) / 2 };
    return Math.abs(Math.atan2(sh.x - hp.x, hp.y - sh.y) * 180 / Math.PI);
  });
  const lean = Math.round(Math.max(1, Math.min(15, mean(leans))));
  const hipY = frames.map(f => (f.p[23].y + f.p[24].y) / 2);
  const legLen = mean(frames.map(f => Math.abs(f.p[23].y - f.p[27].y))) || 0.4;
  const osc = Math.round(Math.max(4, Math.min(14, ((Math.max(...hipY) - Math.min(...hipY)) / legLen) * 100 * 0.6)) * 10) / 10;
  return { cadence, strike, knee, lean, osc, pronation: null };
}

const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];
export function drawSkeleton(ctx, frames, t, w, h, videoW, videoH) {
  ctx.clearRect(0, 0, w, h);
  if (!frames || !frames.length) return;
  let best = frames[0];
  for (const f of frames) if (Math.abs(f.t - t) < Math.abs(best.t - t)) best = f;
  // object-fit: cover mapping
  const s = Math.max(w / videoW, h / videoH), ox = (w - videoW * s) / 2, oy = (h - videoH * s) / 2;
  const P = q => ({ x: ox + q.x * videoW * s, y: oy + q.y * videoH * s });
  ctx.lineWidth = 3; ctx.strokeStyle = '#d4ff00'; ctx.lineCap = 'round';
  for (const [a, b] of BONES) { const A = P(best.p[a]), B = P(best.p[b]); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
  ctx.fillStyle = '#fff';
  for (const i of [11, 12, 23, 24, 25, 26, 27, 28]) { const A = P(best.p[i]); ctx.beginPath(); ctx.arc(A.x, A.y, 4, 0, Math.PI * 2); ctx.fill(); }
}
