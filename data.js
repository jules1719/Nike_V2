// All "AI" logic of the prototype: deterministic, rule-based and seeded by the tester's nickname.
// Nothing here is a real biomechanical model. See CHANGELOG.md (real vs. simulated).
import { state, rng, seed, clamp, round, L } from './util.js';

export function paceSec(p) { const m = String(p || '').match(/^(\d{1,2}):(\d{2})$/); return m ? (+m[1]) * 60 + (+m[2]) : 345; }
export function fmtPace(sec) { sec = Math.round(sec); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

// Shoe-size conversion (approximate running-shoe chart, men's).
export const sizeConv = {
  toUS: eu => round((eu - 33.5) * 2) / 2,
  toUK: eu => round((eu - 34.5) * 2) / 2,
  fromUS: us => us + 33.5,
  fromUK: uk => uk + 34.5
};
export function sizeLabel(eu) { return `EU ${round(eu * 2) / 2} · US ${sizeConv.toUS(eu)} · UK ${sizeConv.toUK(eu)}`; }

function bmi() { const p = state.profile; return p.weight / Math.pow(p.height / 100, 2); }
function mainSurface() {
  const s = state.profile.surface;
  return Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
}

/* ---------- foot scan values ---------- */
export function scanValues() {
  const p = state.profile, o = state.overrides, r = rng(seed('scan'));
  const fromSize = p.shoeEU / 1.5 - 1.5;               // Paris point -> foot length (cm), minus toe allowance
  const fromHeight = p.height * 0.151;
  let base = 0.75 * fromSize + 0.25 * fromHeight;
  const lenR = o.lenR ?? round(base + (r() - 0.5) * 0.3, 1);
  const lenL = o.lenL ?? round(lenR - (0.1 + r() * 0.3) * (r() > 0.3 ? 1 : -1), 1);
  const wAdj = p.width === 'wide' ? 0.45 : p.width === 'narrow' ? -0.35 : 0;
  const ballW = round(lenR * 0.378 + wAdj + (r() - 0.5) * 0.2, 1);
  const ballWL = round(ballW - (r() * 0.2), 1);
  const heelW = round(ballW * 0.655, 1);
  const heelWL = round(ballWL * 0.655, 1);
  const archR = round(o.archMm ?? (17 + r() * 9), 0);        // mm
  const archL = round(archR - 1 + r() * 2, 0);
  const instep = round(6.2 + (lenR - 25) * 0.18 + (r() - 0.5) * 0.4, 1);
  const instepL = round(instep - 0.1 + r() * 0.2, 1);
  const archType = o.arch || (archR >= 23 ? 'High arch' : archR <= 15 ? 'Flat foot' : 'Normal arch');
  const pron = o.pronation || (archType === 'Flat foot' ? 'Overpronation' : archType === 'High arch' ? 'Supination' : (state.video.metrics?.pronation || 'Neutral'));
  const maxLen = Math.max(lenR, lenL);
  const eu = round(((maxLen + 1.5) * 1.5) * 2) / 2;
  return { lenR, lenL, ballW, ballWL, heelW, heelWL, archR, archL, instep, instepL, archType, pronation: pron, eu, quality: 95 + Math.floor(r() * 4) };
}

export function archLabel(a) { return { 'High arch': L('High arch', 'Hohes Gewölbe'), 'Normal arch': L('Normal arch', 'Normales Gewölbe'), 'Flat foot': L('Flat foot', 'Flaches Gewölbe') }[a] || a; }
export function pronLabel(a) { return { Neutral: L('Neutral', 'Neutral'), Overpronation: L('Overpronation', 'Überpronation'), Supination: L('Supination', 'Supination') }[a] || a; }
export function strikeLabel(a) { return { 'Heel strike': L('Heel strike', 'Fersenlauf'), 'Midfoot strike': L('Midfoot strike', 'Mittelfußlauf'), 'Forefoot strike': L('Forefoot strike', 'Vorfußlauf') }[a] || a; }

/* ---------- simulated running-app import ---------- */
export function generateActivities(source) {
  const p = state.profile, r = rng(seed('acts|' + source));
  const weeks = [];
  for (let w = 0; w < 12; w++) {
    const trend = 0.85 + (w / 11) * 0.2;
    weeks.push(round(p.weeklyKm * trend * (0.8 + r() * 0.35), 1));
  }
  const pace = paceSec(p.pace);
  const surf = p.surface;
  const surfaces = Object.keys(surf);
  const pickSurface = () => { let x = r() * 100; for (const s of surfaces) { x -= surf[s]; if (x <= 0) return s; } return 'road'; };
  const runs = [];
  const day = new Date();
  const perRun = p.weeklyKm / Math.max(1, p.runsPerWeek);
  for (let i = 0; i < 6; i++) {
    day.setDate(day.getDate() - (1 + Math.floor(r() * 3)));
    const s = pickSurface();
    const long = i === 2;
    const dist = round(long ? Math.min(p.longestRun, perRun * 1.8) : perRun * (0.7 + r() * 0.5), 1);
    const pc = pace + (long ? 20 : 0) + (s === 'trail' ? 35 : 0) + Math.round((r() - 0.5) * 30);
    const elev = Math.round(dist * (s === 'trail' ? 28 + r() * 30 : 4 + r() * 8));
    runs.push({ date: day.toISOString().slice(0, 10), dist, pace: fmtPace(pc), elev, surface: s });
  }
  const count = p.runsPerWeek * 26 + Math.floor(r() * 12);
  const avgPace = fmtPace(pace + Math.round((r() - 0.5) * 12));
  return { source, weeks, runs, count, avgPace, totalKm: round(weeks.reduce((a, b) => a + b, 0), 0), surface: { ...surf } };
}

/* ---------- simulated running metrics (fallback when no real pose analysis) ---------- */
export function simulatedRunMetrics() {
  const p = state.profile, r = rng(seed('gait'));
  const pace = paceSec(p.pace);
  const cadence = Math.round(clamp(158 + (360 - pace) * 0.12 + (r() - 0.5) * 8, 150, 188));
  const strike = pace <= 285 ? (r() > 0.4 ? 'Midfoot strike' : 'Forefoot strike') : (r() > 0.25 ? 'Heel strike' : 'Midfoot strike');
  const knee = Math.round(158 + (r() - 0.5) * 12);
  const lean = Math.round(4 + r() * 6);
  const osc = round(7 + (r() - 0.5) * 3, 1);
  return { cadence, strike, knee, lean, osc, pronation: null };
}

export function runMetrics() {
  const m = state.video.metrics || simulatedRunMetrics();
  const o = state.overrides;
  return { ...m, strike: o.strike || m.strike, cadence: o.cadence ? +o.cadence : m.cadence };
}

/* ---------- AI fit analysis ---------- */
export function analysis() {
  const p = state.profile, sc = scanValues(), rm = runMetrics();
  const b = bmi();
  const weekly = p.weeklyKm;   // v2: import writes into the profile, and the runner can still edit it
  const surface = mainSurface();
  const pref = (p.cushion - 50) / 50;             // -1 soft-lover ... +1 firm-lover
  const comfort = p.comfort || [];
  let heel = 55, mid = 50, fore = 48;
  const why = [];
  if (rm.strike === 'Heel strike') { heel += 14; why.push({ t: L('Extra heel cushioning', 'Mehr Dämpfung an der Ferse'), d: L(`Your running video shows a heel strike at a ${fmtPace(paceSec(p.pace))} min/km pace, so the heel takes the first impact.`, `Dein Laufvideo zeigt einen Fersenlauf bei ${fmtPace(paceSec(p.pace))} min/km, die Ferse nimmt also den ersten Aufprall.`) }); }
  if (rm.strike === 'Forefoot strike') { fore += 14; heel -= 6; why.push({ t: L('Responsive forefoot', 'Reaktiver Vorfuß'), d: L('You land on the forefoot, so we moved cushioning and rebound to the front.', 'Du landest auf dem Vorfuß, deshalb liegt Dämpfung und Rückstellkraft vorne.') }); }
  if (rm.strike === 'Midfoot strike') { mid += 6; why.push({ t: L('Balanced midsole', 'Ausgewogene Zwischensohle'), d: L('A midfoot strike spreads the load, so cushioning is evenly distributed.', 'Ein Mittelfußlauf verteilt die Last, die Dämpfung ist daher gleichmäßig verteilt.') }); }
  if (b > 25) { heel += 6; mid += 4; fore += 4; why.push({ t: L('Denser lattice for your body weight', 'Dichteres Gitter für dein Körpergewicht'), d: L(`At ${p.weight} kg the printed lattice uses denser cells so it does not bottom out.`, `Bei ${p.weight} kg nutzt das gedruckte Gitter dichtere Zellen, damit es nicht durchschlägt.`) }); }
  if (weekly >= 40) { heel += 5; mid += 3; why.push({ t: L('Durability for high mileage', 'Haltbarkeit für viele Kilometer'), d: L(`You run about ${Math.round(weekly)} km per week, so we chose a more durable foam density.`, `Du läufst etwa ${Math.round(weekly)} km pro Woche, daher eine haltbarere Schaumdichte.`) }); }
  if (sc.archType === 'Flat foot' || sc.pronation === 'Overpronation') { mid += 12; why.push({ t: L('Medial arch support', 'Stütze am inneren Gewölbe'), d: L(`Your scan shows a ${sc.archR} mm arch height and ${pronLabel(sc.pronation).toLowerCase()}, so the inner midfoot is printed firmer.`, `Dein Scan zeigt ${sc.archR} mm Gewölbehöhe und ${pronLabel(sc.pronation)}, deshalb ist der innere Mittelfuß fester gedruckt.`) }); }
  if (sc.archType === 'High arch') { mid += 4; heel += 4; why.push({ t: L('Arch contact for a high arch', 'Gewölbekontakt bei hohem Gewölbe'), d: L(`Your arch height is ${sc.archR} mm. We raise the midsole under the arch so your foot is supported along its full length.`, `Deine Gewölbehöhe beträgt ${sc.archR} mm. Wir heben die Sohle unter dem Gewölbe an, damit der Fuß über die ganze Länge aufliegt.`) }); }
  if (comfort.includes('heel')) { heel += 6; why.push({ t: L('Softer heel pocket', 'Weichere Fersenzone'), d: L('You marked the heel as uncomfortable in your current shoes.', 'Du hast die Ferse in deinen aktuellen Schuhen als unangenehm markiert.') }); }
  if (comfort.includes('toes')) { why.push({ t: L('Wider toe box', 'Breitere Zehenbox'), d: L(`You marked your toes, and your ball width is ${sc.ballW} cm. The upper gets ${p.width === 'wide' ? '4' : '2'} mm more room at the front.`, `Du hast die Zehen markiert, und deine Ballenbreite beträgt ${sc.ballW} cm. Das Obermaterial bekommt vorne ${p.width === 'wide' ? '4' : '2'} mm mehr Platz.`) }); }
  if (comfort.includes('knee') || comfort.includes('shin')) { heel += 4; why.push({ t: L('Smoother landing', 'Sanftere Landung'), d: L('You marked knee or shin. A smoother heel-to-toe transition reduces how abrupt each landing feels.', 'Du hast Knie oder Schienbein markiert. Ein weicherer Übergang von Ferse zu Zehen macht die Landung weniger abrupt.') }); }
  heel -= pref * 10; mid -= pref * 8; fore -= pref * 8;
  const outsole = { trail: L('Lugged rubber, 4 mm grip', 'Profilgummi, 4 mm Grip'), track: L('Light rubber, fast', 'Leichtes Gummi, schnell'), treadmill: L('Thin rubber, light', 'Dünnes Gummi, leicht'), road: L('Rubber waffle tread', 'Gummi mit Waffelprofil') }[surface];
  why.push({ t: L('Outsole for your surface', 'Laufsohle für deinen Untergrund'), d: L(`Most of your running is on ${surfaceLabel(surface).toLowerCase()} (${p.surface[surface]} %).`, `Du läufst überwiegend auf ${surfaceLabel(surface)} (${p.surface[surface]} %).`) });
  let drop = rm.strike === 'Heel strike' ? 10 : rm.strike === 'Forefoot strike' ? 6 : 8;
  if (p.drop !== 'auto') drop = +p.drop;
  const sources = 1 + (state.imported ? 1 : 0) + (state.video.mode === 'pose' ? 2 : state.video.mode === 'simulated' ? 1 : 0) + (state.scan.done ? 2 : 0) + (comfort.length ? 1 : 0) + (state.scan.insole ? 1 : 0);
  const confidence = clamp(68 + sources * 4, 70, 97);
  const zones = { heel: Math.round(clamp(heel, 20, 95)), mid: Math.round(clamp(mid, 20, 95)), fore: Math.round(clamp(fore, 20, 95)), toes: Math.round(clamp(fore - 12, 15, 90)) };
  return { zones, drop, outsole, surface, confidence, why, scan: sc, run: rm, weekly: Math.round(weekly) };
}

export function surfaceLabel(s) { return { road: L('Road', 'Asphalt'), trail: L('Trail', 'Trail'), track: L('Track', 'Bahn'), treadmill: L('Treadmill', 'Laufband') }[s] || s; }

/* ---------- use cases ---------- */
export const USECASES = [
  { id: 'daily', en: 'Daily runs', de: 'Tägliche Läufe', hard: 'medium', delta: 0 },
  { id: 'long', en: 'Long runs', de: 'Lange Läufe', hard: 'soft', delta: 8 },
  { id: 'race', en: 'Race day', de: 'Wettkampf', hard: 'firm', delta: -10 },
  { id: 'trail', en: 'Trail', de: 'Trail', hard: 'firm', delta: -4 },
  { id: 'gym', en: 'Gym & treadmill', de: 'Gym & Laufband', hard: 'medium', delta: -6 }
];
const HARD_OFFSET = { soft: 10, medium: 0, firm: -12 };

export function recommendedZones(hardness) {
  const a = analysis(); const uc = USECASES.find(u => u.id === state.usecase) || USECASES[0];
  const off = HARD_OFFSET[hardness ?? uc.hard] + uc.delta * 0.5;
  const z = {};
  for (const k of Object.keys(a.zones)) z[k] = Math.round(clamp(a.zones[k] + off, 10, 98));
  return z;
}

export function comfortScore() {
  const a = analysis(); const d = state.design; const rec = recommendedZones(d.hardness);
  const z = d.zones || rec;
  let dev = 0; for (const k of Object.keys(rec)) dev += Math.abs((z[k] ?? rec[k]) - rec[k]);
  let s = 86 + (a.confidence - 80) * 0.45 - dev * 0.18;
  if (d.texture === 'Knit') s += 1;
  if (d.lacing === 'speed') s += 0.5;
  return Math.round(clamp(s, 55, 99));
}

export function price() {
  const d = state.design; let p = 229; const items = [[L('Custom running shoe', 'Individueller Laufschuh'), 229]];
  if (d.engraving) { p += 15; items.push([L('Sole engraving', 'Sohlengravur'), 15]); }
  if (d.lacing === 'speed') { p += 12; items.push([L('Speed lacing', 'Schnellschnürung'), 12]); }
  if (d.lacing === 'elastic') { p += 8; items.push([L('Elastic laces', 'Elastische Schnürsenkel'), 8]); }
  if (d.texture === 'Mesh') { p += 0; }
  return { total: p, items };
}

export function addBusinessDays(n, from = new Date()) {
  const d = new Date(from); let added = 0;
  while (added < n) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) added++; }
  return d;
}
export function fmtDate(d) { return d.toLocaleDateString(state.lang === 'de' ? 'de-AT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }

export const COLORS = [
  { id: 'black', en: 'Black / Volt', de: 'Schwarz / Volt', accent: '#d4ff00', filter: 'none' },
  { id: 'orange', en: 'Black / Team Orange', de: 'Schwarz / Orange', accent: '#ff5a1f', filter: 'hue-rotate(-52deg) saturate(1.6)' },
  { id: 'blue', en: 'Black / Racer Blue', de: 'Schwarz / Blau', accent: '#3b74ff', filter: 'hue-rotate(152deg) saturate(1.5)' },
  { id: 'pink', en: 'Black / Hyper Pink', de: 'Schwarz / Pink', accent: '#ff3fa4', filter: 'hue-rotate(-102deg) saturate(1.6)' },
  { id: 'aqua', en: 'Black / Aqua', de: 'Schwarz / Aqua', accent: '#19e3c8', filter: 'hue-rotate(102deg) saturate(1.3)' },
  { id: 'stealth', en: 'Stealth Grey', de: 'Stealth Grau', accent: '#a6a6ad', filter: 'grayscale(1) brightness(1.05)' }
];
export function colorObj() { return COLORS.find(c => c.id === state.design.color) || COLORS[0]; }

// Demo profile for the facilitator.
export function demoProfile() {
  return { ageRange: '25-34', weight: 74, height: 180, shoeEU: 43, sizeSys: 'EU', width: 'normal', runsPerWeek: 4, weeklyKm: 38, longestRun: 21, pace: '5:20', goal: 'half', goalDate: '', surface: { road: 70, trail: 15, track: 5, treadmill: 10 }, cushion: 40, drop: 'auto', currentShoe: 'Road trainer', currentShoeKm: 650, comfort: ['heel', 'knee'] };
}
