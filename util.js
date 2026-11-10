// Shared state, storage, language, seeded random numbers and small helpers.
const KEY = 'nsf_state_v2';

export function defaults() {
  return {
    lang: 'en',
    consent: false,
    nickname: '',
    screen: 'landing',
    history: [],
    profile: {
      ageRange: '25-34', weight: 72, height: 178, shoeEU: 42, sizeSys: 'EU', width: 'normal',
      runsPerWeek: 3, weeklyKm: 25, longestRun: 15, pace: '5:45', goal: '10k', goalDate: '',
      surface: { road: 60, trail: 20, track: 5, treadmill: 15 },
      cushion: 50, drop: 'auto', currentShoe: '', currentShoeKm: 400, comfort: [], age: '25-34'
    },
    imported: null,          // { source, activities, weeks, runs, avgPace, surface }
    video: { status: 'none', mode: null, metrics: null },   // mode: 'pose' | 'simulated'
    device: { camera: null, motion: null, webgl: null, lite: false },
    scan: { right: false, left: false, insole: false, done: false, skippedInsole: false },
    analysisSeen: false,
    flags: { profile: false, design: false },
    fitShown: 20,
    usecase: null,
    design: { mode: null, color: 'black', texture: 'Knit', hardness: 'medium', zones: null, lacing: 'standard', engraving: '', layer: 'Cushioning', touched: false },
    shipping: { name: '', city: '' },
    order: null,
    review: { approved: false, questions: [] },
    tracker: { start: 0 },
    overrides: {},           // facilitator overrides, e.g. { arch: 'Flat foot', strike: 'Heel strike', lenR: 26.4 }
    facilitator: { scanSource: 'camera', showTimer: false },
    survey: { submitted: false },
    ar: { x: 0, y: 0, s: 1, r: -8, f: 1 },
    log: [],
    stepEnter: 0
  };
}

function merge(base, saved) {
  for (const k of Object.keys(saved || {})) {
    if (saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], saved[k]);
    else base[k] = saved[k];
  }
  return base;
}

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return merge(defaults(), JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  return defaults();
}

export const state = load();

// Things that never go into storage: object URLs, camera streams, pose landmarks.
export const runtime = { videoURL: null, poseFrames: null, arPhoto: null, streams: [], timers: [], raf: [] };

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

export function resetAll(keepLang = true) {
  const lang = state.lang;
  const fresh = defaults();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh);
  if (keepLang) state.lang = lang;
  if (runtime.videoURL) URL.revokeObjectURL(runtime.videoURL);
  runtime.videoURL = null; runtime.poseFrames = null; runtime.arPhoto = null;
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  save();
}

export function L(en, de) { return state.lang === 'de' ? de : en; }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Seeded random numbers so every tester gets consistent "personal" values.
export function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
export function rng(seedStr) {
  let a = hashStr(seedStr || 'runner')();
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seed(extra) { return (state.nickname || 'runner').toLowerCase().trim() + '|' + extra; }

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function round(v, d = 0) { const p = Math.pow(10, d); return Math.round(v * p) / p; }
export function fmt(v, d = 1) { return Number(v).toLocaleString(state.lang === 'de' ? 'de-AT' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }); }

export function logEvent(type, data = {}) {
  state.log.push({ t: Date.now(), type, ...data });
  if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
  save();
}

export function stopStreams() {
  for (const s of runtime.streams) { try { s.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ } }
  runtime.streams = [];
  for (const t of runtime.timers) clearInterval(t), clearTimeout(t);
  runtime.timers = [];
  for (const r of runtime.raf) cancelAnimationFrame(r);
  runtime.raf = [];
}

export function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

let audioCtx = null;
export function beep(freq = 880, ms = 90, vol = 0.06) {
  try {
    if (state.muted) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; o.type = 'sine'; g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
    o.stop(audioCtx.currentTime + ms / 1000 + 0.02);
  } catch (e) { /* ignore */ }
}

export function toast(msg, ms = 2400) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, ms);
}

export function download(dataUrlOrBlob, name) {
  const a = document.createElement('a');
  a.href = typeof dataUrlOrBlob === 'string' ? dataUrlOrBlob : URL.createObjectURL(dataUrlOrBlob);
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

export const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
