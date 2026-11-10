// Nike Shoe Fit v2 — student test prototype.
// v2 changes (professor feedback): landing page with story and benefit, labelled 6-step progress,
// short "step done" slides with a growing fit accuracy, one question per screen with tap options.
import { state, runtime, save, resetAll, L, esc, rng, seed, clamp, round, fmt, logEvent, stopStreams, vibrate, beep, toast, download, reducedMotion, sleep } from './util.js';
import { paceSec, fmtPace, sizeConv, sizeLabel, scanValues, archLabel, pronLabel, strikeLabel, generateActivities, simulatedRunMetrics, runMetrics, analysis, surfaceLabel, USECASES, recommendedZones, comfortScore, price, addBusinessDays, fmtDate, COLORS, colorObj, demoProfile } from './data.js';
import { shoePhoto, footPath, measureSVG, pressureFoot, bodyMap, zoneLabel, barChart, soleSVG, hardnessLegend, drawLattice } from './ui.js';

const app = document.getElementById('app');
const bar = document.getElementById('appbar');
const overlayRoot = document.getElementById('overlay-root');

/* ===================== flow ===================== */
// One token per screen. "doneN" are the short interstitial slides after each of the 6 steps.
const FLOW = ['landing',
  'p_body', 'p_size', 'p_import', 'p_data', 'p_train', 'p_pace', 'p_surface', 'p_comfort', 'done1',
  'v_intro', 'video', 'done2',
  's_prep', 'scan', 'done3',
  'analysis', 'done4',
  'd_usecase', 'd_mode', 'd_zones', 'd_style', 'done5',
  'checkout', 'review', 'done6',
  'confirm', 'survey', 'thanks'];
const PH = {};
FLOW.forEach(t => { PH[t] = t.startsWith('p_') || t === 'done1' ? 1 : ['v_intro', 'video', 'done2'].includes(t) ? 2 : ['s_prep', 'scan', 'done3'].includes(t) ? 3 : ['analysis', 'done4'].includes(t) ? 4 : t.startsWith('d_') || t === 'done5' ? 5 : ['checkout', 'review', 'done6'].includes(t) ? 6 : 0; });
PH.ar = 5;
const STEPS = () => [
  { n: L('Profile', 'Profil'), t: 2, icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>' },
  { n: L('Run', 'Laufen'), t: 2, icon: '<circle cx="14" cy="4.5" r="2"/><path d="M8 21l3-6 3 2v4M5 12l3-3.5h5l3 4 3.5 1"/>' },
  { n: L('Scan', 'Scan'), t: 3, icon: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M9.5 16c-.6-4 .4-8.5 2.5-8.5s3 4.5 2.5 8.5z"/>' },
  { n: L('Analysis', 'Analyse'), t: 1, icon: '<path d="M12 3l2 5.5 5.5 2-5.5 2L12 18l-2-5.5-5.5-2 5.5-2z"/><path d="M19 17l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>' },
  { n: L('Design', 'Design'), t: 2, icon: '<path d="M3 16.5c3 0 4.5-1.5 7-1.5s5 2.5 11 2.5v2.5H3z"/><path d="M5 15l3-8h4l2 5"/>' },
  { n: L('Order', 'Bestellen'), t: 1, icon: '<path d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>' }
];
const ico = (path, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

let local = {};            // per-screen transient UI state
let viewer = null;         // active three.js viewer

// Conditional screens: with a connected running app the manual questions are skipped, and vice versa.
function skipToken(t) {
  if (t === 'd_zones') return state.design.mode !== 'custom';
  if (t === 'p_data') return !state.imported;
  if (['p_train', 'p_pace', 'p_surface'].includes(t)) return !!state.imported;
  return false;
}
function go(screen, opts = {}) {
  const from = state.screen;
  const ms = Date.now() - (state.stepEnter || Date.now());
  logEvent('step', { from, to: screen, ms });
  cleanup();
  state.screen = screen; state.stepEnter = Date.now();
  if (!opts.back && from !== screen) state.history.push(from);
  if (state.history.length > 80) state.history.splice(0, state.history.length - 80);
  save(); local = Object.assign({}, opts.local || {});
  render();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}
function next() {
  let i = FLOW.indexOf(state.screen);
  if (i < 0) return;
  do { i++; } while (i < FLOW.length && skipToken(FLOW[i]));
  go(FLOW[i] || 'thanks');
}
function back() {
  let prev = state.history.pop();
  while (prev && (prev.startsWith('done') || prev === state.screen)) prev = state.history.pop();
  if (!prev) { let i = FLOW.indexOf(state.screen); do { i--; } while (i > 0 && (FLOW[i].startsWith('done') || skipToken(FLOW[i]))); prev = state.screen === 'ar' ? 'd_style' : (FLOW[i] || 'landing'); }
  go(prev, { back: true });
}
function cleanup() {
  stopStreams();
  if (viewer) { viewer.dispose(); viewer = null; }
  overlayRoot.querySelectorAll('.sheet-bg').forEach(n => n.remove());
}

/* ===================== fit accuracy (progress you can feel) ===================== */
function fitParts() {
  const v = state.video;
  return [
    { k: 'base', l: L('Starting point: average runner', 'Ausgangspunkt: Durchschnittsläufer:in'), p: 20, on: true },
    { k: 'profile', l: L('Your runner profile', 'Dein Läuferprofil'), p: 15, on: state.flags.profile },
    { k: 'import', l: L('Training history (app or file)', 'Trainingsverlauf (App oder Datei)'), p: 10, on: !!state.imported },
    { k: 'comfort', l: L('Comfort map', 'Komfortkarte'), p: 5, on: state.profile.comfort.length > 0 },
    { k: 'video', l: L('Running video', 'Laufvideo'), p: 15, on: v.status === 'done', part: v.skipped ? 4 : v.mode === 'pose' ? 15 : 10 },
    { k: 'scan', l: L('3D foot scan', '3D-Fußscan'), p: 20, on: state.scan.done },
    { k: 'insole', l: L('Insole of your current shoe', 'Einlage deines aktuellen Schuhs'), p: 5, on: state.scan.insole },
    { k: 'usecase', l: L('Use case', 'Einsatzzweck'), p: 2, on: !!state.usecase },
    { k: 'design', l: L('Your design choices', 'Deine Design-Entscheidungen'), p: 5, on: state.flags.design }
  ];
}
function fitAccuracy() { return Math.min(97, fitParts().reduce((a, x) => a + (x.on ? (x.part ?? x.p) : 0), 0)); }
function ringSVG(val, size = 34, stroke = 4) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#2a2a2e" stroke-width="${stroke}"/><circle class="ringfg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#d4ff00" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - val / 100)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

/* ===================== header & shell ===================== */
function renderBar() {
  const ph = PH[state.screen] || 0;
  const st = STEPS();
  const title = ph
    ? `<b>${L('Step', 'Schritt')} ${ph} ${L('of', 'von')} 6 · ${st[ph - 1].n}</b><span>${state.nickname ? esc(state.nickname) + ' · ' : ''}${L('about', 'ca.')} ${remainingMin(ph)} ${L('min left', 'Min. übrig')}</span>`
    : `<b>Nike Shoe Fit</b><span>${L('Student prototype', 'Studentischer Prototyp')}</span>`;
  const showRing = state.consent && !['landing', 'thanks'].includes(state.screen);
  const chips = ph ? `<nav class="stepper" aria-label="${L('Progress', 'Fortschritt')}">${st.map((s, i) => { const n = i + 1; const cls = n < ph || (n === ph && state.screen === 'done' + n) ? 'done' : n === ph ? 'cur' : ''; return `<div class="stp ${cls}" ${n === ph ? 'aria-current="step"' : ''}><span class="ic">${cls === 'done' ? ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16) : ico(s.icon, 16)}</span><span class="nm">${s.n}</span></div>`; }).join('')}</nav>` : '';
  bar.innerHTML = `<div class="bar1"><button class="logo" data-act="logo" aria-label="Nike Shoe Fit">NS</button>
    <div class="bartitle">${title}</div>
    ${showRing ? `<button class="ring" data-act="fit" aria-label="${L('Fit accuracy', 'Passgenauigkeit')} ${state.fitShown}%">${ringSVG(state.fitShown)}<b class="num">${state.fitShown}</b></button>` : ''}
    <button class="iconbtn" data-act="lang" aria-label="${L('Switch to German', 'Auf Englisch umschalten')}">${state.lang === 'de' ? 'EN' : 'DE'}</button>
    <button class="iconbtn" data-act="menu" aria-label="${L('Menu', 'Menü')}">⋯</button></div>${chips}`;
  document.documentElement.lang = state.lang;
  document.getElementById('disclaimer').textContent = L('Student prototype (MCI design sprint). Not affiliated with or endorsed by Nike or Strava. No real orders.', 'Studentischer Prototyp (MCI Design Sprint). Keine Verbindung zu Nike oder Strava. Keine echten Bestellungen.');
}
function remainingMin(ph) { return Math.max(1, STEPS().slice(ph - 1).reduce((a, s) => a + s.t, 0)); }

// Screen head: back link, sub-step dots, question title, "why we ask" line.
function head(title, sub, opts = {}) {
  const ph = PH[state.screen];
  let dots = '';
  if (ph) {
    const subs = FLOW.filter(t => PH[t] === ph && !t.startsWith('done') && !skipToken(t));
    const i = subs.indexOf(state.screen);
    if (subs.length > 1 && i >= 0) dots = `<div class="subprog" aria-label="${L('Part', 'Teil')} ${i + 1} ${L('of', 'von')} ${subs.length}"><span class="num">${i + 1}/${subs.length}</span>${subs.map((_, k) => `<i class="${k < i ? 'd' : k === i ? 'c' : ''}"></i>`).join('')}</div>`;
  }
  return `<div class="headrow">${opts.back === false ? '<span></span>' : `<button class="back" data-act="back">‹ ${L('Back', 'Zurück')}</button>`}${dots}</div>
    <h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}${opts.why ? `<div class="why1">${ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>', 16)}<span>${opts.why}</span></div>` : ''}`;
}
const cta = (inner) => `<div class="grow"></div><div class="cta">${inner}</div>`;
const contBtn = (label, extra = '') => `<button class="btn primary" data-act="next" ${extra}>${label || L('Continue', 'Weiter')} ›</button>`;

function render(anim = true) {
  renderBar();
  const s = SCREENS[state.screen] || SCREENS.landing;
  app.innerHTML = `<div class="stack ${anim ? 'fade' : ''}" style="gap:14px;flex:1">${s.html()}</div>`;
  if (s.mount) s.mount();
  renderTimer();
}
function rerenderKeepScroll() { const y = window.scrollY; const open = [...app.querySelectorAll('details')].map(d => d.open); render(false); app.querySelectorAll('details').forEach((d, i) => { if (open[i]) d.open = true; }); window.scrollTo(0, y); }

let timerIv = null;
function renderTimer() {
  let el = document.getElementById('steptimer');
  if (!state.facilitator.showTimer) { if (el) el.remove(); clearInterval(timerIv); return; }
  if (!el) { el = document.createElement('div'); el.id = 'steptimer'; el.className = 'timer'; document.body.appendChild(el); }
  clearInterval(timerIv);
  const tick = () => { el.textContent = Math.round((Date.now() - state.stepEnter) / 1000) + ' s'; };
  tick(); timerIv = setInterval(tick, 1000);
}

/* ===================== sheets ===================== */
function openSheet(html, onClick) {
  overlayRoot.querySelectorAll('.sheet-bg').forEach(n => n.remove());
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); else onClick && onClick(e, bg); });
  overlayRoot.appendChild(bg);
  bg.querySelector('.sheet').focus({ preventScroll: true });
  return bg;
}

function openConsent() {
  const bg = openSheet(`<h2>${L('Before you start', 'Bevor du startest')}</h2>
    <ul class="bullets">
      <li><span class="dot">${ico('<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M11 18h2"/>', 13)}</span><span><b>${L('Stays on your phone:', 'Bleibt auf deinem Handy:')}</b> ${L('photos, videos and your profile are never uploaded. Only the anonymous feedback at the end is sent.', 'Fotos, Videos und dein Profil werden nie hochgeladen. Nur das anonyme Feedback am Ende wird gesendet.')}</span></li>
      <li><span class="dot">${ico('<path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.5"/>', 13)}</span><span><b>${L('Camera:', 'Kamera:')}</b> ${L('your browser asks before the video and the scan. You can say no and use a fallback.', 'Dein Browser fragt vor Video und Scan. Du kannst ablehnen und eine Alternative nutzen.')}</span></li>
      <li><span class="dot">${ico('<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8"/>', 13)}</span><span><b>${L('No real order:', 'Keine echte Bestellung:')}</b> ${L('nothing is bought, paid or produced. Delete your data any time in the menu (⋯).', 'Es wird nichts gekauft, bezahlt oder produziert. Daten jederzeit im Menü (⋯) löschen.')}</span></li>
    </ul>
    <label class="stack" style="gap:6px"><span class="label">${L('What should we call you? (optional)', 'Wie sollen wir dich nennen? (optional)')}</span>
      <input class="text" id="nick" maxlength="20" autocomplete="nickname" value="${esc(state.nickname)}" placeholder="${L('e.g. Lena', 'z. B. Lena')}"></label>
    <label class="check"><input type="checkbox" id="agree" ${state.consent ? 'checked' : ''}><span>${L('I understand this is a student prototype (MCI design sprint), not a Nike product, and I agree to take part in the test.', 'Ich verstehe, dass dies ein studentischer Prototyp (MCI Design Sprint) und kein Nike-Produkt ist, und nehme am Test teil.')}</span></label>
    <button class="btn primary" data-c="start" id="startbtn" ${state.consent ? '' : 'disabled'}>${L("Let's go", "Los geht's")} ›</button>`,
    (e, bgEl) => {
      const b = e.target.closest('[data-c]'); if (!b || b.disabled) return;
      state.consent = true; state.nickname = (document.getElementById('nick').value || '').trim().slice(0, 20); save(); logEvent('consent', {}); bgEl.remove(); next();
    });
  const agree = bg.querySelector('#agree'), btn = bg.querySelector('#startbtn');
  agree.addEventListener('change', () => { btn.disabled = !agree.checked; });
}

function openFitInfo() {
  const parts = fitParts();
  openSheet(`<div class="row"><div style="flex:none;width:56px;height:56px">${ringSVG(fitAccuracy(), 56, 6)}</div><div><h2>${L('Fit accuracy', 'Passgenauigkeit')} ${fitAccuracy()}%</h2><p class="small" style="margin:2px 0 0">${L('How well we know your feet and stride. Every step adds data, so your shoe gets more personal.', 'Wie gut wir deine Füße und deinen Laufstil kennen. Jeder Schritt bringt Daten, dein Schuh wird persönlicher.')}</p></div></div>
    <div class="fitlist">${parts.map(p => `<div class="${p.on ? 'on' : ''}"><i>${p.on ? '✓' : ''}</i><span>${p.l}</span><b class="num">+${p.on ? (p.part ?? p.p) : p.p}</b></div>`).join('')}</div>
    <p class="small" style="margin:0">${L('Prototype logic: the percentage is a guide to show progress, not a measured accuracy.', 'Prototyp-Logik: Die Prozentzahl zeigt den Fortschritt, sie ist keine gemessene Genauigkeit.')}</p>
    <button class="btn secondary" data-x="close">${L('Got it', 'Verstanden')}</button>`, (e, bg) => { if (e.target.closest('[data-x]')) bg.remove(); });
  logEvent('fit-info', {});
}

function openMenu() {
  openSheet(`<h2>${L('Menu', 'Menü')}</h2>
    <button class="btn secondary" data-m="lang">${L('Deutsch', 'English')}</button>
    <button class="btn secondary" data-m="howto">${L('How it works', 'So funktioniert es')}</button>
    <button class="btn secondary" data-m="restart">${L('Start over', 'Neu starten')}</button>
    <button class="btn secondary" data-m="delete" style="color:#ff8a70">${L('Delete my data', 'Meine Daten löschen')}</button>
    <p class="small">${L('All your data is stored only in this browser. Deleting removes your profile, scan results, video analysis and test log from this device.', 'Alle Daten liegen nur in diesem Browser. Löschen entfernt Profil, Scan-Ergebnisse, Videoanalyse und Testprotokoll von diesem Gerät.')}</p>
    <button class="btn ghost" data-m="close">${L('Close', 'Schließen')}</button>`,
    (e, bg) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const m = b.dataset.m;
      if (m === 'close') bg.remove();
      if (m === 'howto') { bg.remove(); openHowTo(); }
      if (m === 'lang') { state.lang = state.lang === 'de' ? 'en' : 'de'; save(); bg.remove(); render(); }
      if (m === 'restart') { if (b.dataset.confirm) { cleanup(); const keepConsent = state.consent; const nickname = state.nickname; resetAll(); state.consent = keepConsent; state.nickname = nickname; state.screen = keepConsent ? 'p_body' : 'landing'; save(); bg.remove(); render(); toast(L('Started over', 'Neu gestartet')); } else { b.dataset.confirm = 1; b.textContent = L('Tap again to start over', 'Nochmals tippen zum Neustart'); } }
      if (m === 'delete') { if (b.dataset.confirm) { cleanup(); resetAll(); bg.remove(); render(); toast(L('Your data was deleted', 'Deine Daten wurden gelöscht')); } else { b.dataset.confirm = 1; b.textContent = L('Tap again to delete everything', 'Nochmals tippen, um alles zu löschen'); } }
    });
}
function openHowTo() {
  openSheet(`<h2>${L('6 steps to your shoe', 'In 6 Schritten zu deinem Schuh')}</h2>${stepsTimeline()}<button class="btn secondary" data-x="close">${L('Close', 'Schließen')}</button>`, (e, bg) => { if (e.target.closest('[data-x]')) bg.remove(); });
}
function stepsTimeline() {
  const d = [L('A few taps about you and your running.', 'Ein paar Fragen zu dir und deinem Laufen.'), L('Film a 10-second run. We read your stride.', 'Filme 10 Sekunden Laufen. Wir lesen deinen Laufstil.'), L('Scan both feet in 3D with your phone.', 'Scanne beide Füße mit dem Handy in 3D.'), L('The AI combines everything into your fit.', 'Die KI kombiniert alles zu deiner Passform.'), L('Pick a use case, colour and details.', 'Wähle Einsatz, Farbe und Details.'), L('Check your shoe and send it to print.', 'Prüfe deinen Schuh und schick ihn in den Druck.')];
  const ph = PH[state.screen] || 0;
  return `<ol class="timeline">${STEPS().map((s, i) => `<li class="${i + 1 < ph ? 'done' : i + 1 === ph ? 'cur' : ''}"><span class="ic">${ico(s.icon, 18)}</span><div><b>${i + 1}. ${s.n} <span class="small">· ~${s.t} min</span></b><span>${d[i]}</span></div></li>`).join('')}</ol>`;
}

let logoTaps = [];
function logoTap() {
  const now = Date.now(); logoTaps = logoTaps.filter(t => now - t < 1500); logoTaps.push(now);
  if (logoTaps.length >= 3) { logoTaps = []; openFacilitator(); }
}

function openFacilitator() {
  const o = state.overrides, sc = scanValues(), rm = runMetrics();
  const sel = (key, opts, cur) => `<select data-ov="${key}"><option value="">Auto (${esc(cur)})</option>${opts.map(v => `<option ${o[key] === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  const screens = [...FLOW, 'ar'].map(s => `<option value="${s}" ${s === state.screen ? 'selected' : ''}>${s}</option>`).join('');
  openSheet(`<h2>${L('Facilitator mode', 'Testleiter-Modus')}</h2>
    <p class="small">${L('Hidden from testers. Changes apply immediately.', 'Für Testpersonen unsichtbar. Änderungen gelten sofort.')}</p>
    <div class="stack fac">
      <div class="rowsel"><span>Arch</span>${sel('arch', ['High arch', 'Normal arch', 'Flat foot'], sc.archType)}</div>
      <div class="rowsel"><span>Pronation</span>${sel('pronation', ['Neutral', 'Overpronation', 'Supination'], sc.pronation)}</div>
      <div class="rowsel"><span>Foot strike</span>${sel('strike', ['Heel strike', 'Midfoot strike', 'Forefoot strike'], rm.strike)}</div>
      <div class="rowsel"><span>Cadence</span><input data-ovn="cadence" inputmode="numeric" placeholder="${rm.cadence}" value="${o.cadence ?? ''}"></div>
      <div class="rowsel"><span>Length R / L</span><div class="grid2"><input data-ovn="lenR" inputmode="decimal" placeholder="${sc.lenR}" value="${o.lenR ?? ''}"><input data-ovn="lenL" inputmode="decimal" placeholder="${sc.lenL}" value="${o.lenL ?? ''}"></div></div>
      <div class="rowsel"><span>Scan source</span><select data-fac="scanSource"><option value="camera" ${state.facilitator.scanSource === 'camera' ? 'selected' : ''}>Camera</option><option value="fallback" ${state.facilitator.scanSource === 'fallback' ? 'selected' : ''}>Generated background</option></select></div>
      <div class="rowsel"><span>Lite mode</span><select data-fac="lite"><option value="0" ${!state.device.lite ? 'selected' : ''}>Off</option><option value="1" ${state.device.lite ? 'selected' : ''}>On</option></select></div>
      <div class="rowsel"><span>Step timer</span><select data-fac="timer"><option value="0" ${!state.facilitator.showTimer ? 'selected' : ''}>Hidden</option><option value="1" ${state.facilitator.showTimer ? 'selected' : ''}>Shown</option></select></div>
      <div class="rowsel"><span>Jump to</span><select data-fac="jump">${screens}</select></div>
      <p class="small">Version <b>2</b> · Video: <b>${state.video.mode || 'none'}</b> · Scan done: <b>${state.scan.done ? 'yes' : 'no'}</b> · Fit: <b>${fitAccuracy()}%</b> · Log: <b>${state.log.length}</b></p>
      <div class="grid2"><button class="btn secondary small" data-f="demo">${L('Autofill demo', 'Demo ausfüllen')}</button><button class="btn secondary small" data-f="export">${L('Export JSON', 'JSON exportieren')}</button></div>
      <button class="btn secondary small" data-f="reset" style="width:100%">${L('Reset session', 'Sitzung zurücksetzen')}</button>
      <button class="btn primary" data-f="close">${L('Close', 'Schließen')}</button>
    </div>`,
    (e, bg) => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      const f = b.dataset.f;
      if (f === 'close') { bg.remove(); render(); }
      if (f === 'demo') { state.profile = Object.assign(demoProfile(), { age: state.profile.age }); state.nickname = state.nickname || 'Demo'; state.consent = true; state.flags.profile = true; save(); logEvent('override', { what: 'demo-profile' }); bg.remove(); render(); toast('Demo profile loaded'); }
      if (f === 'export') { download(new Blob([JSON.stringify({ exported: new Date().toISOString(), version: 2, state }, null, 2)], { type: 'application/json' }), `nsf-v2-session-${Date.now()}.json`); }
      if (f === 'reset') { cleanup(); resetAll(); bg.remove(); render(); toast('Session reset'); }
    });
  const sheet = overlayRoot.querySelector('.sheet');
  sheet.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.ov !== undefined) { if (t.value) state.overrides[t.dataset.ov] = t.value; else delete state.overrides[t.dataset.ov]; logEvent('override', { what: t.dataset.ov, value: t.value }); }
    if (t.dataset.ovn !== undefined) { const v = parseFloat(String(t.value).replace(',', '.')); if (isFinite(v)) state.overrides[t.dataset.ovn] = v; else delete state.overrides[t.dataset.ovn]; logEvent('override', { what: t.dataset.ovn, value: t.value }); }
    if (t.dataset.fac === 'scanSource') state.facilitator.scanSource = t.value;
    if (t.dataset.fac === 'lite') state.device.lite = t.value === '1';
    if (t.dataset.fac === 'timer') { state.facilitator.showTimer = t.value === '1'; renderTimer(); }
    if (t.dataset.fac === 'jump') { if (t.value !== 'landing') state.consent = true; save(); overlayRoot.querySelector('.sheet-bg')?.remove(); go(t.value); return; }
    save();
  });
}

/* ===================== small helpers ===================== */
function validPace(p) { const m = String(p).match(/^(\d{1,2}):(\d{2})$/); return !!m && +m[2] < 60 && +m[1] >= 2 && +m[1] <= 15; }
function nick() { return state.nickname ? esc(state.nickname) : L('runner', 'Läufer:in'); }
function possessive() { return state.nickname ? esc(state.nickname) + (state.lang === 'de' ? 's' : "'s") : L('your', 'deine'); }
const HARD = () => ({ soft: L('Soft', 'Weich'), medium: L('Medium', 'Mittel'), firm: L('Firm', 'Fest') });
// Big tappable option card. "data-pick" = key, "data-v" = value.
function opt(key, v, on, title, desc = '', icon = '', multi = false) {
  return `<button class="opt ${on ? 'on' : ''}" data-pick="${key}" data-v="${esc(v)}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${on}">${icon ? `<span class="oi">${icon}</span>` : ''}<span class="ot"><b>${title}</b>${desc ? `<span>${desc}</span>` : ''}</span><span class="ock">${on ? '✓' : ''}</span></button>`;
}
function chip(key, v, on, label) { return `<button class="chip ${on ? 'on' : ''}" data-pick="${key}" data-v="${esc(v)}" role="radio" aria-checked="${on}">${label}</button>`; }
function stepper(key, val, unit, min, max) {
  return `<div class="stepnum"><button class="pm" data-act="inc" data-k="${key}" data-d="-1" aria-label="−">−</button><div><b class="num" id="v-${key}">${val}</b><span>${unit}</span></div><button class="pm" data-act="inc" data-k="${key}" data-d="1" aria-label="+">+</button></div>
    <input type="range" min="${min}" max="${max}" value="${val}" data-num="${key}" aria-label="${key}">`;
}

/* ===================== SCREENS ===================== */
const SCREENS = {};

/* ---------- landing ---------- */
SCREENS.landing = {
  html() {
    const st = STEPS();
    return `
      <div class="lhero">
        <span class="badge dim">${L('Student prototype · MCI design sprint', 'Studentischer Prototyp · MCI Design Sprint')}</span>
        <div class="slogan">Never Miss a Run.</div>
        <h1 class="lh1">${L('Shoes that hurt<br><span class="volt">belong in the past.</span>', 'Schuhe, die drücken,<br><span class="volt">sind Vergangenheit.</span>')}</h1>
        <p class="sub" style="max-width:none">${L('Your feet and your stride are unique. We scan both and 3D-print a running shoe that fits only you.', 'Deine Füße und dein Laufstil sind einzigartig. Wir scannen beides und drucken einen Laufschuh in 3D, der nur dir passt.')}</p>
        <div class="heroshoe">${shoePhoto('black')}</div>
        <ul class="lpoints">
          <li>${ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16)}<span>${L('No more pressure points: built on your own 3D foot scan', 'Keine Druckstellen mehr: gebaut nach deinem 3D-Fußscan')}</span></li>
          <li>${ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16)}<span>${L('Cushioning tuned to how you land', 'Dämpfung abgestimmt darauf, wie du landest')}</span></li>
          <li>${ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16)}<span>${L('3D-printed midsole, made only for you', '3D-gedruckte Zwischensohle, nur für dich gefertigt')}</span></li>
        </ul>
        <div class="lsteps" aria-label="${L('6 steps', '6 Schritte')}">${st.map((x, k) => `<div><span class="ic">${ico(x.icon, 16)}</span><span>${k + 1}. ${x.n}</span></div>`).join('')}</div>
        <div class="grow"></div>
        <button class="btn primary" data-act="begin">${L('Find my perfect shoe', 'Meinen perfekten Schuh finden')} ›</button>
        <p class="fine">${L('6 steps · about 10 minutes · nothing is really ordered', '6 Schritte · etwa 10 Minuten · es wird nichts wirklich bestellt')}</p>
      </div>`;
  }
};

/* ---------- step 1: profile, one question per screen ---------- */
SCREENS.p_body = {
  html() {
    const p = state.profile;
    return `${head(L(`Hi ${nick()}! First, a bit about you`, `Hallo ${nick()}! Zuerst ein bisschen über dich`), '', { why: L('Your weight decides how dense the printed cushioning lattice must be.', 'Dein Gewicht bestimmt, wie dicht das gedruckte Dämpfungsgitter sein muss.') })}
      <div class="card stack"><span class="label">${L('Weight', 'Gewicht')}</span>${stepper('weight', p.weight, 'kg', 40, 140)}</div>
      <div class="card stack"><span class="label">${L('Height', 'Größe')}</span>${stepper('height', p.height, 'cm', 140, 210)}</div>
      <div class="stack" style="gap:8px"><span class="label">${L('Age', 'Alter')}</span><div class="chips">${['18-24', '25-34', '35-44', '45-54', '55+'].map(a => chip('age', a, p.age === a, a)).join('')}</div></div>
      ${cta(contBtn())}`;
  }
};
const SIZES = Array.from({ length: 26 }, (_, i) => 35.5 + i * 0.5);
SCREENS.p_size = {
  html() {
    const p = state.profile;
    const lab = eu => p.sizeSys === 'US' ? sizeConv.toUS(eu) : p.sizeSys === 'UK' ? sizeConv.toUK(eu) : eu;
    return `${head(L('Which size do you usually wear?', 'Welche Größe trägst du normalerweise?'), '', { why: L('Only a starting point. Your 3D scan sets the final size.', 'Nur ein Startpunkt. Dein 3D-Scan legt die endgültige Größe fest.') })}
      <div class="seg" role="group">${['EU', 'US', 'UK'].map(v => `<button data-pick="sizeSys" data-v="${v}" class="${p.sizeSys === v ? 'on' : ''}" aria-pressed="${p.sizeSys === v}">${v}</button>`).join('')}</div>
      <div class="sizes" role="radiogroup">${SIZES.map(eu => `<button class="${p.shoeEU === eu ? 'on' : ''}" data-pick="size" data-v="${eu}" role="radio" aria-checked="${p.shoeEU === eu}">${String(lab(eu)).replace('.', state.lang === 'de' ? ',' : '.')}</button>`).join('')}</div>
      ${cta(contBtn())}`;
  }
};
const KM = [[10, '< 15 km'], [22, '15–30 km'], [40, '30–50 km'], [60, '50+ km']];
const kmBand = v => v < 15 ? 10 : v < 30 ? 22 : v < 50 ? 40 : 60;
SCREENS.p_train = {
  html() {
    const p = state.profile;
    return `${head(L('How much do you run?', 'Wie viel läufst du?'), '', { why: L('More kilometres need a more durable lattice.', 'Mehr Kilometer brauchen ein haltbareres Gitter.') })}
      <div class="stack" style="gap:8px"><span class="label">${L('Runs per week', 'Läufe pro Woche')}</span><div class="chips eq">${[1, 2, 3, 4, 5].map(n => chip('runs', n, Math.min(5, p.runsPerWeek) === n, n === 5 ? '5+' : n)).join('')}</div></div>
      <div class="stack" style="gap:8px"><span class="label">${L('Distance per week', 'Kilometer pro Woche')}</span><div class="grid2">${KM.map(([v, l]) => `<button class="opt sm ${kmBand(p.weeklyKm) === v ? 'on' : ''}" data-pick="km" data-v="${v}" role="radio" aria-checked="${kmBand(p.weeklyKm) === v}"><span class="ot"><b>${l}</b></span></button>`).join('')}</div></div>
      <div class="stack" style="gap:8px"><span class="label">${L('Longest run so far', 'Längster Lauf bisher')}</span><div class="chips eq">${[5, 10, 15, 21, 30, 42].map(n => chip('longest', n, p.longestRun === n, n + ' km')).join('')}</div></div>
      ${cta(contBtn())}`;
  }
};
const PACES = () => [['6:50', L('Easy', 'Locker'), L('slower than 6:30 min/km', 'langsamer als 6:30 min/km')], ['6:00', L('Moderate', 'Mittel'), '5:30–6:30 min/km'], ['5:10', L('Brisk', 'Zügig'), '4:45–5:30 min/km'], ['4:30', L('Fast', 'Schnell'), L('faster than 4:45 min/km', 'schneller als 4:45 min/km')]];
const paceBand = p => { const s = paceSec(p); return s > 390 ? '6:50' : s > 330 ? '6:00' : s > 285 ? '5:10' : '4:30'; };
SCREENS.p_pace = {
  html() {
    const p = state.profile;
    const icon = n => `<span class="bars4">${[1, 2, 3, 4].map(k => `<i class="${k <= n ? 'on' : ''}" style="height:${4 + k * 4}px"></i>`).join('')}</span>`;
    return `${head(L('How fast is a normal run for you?', 'Wie schnell ist ein normaler Lauf für dich?'), '', { why: L('Pace changes how you land, and that changes the drop of your sole.', 'Das Tempo verändert, wie du landest, und damit die Sprengung deiner Sohle.') })}
      <div class="stack">${PACES().map(([v, t, d], i) => opt('pace', v, paceBand(p.pace) === v, t, d, icon(i + 1))).join('')}</div>
      <details class="more"><summary>${L('I know my exact pace', 'Ich kenne mein genaues Tempo')}</summary>
        <label class="field" id="pacefield"><span class="label">${L('Pace', 'Tempo')}</span><span class="in"><input id="pace" value="${esc(p.pace)}" inputmode="numeric" placeholder="5:45" aria-label="${L('Pace in minutes per kilometre', 'Tempo in Minuten pro Kilometer')}"><span class="unit">min/km</span></span></label></details>
      ${cta(contBtn())}`;
  },
  mount() {
    const pace = document.getElementById('pace');
    pace.addEventListener('input', () => { const ok = validPace(pace.value.trim()); document.getElementById('pacefield').style.borderColor = ok ? '' : '#ff8a70'; if (ok) { state.profile.pace = pace.value.trim(); save(); app.querySelectorAll('[data-pick="pace"]').forEach(b => { const on = b.dataset.v === paceBand(state.profile.pace); b.classList.toggle('on', on); b.querySelector('.ock').textContent = on ? '✓' : ''; }); } });
  }
};
const SURF_ICON = {
  road: '<path d="M8 21L10 3M16 21L14 3M12 5v2M12 10v2M12 15v2"/>',
  trail: '<path d="M3 20l6-9 4 5 3-4 5 8z"/><circle cx="17" cy="6" r="2"/>',
  track: '<rect x="3" y="6" width="18" height="12" rx="6"/><rect x="7" y="9.5" width="10" height="5" rx="2.5"/>',
  treadmill: '<path d="M3 17h15l3-3M5 17l-1 3M17 17l1 3"/><circle cx="12" cy="5" r="1.6"/><path d="M10 13l2-5 2 3"/>'
};
SCREENS.p_surface = {
  html() {
    const s = state.profile.surface;
    const sliders = Object.entries(s).map(([k, v]) => `<div class="slider"><span>${surfaceLabel(k)}</span><input type="range" min="0" max="100" step="5" value="${v}" data-surf="${k}" aria-label="${surfaceLabel(k)}"><output id="surf-${k}">${v}%</output></div>`).join('');
    return `${head(L('Where do you run?', 'Wo läufst du?'), L('Pick all that apply.', 'Wähle alles Passende.'), { why: L('The surface decides your outsole: grip for trail, light rubber for the track.', 'Der Untergrund bestimmt die Laufsohle: Grip für Trail, leichtes Gummi für die Bahn.') })}
      <div class="grid2">${Object.keys(s).map(k => `<button class="opt tile ${s[k] > 0 ? 'on' : ''}" data-pick="surf" data-v="${k}" role="checkbox" aria-checked="${s[k] > 0}"><span class="oi">${ico(SURF_ICON[k], 26)}</span><span class="ot"><b>${surfaceLabel(k)}</b><span class="num">${s[k]}%</span></span><span class="ock">${s[k] > 0 ? '✓' : ''}</span></button>`).join('')}</div>
      <details class="more"><summary>${L('Fine-tune the mix', 'Mischung feinjustieren')}</summary><div class="stack" style="gap:8px;padding-top:6px">${sliders}</div></details>
      ${cta(contBtn())}`;
  },
  mount() { app.querySelectorAll('[data-surf]').forEach(sl => sl.addEventListener('input', () => setSurface(sl.dataset.surf, +sl.value))); }
};
function setSurface(key, val) {
  const s = state.profile.surface; const others = Object.keys(s).filter(k => k !== key);
  val = clamp(val, 0, 100); const rest = 100 - val; const sumO = others.reduce((a, k) => a + s[k], 0);
  s[key] = val;
  if (sumO === 0) others.forEach((k, i) => { s[k] = i === 0 ? rest : 0; });
  else { let acc = 0; others.forEach((k, i) => { if (i === others.length - 1) s[k] = rest - acc; else { s[k] = Math.round((s[k] / sumO) * rest / 5) * 5; acc += s[k]; } }); }
  for (const k of Object.keys(s)) { s[k] = Math.max(0, s[k]); const sl = app.querySelector(`[data-surf="${k}"]`); if (sl && k !== key) sl.value = s[k]; const o = document.getElementById('surf-' + k); if (o) o.textContent = s[k] + '%'; }
  save();
}
function toggleSurface(k) {
  const s = state.profile.surface;
  const sel = Object.keys(s).filter(x => s[x] > 0);
  const on = sel.includes(k);
  if (on && sel.length === 1) { toast(L('Pick at least one surface', 'Wähle mindestens einen Untergrund')); return; }
  const nextSel = on ? sel.filter(x => x !== k) : [...sel, k];
  const share = Math.floor(100 / nextSel.length / 5) * 5;
  Object.keys(s).forEach(x => { s[x] = nextSel.includes(x) ? share : 0; });
  s[nextSel[0]] += 100 - share * nextSel.length;
  save();
}
SCREENS.p_import = {
  html() {
    const imp = state.imported;
    return `${head(L('Connect your running data', 'Verbinde deine Laufdaten'), L('We read how often, how far, how fast and where you run. No typing needed.', 'Wir lesen, wie oft, wie weit, wie schnell und wo du läufst. Ohne Tippen.'), { why: L('Real runs show your true training load, not just a guess.', 'Echte Läufe zeigen deine tatsächliche Belastung, nicht nur eine Schätzung.') })}
      ${imp ? `<div class="card hl between"><span><b>${esc(imp.source)}</b> ${L('connected', 'verbunden')}</span><span class="badge">✓</span></div>` : ''}
      <div class="stack">
        <button class="opt" data-act="connect" data-src="Strava"><span class="oi brand" style="background:#fc4c02">${ico('<path d="M10 3l-6 12h4l2-4 2 4h4z"/><path d="M14 15l-2 4-2-4"/>', 22)}</span><span class="ot"><b>${L('Connect Strava', 'Strava verbinden')}</b><span>${L('Demo connection, no login', 'Demo-Verbindung, kein Login')}</span></span><span class="ock">›</span></button>
        <button class="opt" data-act="connect" data-src="Apple Health"><span class="oi brand" style="background:#ff2d55">${ico('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>', 22)}</span><span class="ot"><b>${L('Connect Apple Health', 'Apple Health verbinden')}</b><span>${L('Demo connection, no login', 'Demo-Verbindung, kein Login')}</span></span><span class="ock">›</span></button>
        <label class="opt" style="cursor:pointer"><span class="oi">${ico('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', 22)}</span><span class="ot"><b>${L('Upload a GPX/TCX file', 'GPX/TCX-Datei hochladen')}</b><span>${L('From your watch or running app', 'Von deiner Uhr oder Lauf-App')}</span></span><span class="ock">›</span><input type="file" accept=".gpx,.tcx,application/gpx+xml,application/xml,text/xml" class="visually-hidden" id="gpx"></label></div>
      ${cta(imp ? contBtn() : `<button class="btn secondary" data-act="manual">${L('No account: enter it myself', 'Kein Konto: selbst eingeben')}</button>`)}`;
  },
  mount() { document.getElementById('gpx')?.addEventListener('change', importGPX); }
};
function surfaceMixText(s) { return Object.entries(s).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${surfaceLabel(k)} ${v}%`).join(' · '); }
SCREENS.p_data = {
  html() {
    const imp = state.imported, p = state.profile;
    if (!imp) return '';
    const paceLbl = (PACES().find(x => x[0] === paceBand(p.pace)) || [])[1];
    const row = (title, val, inner) => `<details class="more drow"><summary><span><span class="label">${title}</span><b>${val}</b></span><span class="edit">${L('Edit', 'Ändern')}</span></summary><div class="stack" style="gap:8px;padding-top:4px">${inner}</div></details>`;
    const surfTiles = `<div class="grid2">${Object.keys(p.surface).map(k => `<button class="opt tile sm ${p.surface[k] > 0 ? 'on' : ''}" data-pick="surf" data-v="${k}" role="checkbox" aria-checked="${p.surface[k] > 0}"><span class="ot"><b>${surfaceLabel(k)}</b><span class="num">${p.surface[k]}%</span></span></button>`).join('')}</div>`;
    return `${head(L('Your running data', 'Deine Laufdaten'), L(`Imported from ${imp.source}. Everything looks right? Then just continue.`, `Aus ${imp.source} übernommen. Passt alles? Dann einfach weiter.`), { why: L('Tap "Edit" if something is off, e.g. you were injured for a few weeks.', 'Tippe auf „Ändern“, wenn etwas nicht stimmt, z. B. weil du ein paar Wochen pausiert hast.') })}
      <div class="card hl stack" style="gap:10px"><div class="between"><span class="badge ${imp.source === 'GPX file' ? '' : 'dim'}">${imp.source === 'GPX file' ? L('From your file', 'Aus deiner Datei') : L('Demo data', 'Demo-Daten')} · ${esc(imp.source)}</span><span class="small num">${imp.count} ${L('runs', 'Läufe')}</span></div>
        <span class="label">${L('Kilometres, last 12 weeks', 'Kilometer, letzte 12 Wochen')}</span>${barChart(imp.weeks)}</div>
      <div class="stack" style="gap:8px">
        ${row(L('Runs per week', 'Läufe pro Woche'), `${Math.min(5, p.runsPerWeek)}${p.runsPerWeek >= 5 ? '+' : ''}`, `<div class="chips eq">${[1, 2, 3, 4, 5].map(n => chip('runs', n, Math.min(5, p.runsPerWeek) === n, n === 5 ? '5+' : n)).join('')}</div>`)}
        ${row(L('Distance per week', 'Kilometer pro Woche'), `~${p.weeklyKm} km`, `<div class="grid2">${KM.map(([v, l]) => `<button class="opt sm ${kmBand(p.weeklyKm) === kmBand(v) ? 'on' : ''}" data-pick="km" data-v="${v}"><span class="ot"><b>${l}</b></span></button>`).join('')}</div>`)}
        ${row(L('Longest run', 'Längster Lauf'), `${p.longestRun} km`, `<div class="chips eq">${[5, 10, 15, 21, 30, 42].map(n => chip('longest', n, p.longestRun === n, n + ' km')).join('')}</div>`)}
        ${row(L('Typical pace', 'Übliches Tempo'), `${esc(p.pace)} min/km · ${paceLbl}`, `<div class="stack">${PACES().map(([v, t, d]) => opt('pace', v, paceBand(p.pace) === v, t, d)).join('')}</div>`)}
        ${row(L('Surfaces', 'Untergrund'), surfaceMixText(p.surface), surfTiles)}
      </div>
      <button class="btn ghost" data-act="disconnect">${L('Remove connection and enter it myself', 'Verbindung entfernen und selbst eingeben')}</button>
      ${cta(contBtn(L('Looks right', 'Passt so')))}`;
  }
};
SCREENS.p_comfort = {
  html() {
    const p = state.profile;
    return `${head(L('Where do your shoes bother you?', 'Wo stören dich deine Schuhe?'), L('Tap all areas that apply, or skip if nothing does.', 'Tippe alle passenden Bereiche an oder überspringe, wenn nichts stört.'), { why: L('We make these zones softer or roomier. This is about comfort, not a medical diagnosis.', 'Diese Zonen machen wir weicher oder geräumiger. Es geht um Komfort, keine medizinische Diagnose.') })}
      ${bodyMap(p.comfort)}
      <div class="chips" id="comfortchips">${comfortChips()}</div>
      <details class="more"><summary>${L('Tell us about your current shoe (optional)', 'Dein aktueller Schuh (optional)')}</summary><div class="stack" style="gap:8px;padding-top:6px">
        <input class="text" id="curshoe" value="${esc(p.currentShoe)}" placeholder="${L('Model, e.g. Pegasus 40', 'Modell, z. B. Pegasus 40')}" maxlength="40">
        <div class="chips">${[[150, '< 300 km'], [400, '300–600 km'], [800, '600+ km']].map(([v, l]) => chip('shoekm', v, (p.currentShoeKm < 300 ? 150 : p.currentShoeKm < 600 ? 400 : 800) === v, l)).join('')}</div></div></details>
      ${cta(`<button class="btn primary" data-act="next" id="comfortnext">${p.comfort.length ? L('Continue', 'Weiter') + ' ›' : L('Nothing bothers me ›', 'Nichts stört mich ›')}</button>`)}`;
  },
  mount() {
    app.querySelectorAll('.zone[data-zone]').forEach(z => {
      const toggle = () => { const c = state.profile.comfort; const id = z.dataset.zone; const i = c.indexOf(id); if (i >= 0) c.splice(i, 1); else c.push(id); save(); z.classList.toggle('on'); z.setAttribute('aria-pressed', c.includes(id)); vibrate(10);
        document.getElementById('comfortchips').innerHTML = comfortChips();
        document.getElementById('comfortnext').textContent = c.length ? L('Continue', 'Weiter') + ' ›' : L('Nothing bothers me ›', 'Nichts stört mich ›'); };
      z.addEventListener('click', toggle); z.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
    document.getElementById('curshoe').addEventListener('input', e => { state.profile.currentShoe = e.target.value.slice(0, 40); save(); });
  }
};
function comfortChips() { const c = state.profile.comfort; return c.length ? c.map(z => `<span class="chip on">${zoneLabel(z)}</span>`).join('') : `<span class="small">${L('Nothing selected', 'Nichts ausgewählt')}</span>`; }

// Demo import: plausible values that stay the same for the same nickname, so it feels like "your" data.
function seedImportedProfile(src) {
  const r = rng(seed('import|' + src)), p = state.profile;
  p.runsPerWeek = 2 + Math.floor(r() * 4);
  p.weeklyKm = Math.round(p.runsPerWeek * (5 + r() * 5));
  p.longestRun = [10, 15, 21, 21, 30][Math.floor(r() * 5)];
  p.pace = fmtPace(290 + Math.round(r() * 100));
  const trail = Math.round(r() * 6) * 5, tread = Math.round(r() * 4) * 5, track = r() > 0.7 ? 5 : 0;
  p.surface = { road: 100 - trail - tread - track, trail, track, treadmill: tread };
}
function startImport(src) {
  openSheet(`<div class="row"><div class="logo" style="display:grid;place-items:center">NS</div><span style="font-size:22px;color:var(--muted)">⇄</span><div class="logo" style="display:grid;place-items:center;background:var(--surface-2);color:#fff;font-size:11px">${src === 'Strava' ? 'RUN' : '♡'}</div></div>
    <h2>${L(`Allow Nike Shoe Fit to read your ${src} activities?`, `Nike Shoe Fit erlauben, deine ${src}-Aktivitäten zu lesen?`)}</h2>
    <span class="badge dim">${L('Demo connection · no login, no real data access', 'Demo-Verbindung · kein Login, kein echter Datenzugriff')}</span>
    <div class="perm"><div>${L('Runs of the last 6 months (distance, pace, elevation)', 'Läufe der letzten 6 Monate (Distanz, Tempo, Höhenmeter)')}</div><div>${L('Surface and route type', 'Untergrund und Streckentyp')}</div><div>${L('Shoes logged with your runs', 'Bei Läufen erfasste Schuhe')}</div></div>
    <p class="small">${L('Read-only. You can disconnect at any time.', 'Nur Lesezugriff. Du kannst jederzeit trennen.')}</p>
    <div class="grid2"><button class="btn secondary" data-i="cancel">${L('Cancel', 'Abbrechen')}</button><button class="btn primary" data-i="allow">${L('Allow', 'Erlauben')}</button></div>`,
    async (e, bgEl) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      if (b.dataset.i === 'cancel') { bgEl.remove(); logEvent('import-cancel', { src }); return; }
      seedImportedProfile(src);
      const acts = generateActivities(src);
      bgEl.querySelector('.sheet').innerHTML = `<div class="spinner"></div><h2 style="text-align:center">${L('Syncing', 'Synchronisiere')} ${src}…</h2><p class="small num" style="text-align:center" id="synctxt">${L('Importing', 'Importiere')} 0 / ${acts.count} ${L('activities', 'Aktivitäten')}</p><div class="meter"><i id="syncbar"></i></div>`;
      const t0 = performance.now(), dur = 2600;
      await new Promise(res => { const iv = setInterval(() => { const u = Math.min(1, (performance.now() - t0) / dur); const el = document.getElementById('synctxt'), bb = document.getElementById('syncbar'); if (el) el.textContent = `${L('Importing', 'Importiere')} ${Math.round(u * acts.count)} / ${acts.count} ${L('activities', 'Aktivitäten')}`; if (bb) bb.style.width = (u * 100) + '%'; if (u >= 1) { clearInterval(iv); res(); } }, 60); });
      state.imported = acts;
      const p = state.profile;
      p.weeklyKm = Math.round(acts.weeks.slice(-4).reduce((a, x) => a + x, 0) / 4);
      p.pace = acts.avgPace;
      save(); logEvent('import', { src }); bgEl.remove(); vibrate(20); go('p_data'); toast(L(`${acts.count} activities imported · +10 % fit accuracy`, `${acts.count} Aktivitäten importiert · +10 % Passgenauigkeit`));
    });
}

async function importGPX(e) {
  const f = e.target.files?.[0]; if (!f) return;
  try {
    const txt = await f.text(); const doc = new DOMParser().parseFromString(txt, 'application/xml');
    let pts = [...doc.getElementsByTagName('trkpt')].map(n => ({ lat: +n.getAttribute('lat'), lon: +n.getAttribute('lon'), t: n.getElementsByTagName('time')[0]?.textContent, e: +(n.getElementsByTagName('ele')[0]?.textContent || 0) }));
    if (!pts.length) pts = [...doc.getElementsByTagName('Trackpoint')].map(n => ({ lat: +(n.getElementsByTagName('LatitudeDegrees')[0]?.textContent), lon: +(n.getElementsByTagName('LongitudeDegrees')[0]?.textContent), t: n.getElementsByTagName('Time')[0]?.textContent, e: +(n.getElementsByTagName('AltitudeMeters')[0]?.textContent || 0) })).filter(p => isFinite(p.lat));
    if (pts.length < 2) throw new Error('empty');
    let d = 0, up = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lon - a.lon) * Math.PI / 180;
      const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
      d += 2 * R * Math.asin(Math.sqrt(h)); if (b.e > a.e) up += b.e - a.e;
    }
    const secs = (new Date(pts[pts.length - 1].t) - new Date(pts[0].t)) / 1000;
    const pace = secs > 0 && d > 0 ? fmtPace(secs / d) : state.profile.pace;
    const acts = generateActivities('GPX file');
    acts.runs.unshift({ date: (pts[0].t || new Date().toISOString()).slice(0, 10), dist: round(d, 1), pace, elev: Math.round(up), surface: up / Math.max(d, 0.1) > 25 ? 'trail' : 'road' });
    acts.avgPace = pace; acts.source = 'GPX file';
    state.imported = acts; state.profile.pace = pace; save(); logEvent('import', { src: 'gpx' }); go('p_data');
    toast(L(`Imported ${fmt(d)} km from your file`, `${fmt(d)} km aus deiner Datei importiert`));
  } catch (err) { toast(L('This file could not be read. Try a GPX or TCX export.', 'Die Datei konnte nicht gelesen werden. Versuche einen GPX- oder TCX-Export.')); }
}

/* ---------- interstitial "step done" slides ---------- */
function doneContent(n) {
  const p = state.profile, a = analysis(), sc = a.scan, rm = a.run;
  const mainSurf = Object.entries(p.surface).sort((x, y) => y[1] - x[1])[0][0];
  const st = STEPS();
  const C = {
    1: { title: L('Profile done', 'Profil fertig'), facts: [[`${Math.min(5, p.runsPerWeek)}${p.runsPerWeek >= 5 ? '+' : ''}`, L('runs / week', 'Läufe / Woche')], [`~${p.weeklyKm}`, L('km / week', 'km / Woche')], [surfaceLabel(mainSurf), L('mostly on', 'meistens auf')]], benefit: L('We now know how much cushioning and durability your training needs.', 'Wir wissen jetzt, wie viel Dämpfung und Haltbarkeit dein Training braucht.') },
    2: { title: L('Stride captured', 'Laufstil erfasst'), facts: [[rm.cadence, L('steps / min', 'Schritte / Min.')], [strikeLabel(rm.strike), L('foot strike', 'Aufsatz')], [rm.knee + '°', L('knee at landing', 'Knie bei Landung')]], benefit: rm.strike === 'Heel strike' ? L('You land on your heel, so your heel zone gets extra cushioning.', 'Du landest auf der Ferse, deshalb bekommt die Fersenzone mehr Dämpfung.') : L('Your landing decides where the sole is softer and where it is firmer.', 'Deine Landung bestimmt, wo die Sohle weicher und wo sie fester ist.') },
    3: { title: L('Your feet in 3D', 'Deine Füße in 3D'), facts: [[`${fmt(sc.lenL)} / ${fmt(sc.lenR)}`, L('cm left / right', 'cm links / rechts')], [archLabel(sc.archType), L('arch', 'Gewölbe')], ['EU ' + sc.eu, L('your size', 'deine Größe')]], benefit: L('Your shoe is built on your own feet, not on an average last.', 'Dein Schuh wird auf deinen eigenen Füßen gebaut, nicht auf einem Durchschnittsleisten.') },
    4: { title: L('Your fit is ready', 'Deine Passform steht'), facts: [[a.zones.heel, L('heel', 'Ferse')], [a.zones.mid, L('midfoot', 'Mittelfuß')], [a.zones.fore, L('forefoot', 'Vorfuß')]], benefit: L(`${a.why.length} reasons from your own data shaped these 4 hardness zones.`, `${a.why.length} Gründe aus deinen Daten haben diese 4 Härtezonen geformt.`) },
    5: { title: L('Design locked', 'Design steht'), facts: [[comfortScore(), L('comfort score', 'Komfortwert')], [state.lang === 'de' ? colorObj().de : colorObj().en, L('colour', 'Farbe')], ['€' + price().total, L('price', 'Preis')]], benefit: L('Everything is ready for a final check before printing.', 'Alles ist bereit für einen letzten Check vor dem Druck.') },
    6: { title: L('Approved for print', 'Für den Druck freigegeben'), facts: [[state.order?.id || 'NSF', L('order (demo)', 'Bestellung (Demo)')], ['5', L('days printing', 'Tage Druck')], ['2', L('days shipping', 'Tage Versand')]], benefit: L('Your shoe now goes to the (simulated) micro-factory.', 'Dein Schuh geht jetzt in die (simulierte) Mikrofabrik.') }
  };
  const c = C[n];
  c.next = n < 6 ? `${L('Next', 'Weiter mit')}: ${n + 1}. ${st[n].n} · ~${st[n].t} min` : L('Next: watch your shoe being made', 'Weiter: Sieh zu, wie dein Schuh entsteht');
  return c;
}
for (let n = 1; n <= 6; n++) {
  SCREENS['done' + n] = {
    html() {
      const c = doneContent(n);
      return `<div class="donewrap">
        <div class="donecheck">${ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 44)}</div>
        <span class="eyebrow">${L('Step', 'Schritt')} ${n} ${L('of', 'von')} 6 ${L('done', 'erledigt')}</span>
        <h1 style="text-align:center">${c.title}</h1>${n === 3 ? '<img class="doneimg" src="foot-iso.jpg" alt="">' : ''}
        <div class="dfacts">${c.facts.map(([v, l]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>
        <div class="dring">${ringSVG(state.fitShown, 120, 10)}<div><b class="num" id="dringv">${state.fitShown}%</b><span>${L('fit accuracy', 'Passgenauigkeit')}</span></div></div>
        <p class="dbenefit">${c.benefit}</p>
        <div class="dnext">${c.next}</div>
      </div>
      ${cta(`<button class="btn primary autob" data-act="next"><i id="autofill"></i><span>${L('Continue', 'Weiter')} ›</span></button>`)}`;
    },
    mount() {
      if (n === 1) state.flags.profile = true;
      if (n === 5) state.flags.design = true;
      const from = state.fitShown, to = fitAccuracy();
      const ring = app.querySelector('.dring .ringfg'), val = document.getElementById('dringv');
      const r = 55, c = 2 * Math.PI * r; const t0 = performance.now(), dur = reducedMotion() ? 1 : 1400;
      const anim = () => { const u = Math.min(1, (performance.now() - t0) / dur); const e = 1 - Math.pow(1 - u, 3); const v = Math.round(from + (to - from) * e); if (ring) ring.setAttribute('stroke-dashoffset', (c * (1 - v / 100)).toFixed(1)); if (val) val.textContent = v + '%'; if (u < 1) runtime.raf.push(requestAnimationFrame(anim)); else { state.fitShown = to; save(); renderBar(); } };
      runtime.raf.push(requestAnimationFrame(anim));
      vibrate([20, 40, 20]); beep(988, 90, 0.04);
      logEvent('done', { n, fit: to });
      // Auto-continue after a few seconds; any tap continues earlier.
      const total = 5200, t1 = performance.now(), fill = document.getElementById('autofill');
      const iv = setInterval(() => { const u = (performance.now() - t1) / total; if (fill) fill.style.width = Math.min(100, u * 100) + '%'; if (u >= 1) { clearInterval(iv); if (state.screen === 'done' + n) next(); } }, 60);
      runtime.timers.push(iv);
      save();
    }
  };
}

/* ---------- step 2: running video ---------- */
SCREENS.v_intro = {
  html() {
    const ill = (path) => `<svg viewBox="0 0 80 60" width="72" height="54" aria-hidden="true">${path}</svg>`;
    return `${head(L('Film a 10-second run', 'Filme 10 Sekunden Laufen'), '', { why: L('Your foot strike and cadence decide where your midsole is softer or firmer.', 'Aufsatz und Schrittfrequenz bestimmen, wo deine Zwischensohle weicher oder fester ist.') })}
      <div class="howcards">
        <div class="card hc">${ill('<rect x="8" y="22" width="12" height="22" rx="3" fill="none" stroke="#d4ff00" stroke-width="2"/><path d="M4 50h72" stroke="#555"/><path d="M24 33h40" stroke="#d4ff00" stroke-dasharray="3 3"/>')}<div><b>1 · ${L('Phone at hip height', 'Handy auf Hüfthöhe')}</b><span>${L('Lean it against a wall or ask a friend. Side view.', 'An eine Wand lehnen oder jemanden bitten. Seitenansicht.')}</span></div></div>
        <div class="card hc">${ill('<circle cx="40" cy="14" r="5" fill="none" stroke="#d4ff00" stroke-width="2"/><path d="M40 20v14M40 24l-8 6M40 24l8 4M40 34l-8 12M40 34l9 11" stroke="#d4ff00" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M4 50h72" stroke="#555"/><path d="M14 30h10M10 36h10" stroke="#555" stroke-linecap="round"/>')}<div><b>2 · ${L('Run past, barefoot', 'Barfuß vorbeilaufen')}</b><span>${L('Your normal pace, 4–5 steps through the picture.', 'Dein normales Tempo, 4–5 Schritte durchs Bild.')}</span></div></div>
        <div class="card hc">${ill('<rect x="20" y="6" width="40" height="48" rx="4" fill="none" stroke="#d4ff00" stroke-width="2" stroke-dasharray="4 3"/><circle cx="40" cy="16" r="4" fill="#d4ff00"/><path d="M40 21v13l-6 12M40 34l6 12" stroke="#d4ff00" stroke-width="2" fill="none"/>')}<div><b>3 · ${L('Whole body in frame', 'Ganzer Körper im Bild')}</b><span>${L('Head to feet visible, good light, flat ground.', 'Kopf bis Füße sichtbar, gutes Licht, ebener Boden.')}</span></div></div>
      </div>
      ${cta(`${navigator.mediaDevices?.getUserMedia ? `<button class="btn primary" data-act="record">● ${L('Record now', 'Jetzt aufnehmen')}</button>` : ''}
        <label class="btn secondary" style="cursor:pointer">⇪ ${L('Upload a video', 'Video hochladen')}<input type="file" accept="video/*" class="visually-hidden" id="vidfile"></label>
        <button class="btn ghost" data-act="skipvideo">${L('Skip: estimate from my profile', 'Überspringen: aus Profil schätzen')}</button>`)}`;
  },
  mount() {
    document.getElementById('vidfile').addEventListener('change', e => { const file = e.target.files?.[0]; if (!file) return; setVideo(URL.createObjectURL(file)); logEvent('video', { how: 'upload' }); go('video', { local: { mode: 'analyzing' } }); });
  }
};
SCREENS.video = {
  html() {
    const v = state.video;
    if (local.mode === 'record') return `${head(L('Record your run', 'Lauf aufnehmen'), L('Start, put the phone down, run past within 10 seconds.', 'Starten, Handy abstellen, innerhalb von 10 Sekunden vorbeilaufen.'))}
      <div class="camwrap" id="camwrap"><video id="live" playsinline muted autoplay></video>
        <svg class="guide" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true"><path d="M150 70 a18 18 0 1 0 0.1 0 M150 106 L150 210 M150 130 L118 175 M150 130 L184 168 M150 210 L124 290 L112 350 M150 210 L178 285 L196 342" fill="none" stroke="rgba(212,255,0,.5)" stroke-width="4" stroke-dasharray="8 8" stroke-linecap="round"/><line x1="10" y1="356" x2="290" y2="356" stroke="rgba(212,255,0,.6)" stroke-width="2"/><text x="150" y="380" fill="#d4ff00" font-size="12" text-anchor="middle" font-family="Inter,sans-serif">${L('ground line · full body in frame', 'Bodenlinie · ganzer Körper im Bild')}</text></svg>
        <div class="count" id="count" hidden></div><div class="rec" id="rec" hidden><i></i><span id="rect">0:10</span></div></div>
      <p class="small" id="camerr" hidden style="color:#ff8a70"></p>
      ${cta(`<button class="btn primary" data-act="recstart" id="recbtn">● ${L('Start recording (3-2-1)', 'Aufnahme starten (3-2-1)')}</button>
      <button class="btn secondary" data-act="back">${L('Cancel', 'Abbrechen')}</button>`)}`;
    if (local.mode === 'analyzing' || v.status !== 'done') return `${head(L('Reading your stride', 'Dein Laufstil wird gelesen'), L('Detecting body landmarks frame by frame on your phone.', 'Körperpunkte werden Bild für Bild auf deinem Handy erkannt.'), { back: false })}
      <div class="camwrap">${runtime.videoURL ? `<video src="${runtime.videoURL}" autoplay muted loop playsinline style="opacity:.55"></video>` : ''}<div class="count" style="font-size:40px" id="apct">0%</div></div>
      <div class="meter"><i id="abar"></i></div><p class="small num" id="astatus">${L('Loading pose model…', 'Lade Pose-Modell…')}</p>`;
    const m = runMetrics();
    const card = (val, unit, label, expl) => `<div class="card metric"><span class="label">${label}</span><b>${val}<span class="small"> ${unit}</span></b><span>${expl}</span></div>`;
    return `${head(L('Your running analysis', 'Deine Laufanalyse'), L('These values shape your midsole.', 'Diese Werte formen deine Zwischensohle.'))}
      ${runtime.videoURL ? `<div class="camwrap" style="aspect-ratio:4/3"><video id="pb" src="${runtime.videoURL}" autoplay muted loop playsinline></video><canvas class="ov" id="skel"></canvas><span class="badge" style="position:absolute;top:12px;left:12px">${state.video.mode === 'pose' ? L('Pose tracking', 'Pose-Tracking') : L('Stride analysis', 'Schrittanalyse')}</span></div>` : ''}
      <div class="card hl"><span class="label">${L('In short', 'Kurz gesagt')}</span><p style="margin:4px 0 0;font-weight:600">${L(`You land with a ${strikeLabel(m.strike).toLowerCase()} at ${m.cadence} steps per minute.`, `Du landest mit ${strikeLabel(m.strike)} bei ${m.cadence} Schritten pro Minute.`)} ${m.strike === 'Heel strike' ? L('Your heel takes the first impact.', 'Deine Ferse nimmt den ersten Aufprall.') : L('Your load is spread further forward.', 'Deine Last liegt weiter vorne.')}</p></div>
      <div class="grid2">
        ${card(m.cadence, L('steps/min', 'Schritte/min'), L('Cadence', 'Schrittfrequenz'), m.cadence < 165 ? L('A bit low: longer ground contact.', 'Etwas niedrig: längerer Bodenkontakt.') : L('Efficient rhythm.', 'Effizienter Rhythmus.'))}
        ${card(strikeLabel(m.strike), '', L('Foot strike', 'Aufsatz'), L('Where your foot first touches the ground.', 'Wo dein Fuß zuerst aufsetzt.'))}
      </div>
      <details class="more"><summary>${L('More details', 'Mehr Details')}</summary><div class="stack" style="padding-top:6px">
        ${card(m.knee + '°', '', L('Knee at landing', 'Knie bei Landung'), m.knee > 165 ? L('Fairly straight leg on landing.', 'Recht gestrecktes Bein bei der Landung.') : L('Good knee flexion absorbs impact.', 'Gute Kniebeugung fängt den Aufprall ab.'))}
        ${card(m.lean + '°', '', L('Trunk lean', 'Rumpfneigung'), L('Forward lean from the hips.', 'Vorneigung aus der Hüfte.'))}
        ${card(fmt(m.osc) + ' %', L('of leg length', 'der Beinlänge'), L('Vertical oscillation', 'Vertikale Bewegung'), m.osc > 9 ? L('You bounce a little: energy goes up instead of forward.', 'Du federst etwas: Energie geht nach oben statt nach vorne.') : L('Low bounce, efficient forward motion.', 'Wenig Auf und Ab, effizient nach vorne.'))}</div></details>
      ${cta(`${contBtn()}<button class="btn ghost" data-act="retake">${L('Record again', 'Neu aufnehmen')}</button>`)}`;
  },
  async mount() {
    if (local.mode === 'record') {
      try { const { openCamera } = await import('./video.js'); local.stream = await openCamera('environment'); const live = document.getElementById('live'); live.srcObject = local.stream; await live.play().catch(() => {}); }
      catch (e) { const el = document.getElementById('camerr'); if (!el) return; el.hidden = false; el.textContent = L('Camera not available or permission denied. Go back and use "Upload a video" instead.', 'Kamera nicht verfügbar oder Zugriff verweigert. Geh zurück und nutze „Video hochladen“.'); document.getElementById('recbtn').disabled = true; }
      return;
    }
    if (local.mode === 'analyzing' && !local.started) { local.started = true; startAnalysis(); return; }
    if (state.video.status !== 'done' && !local.started) { local.started = true; local.mode = 'analyzing'; startAnalysis(); return; }
    if (state.video.status === 'done' && runtime.poseFrames && document.getElementById('pb')) {
      const { drawSkeleton } = await import('./video.js');
      const v = document.getElementById('pb'), c = document.getElementById('skel'); if (!c) return; const ctx = c.getContext('2d');
      const loop = () => { if (!document.body.contains(c)) return; const w = c.clientWidth, h = c.clientHeight; if (c.width !== w) { c.width = w; c.height = h; } if (v.videoWidth) drawSkeleton(ctx, runtime.poseFrames, v.currentTime, w, h, v.videoWidth, v.videoHeight); runtime.raf.push(requestAnimationFrame(loop)); };
      loop();
    }
  }
};
function setVideo(url) { if (runtime.videoURL) URL.revokeObjectURL(runtime.videoURL); runtime.videoURL = url; runtime.poseFrames = null; }
async function recordNow() {
  const btn = document.getElementById('recbtn'); btn.disabled = true;
  const count = document.getElementById('count'); count.hidden = false;
  for (const n of [3, 2, 1]) { count.textContent = n; beep(660, 120); vibrate(30); await sleep(900); }
  count.hidden = true; beep(1046, 160);
  const rec = document.getElementById('rec'), rect = document.getElementById('rect'); rec.hidden = false;
  try {
    const { recordClip } = await import('./video.js');
    const blob = await recordClip(local.stream, 10, t => { rect.textContent = '0:' + String(Math.ceil(10 - t)).padStart(2, '0'); });
    vibrate([40, 50, 40]); beep(1318, 120);
    stopStreams(); setVideo(URL.createObjectURL(blob)); logEvent('video', { how: 'record' });
    local.mode = 'analyzing'; local.started = true; render(); startAnalysis();
  } catch (e) { toast(L('Recording is not supported in this browser. Please upload a video.', 'Aufnahme wird in diesem Browser nicht unterstützt. Bitte lade ein Video hoch.')); back(); }
}
async function startAnalysis() {
  const pctEl = () => document.getElementById('apct'), barEl = () => document.getElementById('abar'), st = () => document.getElementById('astatus');
  const show = (u, txt) => { if (pctEl()) pctEl().textContent = Math.round(u * 100) + '%'; if (barEl()) barEl().style.width = (u * 100) + '%'; if (txt && st()) st().textContent = txt; };
  let result = null;
  if (runtime.videoURL) {
    try {
      const { analyzeClip } = await import('./video.js');
      show(0.02, L('Loading pose model…', 'Lade Pose-Modell…'));
      result = await analyzeClip(runtime.videoURL, u => show(0.05 + u * 0.9, L('Detecting body landmarks…', 'Erkenne Körperpunkte…')));
    } catch (e) { result = null; }
  }
  if (result) {
    runtime.poseFrames = result.frames;
    state.video = { status: 'done', mode: 'pose', metrics: result.metrics };
  } else {
    const steps = [L('Detecting body landmarks…', 'Erkenne Körperpunkte…'), L('Tracking ankles and knees…', 'Verfolge Knöchel und Knie…'), L('Measuring ground contact…', 'Messe Bodenkontakt…'), L('Calculating cadence…', 'Berechne Schrittfrequenz…')];
    for (let i = 0; i <= 40; i++) { if (state.screen !== 'video') return; show(i / 40, steps[Math.min(3, Math.floor(i / 10))]); await sleep(reducedMotion() ? 10 : 80); }
    state.video = { status: 'done', mode: 'simulated', metrics: simulatedRunMetrics() };
  }
  logEvent('video-analysis', { mode: state.video.mode });
  save(); vibrate(30);
  if (state.screen === 'video') { local.mode = null; render(); }
}

/* ---------- step 3: foot scan ---------- */
SCREENS.s_prep = {
  html() {
    const items = [['shoes', L('Shoes and socks off', 'Schuhe und Socken aus'), '<path d="M9.5 20c-1-5 0-15 2.5-15s3.5 10 2.5 15z"/>'], ['paper', L('A4 sheet on the floor', 'A4-Blatt auf dem Boden'), '<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/>'], ['light', L('Good light, plain floor', 'Gutes Licht, einfarbiger Boden'), '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>']];
    const ck = local.ck || (local.ck = {});
    const all = items.every(([k]) => ck[k]);
    return `${head(L('Get ready for your foot scan', 'Bereit für deinen Fußscan'), L('Tap each item when it’s done.', 'Tippe jeden Punkt an, wenn er erledigt ist.'), { why: L('The A4 sheet is our ruler: it calibrates the scan to the millimetre.', 'Das A4-Blatt ist unser Lineal: Es kalibriert den Scan auf den Millimeter.') })}
      <div class="card" style="padding:8px"><svg viewBox="0 0 300 120" width="100%" aria-hidden="true"><rect x="20" y="20" width="110" height="80" fill="#ecebe6" rx="2" transform="skewX(-12) translate(18,0)"/><path d="M70 92 C64 70 66 50 72 36 C78 24 92 24 96 36 C100 52 98 76 92 92 Z" fill="#d6a98b"/><rect x="190" y="14" width="44" height="80" rx="9" fill="#202023" stroke="#d4ff00" stroke-width="2"/><path d="M188 54 C160 50 140 52 120 60" stroke="#d4ff00" stroke-dasharray="5 5" fill="none"/><text x="212" y="112" fill="#9a9aa1" font-size="11" text-anchor="middle" font-family="Inter,sans-serif">${L('knee height', 'Kniehöhe')}</text></svg></div>
      <div class="stack">${items.map(([k, l, i]) => `<button class="opt ${ck[k] ? 'on' : ''}" data-act="ck" data-k="${k}" role="checkbox" aria-checked="${!!ck[k]}"><span class="oi">${ico(i, 22)}</span><span class="ot"><b>${l}</b></span><span class="ock">${ck[k] ? '✓' : ''}</span></button>`).join('')}</div>
      <p class="small" style="margin:0">${L('You will scan: right foot → left foot → (optional) the insole of your current shoe. About 30 seconds each.', 'Du scannst: rechten Fuß → linken Fuß → (optional) die Einlage deines aktuellen Schuhs. Je etwa 30 Sekunden.')}</p>
      ${cta(`<button class="btn primary" data-act="toscan" ${all ? '' : 'data-soft="1"'}>${all ? L('I’m ready: start scan', 'Bereit: Scan starten') : L('Start scan', 'Scan starten')} ›</button>`)}`;
  },
  mount() { if (state.device.webgl === null) runChecks(); }
};
async function runChecks() {
  const { webglOK } = await import('./foot3d.js');
  const d = state.device;
  d.webgl = webglOK();
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  d.lite = d.lite || !d.webgl || (cores <= 4 && mem <= 3);
  save(); logEvent('device-check', { webgl: d.webgl, lite: d.lite });
}
async function askMotion() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') state.device.motion = (await DeviceOrientationEvent.requestPermission()) === 'granted';
  } catch (e) { state.device.motion = false; }
  save();
}
SCREENS.scan = {
  html() {
    const s = state.scan;
    if (s.done && local.view !== 'recon') return scanResultsHTML();
    if (local.view === 'recon') return `${head(L('Building your 3D feet', 'Deine 3D-Füße entstehen'), '', { back: false })}
      <div class="viewer" id="viewer"><div class="status" id="vstatus" aria-live="polite">${L('Merging point clouds…', 'Punktwolken werden zusammengeführt…')}</div></div>
      <div class="meter"><i id="rbar"></i></div><p class="small num" id="rtxt"></p>`;
    const next = !s.right ? 'right' : !s.left ? 'left' : (!s.insole && !s.skippedInsole) ? 'insole' : null;
    const item = (k, label, done, cur, optional) => `<div class="scanitem ${done ? 'done' : cur ? 'cur' : ''}"><span class="dot">${done ? '✓' : ''}</span><b>${label}</b><span class="small">${done ? L('Captured', 'Erfasst') : cur ? L('Next', 'Als Nächstes') : optional ? L('Optional', 'Optional') : ''}</span></div>`;
    return `${head(L('3D foot scan', '3D-Fußscan'), L('Stand on the A4 sheet. When prompted, move the phone slowly around your foot.', 'Stell dich auf das A4-Blatt. Beweg das Handy auf Aufforderung langsam um den Fuß.'))}
      <div class="card stack" style="gap:0">${item('right', L('Right foot', 'Rechter Fuß'), s.right, next === 'right')}${item('left', L('Left foot', 'Linker Fuß'), s.left, next === 'left')}${item('insole', L('Insole of your current shoe', 'Einlage deines aktuellen Schuhs'), s.insole, next === 'insole', true)}</div>
      ${next === 'insole' ? `<div class="card small">${L('Optional: scan the insole of your current running shoe. We show what it gets wrong. +5 % fit accuracy.', 'Optional: Scanne die Einlage deines aktuellen Laufschuhs. Wir zeigen, was nicht passt. +5 % Passgenauigkeit.')}</div>` : ''}
      ${!next ? `<div class="card hl small">${L('All scans captured. Now we merge them into a 3D model.', 'Alle Scans erfasst. Jetzt wird daraus ein 3D-Modell.')}</div>` : ''}
      ${cta(`${next ? `<button class="btn primary" data-act="scan" data-foot="${next}">◉ ${next === 'right' ? L('Scan right foot', 'Rechten Fuß scannen') : next === 'left' ? L('Scan left foot', 'Linken Fuß scannen') : L('Scan insole', 'Einlage scannen')}</button>` : `<button class="btn primary" data-act="reconstruct">${L('Build my 3D model', '3D-Modell erstellen')} ›</button>`}
      ${next === 'insole' ? `<button class="btn ghost" data-act="skipinsole">${L('Skip this', 'Überspringen')}</button>` : ''}`)}`;
  },
  async mount() {
    if (local.view === 'recon') await runReconstruction();
    else if (state.scan.done) mountFootGallery();
  }
};
function footSpecs() {
  const sc = scanValues();
  return [
    { side: 'left', len: sc.lenL, ballW: sc.ballWL, heelW: sc.heelWL, archMm: sc.archL, instep: sc.instepL, archType: sc.archType },
    { side: 'right', len: sc.lenR, ballW: sc.ballW, heelW: sc.heelW, archMm: sc.archR, instep: sc.instep, archType: sc.archType }
  ];
}
async function doScan(foot) {
  const steps = { right: '1 / 3', left: '2 / 3', insole: '3 / 3' };
  const res = await (await import('./scan.js')).runScan({ foot, step: steps[foot], lite: state.device.lite, source: state.facilitator.scanSource });
  logEvent('scan', { foot, ok: res.ok, camera: res.usedCamera });
  if (res.ok) { state.scan[foot] = true; save(); toast(L('Scan saved', 'Scan gespeichert')); }
  render();
}
async function runReconstruction() {
  const host = document.getElementById('viewer');
  const labels = [L('Reconstructing surface…', 'Rekonstruiere Oberfläche…'), L('Smoothing mesh…', 'Glätte Netz…'), L('Detecting landmarks…', 'Erkenne Messpunkte…')];
  const start = performance.now();
  const iv = setInterval(() => { const u = Math.min(1, (performance.now() - start) / 6800); const b = document.getElementById('rbar'), t = document.getElementById('rtxt'); if (b) b.style.width = (u * 100) + '%'; if (t) t.textContent = `${Math.round(u * 100)}% · ${Math.round(u * 1840 + 120).toLocaleString()} ${L('mesh vertices', 'Netzpunkte')}`; if (u >= 1) clearInterval(iv); }, 80);
  runtime.timers.push(iv);
  try {
    const { createViewer } = await import('./foot3d.js');
    viewer = await createViewer(host, footSpecs(), { lite: state.device.lite, labels });
    await viewer.reconstruct((txt) => { const s = document.getElementById('vstatus'); if (s) s.textContent = txt; }, reducedMotion() ? 1500 : 6500);
  } catch (e) { await sleep(2500); }
  if (state.screen !== 'scan') return;
  state.scan.done = true; save(); logEvent('reconstruct', {}); vibrate([30, 40, 30]);
  if (viewer) { viewer.dispose(); viewer = null; }
  local.view = null; render();
}
function scanResultsHTML() {
  const sc = scanValues();
  const insoleNote = state.scan.insole ? (() => { const r = rng(seed('insole')); const mm = 3 + Math.floor(r() * 4); return `<div class="card stack" style="gap:6px"><span class="label">${L('Your current insole', 'Deine aktuelle Einlage')}</span><b>${L(`It is ${mm} mm too short at the toes and gives ${sc.archType === 'High arch' ? 'almost no' : 'little'} arch support.`, `Sie ist an den Zehen ${mm} mm zu kurz und stützt das Gewölbe ${sc.archType === 'High arch' ? 'fast gar nicht' : 'kaum'}.`)}</b></div>`; })() : '';
  return `${head(L('Your 3D foot scan', 'Dein 3D-Fußscan'), L('Swipe through the views.', 'Wisch durch die Ansichten.'))}
    ${footGallery(sc)}
    <div class="grid3 keyfacts"><div class="card"><span class="label">${L('Length L / R', 'Länge L / R')}</span><b class="num">${fmt(sc.lenL)} / ${fmt(sc.lenR)}</b><span class="small">cm</span></div><div class="card"><span class="label">${L('Arch', 'Gewölbe')}</span><b>${archLabel(sc.archType)}</b></div><div class="card"><span class="label">${L('Size', 'Größe')}</span><b>EU ${sc.eu}</b><span class="small">${L('scan-based', 'per Scan')}</span></div></div>
    ${insoleNote}
    <details class="more"><summary>${L('All measurements', 'Alle Maße')}</summary><div class="stack" style="padding-top:6px">
      <div class="between"><span class="badge">${L('Scan quality', 'Scanqualität')} ${sc.quality}%</span><span class="small">${L('Calibrated with A4 sheet', 'Kalibriert mit A4-Blatt')}</span></div>
      <div class="card">${measureSVG(sc)}</div>
      <div class="card"><table class="mtable"><thead><tr><th></th><th>${L('Left', 'Links')}</th><th>${L('Right', 'Rechts')}</th></tr></thead><tbody>
        <tr><td>${L('Foot length', 'Fußlänge')}</td><td>${fmt(sc.lenL)} cm</td><td>${fmt(sc.lenR)} cm</td></tr>
        <tr><td>${L('Ball width', 'Ballenbreite')}</td><td>${fmt(sc.ballWL)} cm</td><td>${fmt(sc.ballW)} cm</td></tr>
        <tr><td>${L('Heel width', 'Fersenbreite')}</td><td>${fmt(sc.heelWL)} cm</td><td>${fmt(sc.heelW)} cm</td></tr>
        <tr><td>${L('Arch height', 'Gewölbehöhe')}</td><td>${sc.archL} mm</td><td>${sc.archR} mm</td></tr>
        <tr><td>${L('Instep height', 'Rist-Höhe')}</td><td>${fmt(sc.instepL)} cm</td><td>${fmt(sc.instep)} cm</td></tr>
        <tr><td>Pronation</td><td colspan="2">${pronLabel(sc.pronation)}</td></tr></tbody></table></div>
      <p class="small" style="margin:0">${L(`Size: ${sizeLabel(sc.eu)}, based on your longer foot (${fmt(Math.max(sc.lenR, sc.lenL))} cm) plus 1.5 cm toe room.`, `Größe: ${sizeLabel(sc.eu)}, basierend auf dem längeren Fuß (${fmt(Math.max(sc.lenR, sc.lenL))} cm) plus 1,5 cm Zehenraum.`)}</p>
      <button class="btn secondary" data-act="report">⇩ ${L('Download scan report', 'Scan-Bericht herunterladen')}</button>
      <button class="btn ghost" data-act="rescan">${L('Scan again', 'Neu scannen')}</button></div></details>
    ${cta(contBtn())}`;
}
// Finished scan: rendered views of the scanned feet (team images) + pressure map, swipeable.
const FOOT_VIEWS = () => [['iso', L('3D view', '3D-Ansicht')], ['top', L('Top', 'Oben')], ['side', L('Side', 'Seite')], ['rear', L('Heel', 'Ferse')]];
function footGallery(sc) {
  const v = FOOT_VIEWS();
  const over = {
    top: `<span class="fl" style="left:12%;bottom:7%">L · ${fmt(sc.lenL)} cm</span><span class="fl" style="right:12%;bottom:7%">R · ${fmt(sc.lenR)} cm</span>`,
    side: `<span class="fl" style="left:6%;bottom:6%">${L('Arch', 'Gewölbe')} ${sc.archR} mm</span><span class="fl" style="right:6%;bottom:6%">${L('Instep', 'Rist')} ${fmt(sc.instep)} cm</span>`,
    rear: `<span class="fl" style="left:50%;transform:translateX(-50%);bottom:6%">${L('Heel width', 'Fersenbreite')} ${fmt(sc.heelWL)} / ${fmt(sc.heelW)} cm</span>`,
    iso: `<span class="fl" style="left:5%;bottom:6%">${L('Scan quality', 'Scanqualität')} ${sc.quality}%</span>`
  };
  return `<div class="fgal" id="fgal">
      ${v.map(([k, l]) => `<figure class="fslide" data-v="${k}"><img src="foot-${k}.jpg" alt="${L('Scanned feet', 'Gescannte Füße')}, ${l}" draggable="false">${over[k]}<span class="badge dim ftag">${l}</span></figure>`).join('')}
      <figure class="fslide press" data-v="pressure"><div class="pwrap">${pressureFoot('before', sc.archType)}</div><span class="badge dim ftag">${L('Pressure', 'Druck')}</span><span class="fl" style="left:50%;transform:translateX(-50%);bottom:6%">${L('Where your foot loads most', 'Wo dein Fuß am meisten belastet')}</span></figure>
    </div>
    <div class="seg ftabs" role="tablist">${[...v, ['pressure', L('Pressure', 'Druck')]].map(([k, l], i) => `<button data-fv="${i}" class="${i === 0 ? 'on' : ''}" role="tab">${l}</button>`).join('')}</div>`;
}
function mountFootGallery() {
  const g = document.getElementById('fgal'); if (!g) return;
  const tabs = app.querySelectorAll('[data-fv]');
  tabs.forEach(b => b.addEventListener('click', () => { const i = +b.dataset.fv; g.scrollTo({ left: i * g.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' }); logEvent('viewmode', { m: i }); }));
  let tmr; g.addEventListener('scroll', () => { clearTimeout(tmr); tmr = setTimeout(() => { const i = Math.round(g.scrollLeft / g.clientWidth); tabs.forEach((b, k) => b.classList.toggle('on', k === i)); }, 60); });
  if (!local.revealed) { local.revealed = true; g.classList.add('reveal'); }
}
async function mountScanViewer() {
  const host = document.getElementById('viewer'); if (!host || state.device.webgl === false) return;
  try { const { createViewer } = await import('./foot3d.js'); viewer = await createViewer(host, footSpecs(), { lite: state.device.lite }); } catch (e) { /* no 3D */ }
  app.querySelectorAll('[data-vm]').forEach(b => b.addEventListener('click', () => { app.querySelectorAll('[data-vm]').forEach(x => x.classList.toggle('on', x === b)); viewer && viewer.setMode(b.dataset.vm); logEvent('viewmode', { m: b.dataset.vm }); }));
}
async function scanReport() {
  const sc = scanValues(), c = document.createElement('canvas'); c.width = 900; c.height = 1200; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 900, 1200);
  x.fillStyle = '#d4ff00'; x.font = '900 46px Inter, sans-serif'; x.fillText('Nike Shoe Fit', 50, 90);
  x.fillStyle = '#fff'; x.font = '700 30px Inter, sans-serif'; x.fillText(L('Foot Scan Report', 'Fußscan-Bericht') + (state.nickname ? ' · ' + state.nickname : ''), 50, 140);
  x.fillStyle = '#9a9aa1'; x.font = '400 20px Inter, sans-serif'; x.fillText(new Date().toLocaleString(state.lang === 'de' ? 'de-AT' : 'en-GB') + ' · ' + L('Student prototype, simulated values', 'Studentischer Prototyp, simulierte Werte'), 50, 175);
  { const img = new Image(); img.src = 'foot-iso.jpg'; await new Promise(r => { img.onload = r; img.onerror = r; }); try { x.drawImage(img, 50, 210, 800, 535); } catch (e) { /* ignore */ } }
  const rows = [[L('Foot length L / R', 'Fußlänge L / R'), `${fmt(sc.lenL)} / ${fmt(sc.lenR)} cm`], [L('Ball width L / R', 'Ballenbreite L / R'), `${fmt(sc.ballWL)} / ${fmt(sc.ballW)} cm`], [L('Heel width L / R', 'Fersenbreite L / R'), `${fmt(sc.heelWL)} / ${fmt(sc.heelW)} cm`], [L('Arch height L / R', 'Gewölbehöhe L / R'), `${sc.archL} / ${sc.archR} mm`], [L('Instep L / R', 'Rist L / R'), `${fmt(sc.instepL)} / ${fmt(sc.instep)} cm`], [L('Arch type', 'Gewölbetyp'), archLabel(sc.archType)], ['Pronation', pronLabel(sc.pronation)], [L('Recommended size', 'Empfohlene Größe'), sizeLabel(sc.eu)], [L('Scan quality', 'Scanqualität'), sc.quality + '%']];
  x.font = '600 24px Inter, sans-serif';
  rows.forEach(([k, v], i) => { const y = 780 + i * 44; x.fillStyle = '#9a9aa1'; x.fillText(k, 50, y); x.fillStyle = '#fff'; x.textAlign = 'right'; x.fillText(v, 850, y); x.textAlign = 'left'; });
  download(c.toDataURL('image/png'), 'foot-scan-report.png'); logEvent('report', {});
}

/* ---------- step 4: AI analysis ---------- */
SCREENS.analysis = {
  html() {
    if (!state.analysisSeen) {
      const lines = [L('Merging profile, running data and scan…', 'Profil, Laufdaten und Scan werden zusammengeführt…'), L('Comparing with typical runner profiles…', 'Abgleich mit typischen Läuferprofilen…'), L('Simulating 10,000 foot strikes…', '10.000 Fußaufsätze werden simuliert…'), L('Mapping pressure zones…', 'Druckzonen werden kartiert…'), L('Optimising lattice density…', 'Gitterdichte wird optimiert…'), L('Validating fit…', 'Passform wird geprüft…')];
      return `${head(L('Our AI is combining your data', 'Unsere KI kombiniert deine Daten'), L('Profile + running video + 3D scan → one fit.', 'Profil + Laufvideo + 3D-Scan → eine Passform.'), { back: false })}
        <div class="loader" id="loader">${lines.map((l, i) => `<div class="ln" data-i="${i}"><i></i><span>${l}</span></div>`).join('')}</div>
        <div class="meter"><i id="lbar"></i></div>${cta(`<button class="btn ghost" data-act="skipload">${L('Skip animation', 'Animation überspringen')}</button>`)}`;
    }
    const a = analysis(), sc = a.scan, rm = a.run;
    const zb = (k, label) => `<div class="zonebar c"><span>${label}</span><div class="meter"><i style="width:${a.zones[k]}%"></i></div><b class="num">${a.zones[k]}</b></div>`;
    const summary = [
      L(`Your feet: ${archLabel(sc.archType).toLowerCase()}, ${fmt(Math.abs(sc.lenR - sc.lenL))} cm difference between left and right, size EU ${sc.eu}.`, `Deine Füße: ${archLabel(sc.archType)}, ${fmt(Math.abs(sc.lenR - sc.lenL))} cm Unterschied zwischen links und rechts, Größe EU ${sc.eu}.`),
      L(`Your stride: ${strikeLabel(rm.strike).toLowerCase()} at ${rm.cadence} steps per minute.`, `Dein Laufstil: ${strikeLabel(rm.strike)} bei ${rm.cadence} Schritten pro Minute.`),
      L(`So your sole gets ${a.zones.heel >= a.zones.fore ? 'a more cushioned heel' : 'a more responsive forefoot'}, ${a.drop} mm drop and ${a.outsole.toLowerCase()}.`, `Deshalb bekommt deine Sohle ${a.zones.heel >= a.zones.fore ? 'eine stärker gedämpfte Ferse' : 'einen reaktiveren Vorfuß'}, ${a.drop} mm Sprengung und ${a.outsole}.`)
    ];
    return `${head(L(`Your fit, ${nick()}`, `Deine Passform, ${nick()}`), '', { back: false })}
      <div class="card hl stack" style="gap:10px"><span class="label">${L('In short', 'Kurz gesagt')}</span>${summary.map((s, i) => `<div class="sumline"><span class="dot">${i + 1}</span><span>${s}</span></div>`).join('')}</div>
      <div class="card"><div class="grid2" style="align-items:center"><div style="width:100%;max-width:120px;margin:0 auto">${soleSVG(a.zones, '')}</div><div class="stack" style="gap:8px"><span class="label">${L('Your 4 hardness zones', 'Deine 4 Härtezonen')}</span>${zb('heel', L('Heel', 'Ferse'))}${zb('mid', L('Mid', 'Mitte'))}${zb('fore', L('Fore', 'Vorne'))}${zb('toes', L('Toes', 'Zehen'))}<span class="small">0 ${L('soft', 'weich')} · 100 ${L('firm', 'fest')}</span></div></div></div>
      <details class="more"><summary>${L(`Why? ${a.why.length} reasons from your data`, `Warum? ${a.why.length} Gründe aus deinen Daten`)}</summary><div class="stack" style="padding-top:6px">
        ${a.why.map(w => `<div class="card"><b style="font-size:14px">${w.t}</b><p class="small" style="margin:4px 0 0;color:#cfcfd4">${w.d}</p></div>`).join('')}</div></details>
      <details class="more"><summary>${L('Pressure: your current shoe vs. your custom shoe', 'Druck: aktueller vs. individueller Schuh')}</summary>
        <div class="card compare" style="margin-top:6px"><figure>${pressureFoot('before', sc.archType)}<figcaption>${state.profile.currentShoe ? esc(state.profile.currentShoe) : L('Current shoe', 'Aktueller Schuh')}<br><b style="color:#ff8a70">${L('pressure peaks', 'Druckspitzen')}</b></figcaption></figure><figure>${pressureFoot('after', sc.archType)}<figcaption>${L('Your custom shoe', 'Dein individueller Schuh')}<br><b class="volt">${L('even load', 'gleichmäßige Last')}</b></figcaption></figure></div>
        ${runtime.videoURL ? `<div class="split" style="margin-top:8px"><div><span class="badge warn lab">${L('Current shoe', 'Aktueller Schuh')}</span><video src="${runtime.videoURL}" autoplay muted loop playsinline></video><canvas data-ov="before"></canvas></div><div><span class="badge lab">${L('Custom shoe', 'Individuell')}</span><video src="${runtime.videoURL}" autoplay muted loop playsinline></video><canvas data-ov="after"></canvas></div></div>` : ''}</details>
      ${cta(contBtn(L('Design my shoe', 'Meinen Schuh gestalten') ))}`;
  },
  async mount() {
    if (!state.analysisSeen) {
      const lines = app.querySelectorAll('.ln'); const total = reducedMotion() ? 600 : 6000; const t0 = performance.now();
      local.loadIv = setInterval(() => {
        const u = Math.min(1, (performance.now() - t0) / total); const k = Math.floor(u * lines.length);
        lines.forEach((l, i) => { l.classList.toggle('done', i < k); l.classList.toggle('on', i === k); });
        const b = document.getElementById('lbar'); if (b) b.style.width = (u * 100) + '%';
        if (u >= 1) { clearInterval(local.loadIv); finishLoad(); }
      }, 80);
      runtime.timers.push(local.loadIv);
      return;
    }
    app.querySelectorAll('.split canvas').forEach(c => {
      const kind = c.dataset.ov; const ctx = c.getContext('2d');
      const loop = t => { if (!document.body.contains(c)) return; const w = c.clientWidth, h = c.clientHeight; if (c.width !== w) { c.width = w; c.height = h; } ctx.clearRect(0, 0, w, h);
        const pulse = 0.5 + 0.5 * Math.sin(t / 300);
        const grd = ctx.createRadialGradient(w * 0.5, h * 0.9, 2, w * 0.5, h * 0.9, Math.max(4, w * 0.35));
        if (kind === 'before') { grd.addColorStop(0, `rgba(255,59,31,${0.55 + 0.3 * pulse})`); grd.addColorStop(1, 'rgba(255,59,31,0)'); } else { grd.addColorStop(0, 'rgba(212,255,0,.45)'); grd.addColorStop(1, 'rgba(212,255,0,0)'); }
        ctx.fillStyle = grd; ctx.fillRect(0, h * 0.6, w, h * 0.4);
        ctx.fillStyle = kind === 'before' ? '#ff8a70' : '#d4ff00'; ctx.font = '700 11px Inter, sans-serif'; ctx.fillText(kind === 'before' ? L('impact peak', 'Aufprallspitze') : L('cushioned', 'gedämpft'), 8, h - 10);
        runtime.raf.push(requestAnimationFrame(loop)); };
      runtime.raf.push(requestAnimationFrame(loop));
    });
  }
};
function finishLoad() { if (state.analysisSeen) return; state.analysisSeen = true; save(); logEvent('analysis-shown', {}); vibrate(25); if (state.screen === 'analysis') render(); }

/* ---------- step 5: design ---------- */
const UC_INFO = () => ({
  daily: [L('Everyday training, all-round', 'Alltagstraining, Allrounder'), '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  long: [L('Max cushioning for long distances', 'Maximale Dämpfung für lange Strecken'), '<path d="M3 17c3-6 6-6 9 0s6 6 9 0"/>'],
  race: [L('Light, firm and fast', 'Leicht, fest und schnell'), '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'],
  trail: [L('Grip and stability off-road', 'Grip und Stabilität im Gelände'), '<path d="M3 20l6-9 4 5 3-4 5 8z"/>'],
  gym: [L('Stable for indoor and treadmill', 'Stabil für drinnen und Laufband'), '<path d="M3 17h15l3-3M5 17l-1 3M17 17l1 3"/>']
});
SCREENS.d_usecase = {
  html() {
    const sel = state.usecase, info = UC_INFO();
    return `${head(L('What is this shoe for?', 'Wofür ist dieser Schuh?'), '', { why: L('We tune one configuration per use case: a race shoe is firmer than a long-run shoe.', 'Wir stimmen je Einsatz eine Konfiguration ab: Ein Wettkampfschuh ist fester als ein Langstreckenschuh.') })}
      <div class="stack">${USECASES.map(u => opt('uc', u.id, sel === u.id, state.lang === 'de' ? u.de : u.en, `${info[u.id][0]} · ${HARD()[u.hard].toLowerCase()}`, ico(info[u.id][1], 22))).join('')}</div>
      ${cta(contBtn('', sel ? '' : 'disabled'))}`;
  }
};
SCREENS.d_mode = {
  html() {
    const d = state.design; if (!d.zones) d.zones = recommendedZones(d.hardness);
    const a = analysis(); const uc = USECASES.find(u => u.id === state.usecase) || USECASES[0];
    const layerInfo = { Insole: L('Memory foam, 4 mm, shaped to your arch scan', 'Memory-Schaum, 4 mm, nach deinem Gewölbe-Scan geformt'), Cushioning: L(`3D-printed TPU lattice, heel ${d.zones.heel} / forefoot ${d.zones.fore}`, `3D-gedrucktes TPU-Gitter, Ferse ${d.zones.heel} / Vorfuß ${d.zones.fore}`), Midsole: L(`${a.drop} mm drop, ${a.scan.pronation === 'Overpronation' ? 'medial support' : 'neutral'} geometry`, `${a.drop} mm Sprengung, ${a.scan.pronation === 'Overpronation' ? 'mediale Stütze' : 'neutrale'} Geometrie`), Outsole: uc.id === 'trail' ? L('Lugged rubber, 4 mm grip', 'Profilgummi, 4 mm Grip') : a.outsole };
    const layerName = k => ({ Insole: L('Insole', 'Einlegesohle'), Cushioning: L('Cushioning', 'Dämpfung'), Midsole: L('Midsole', 'Zwischensohle'), Outsole: L('Outsole', 'Laufsohle') }[k]);
    return `${head(L('Your recommended sole', 'Deine empfohlene Sohle'), L(`For ${(state.lang === 'de' ? uc.de : uc.en)}, built from your data.`, `Für ${(state.lang === 'de' ? uc.de : uc.en)}, aus deinen Daten gebaut.`), { why: L('Most runners keep the recommendation. You can still fine-tune every zone.', 'Die meisten behalten die Empfehlung. Du kannst trotzdem jede Zone anpassen.') })}
      <div class="heroshoe"><span class="badge dim">● ${L('What gets printed', 'Was gedruckt wird')}</span>
        <div class="layers">${Object.keys(layerInfo).map(k => `<button class="layer ${d.layer === k ? 'on' : ''}" data-layer="${k}"><span class="slab"></span><span><b>${layerName(k).toUpperCase()}</b><span>${layerInfo[k]}</span></span></button>`).join('')}</div></div>
      <div class="card hl between"><div><span class="label">${L('Expected comfort', 'Erwarteter Komfort')}</span><div class="score"><b style="font-size:38px">${comfortScore()}</b><span>/100</span></div></div><div style="text-align:right"><span class="label">${L('Hardness', 'Härte')}</span><div style="font-weight:800;font-size:18px">${HARD()[d.hardness]}</div></div></div>
      <div class="stack">
        ${opt('mode', 'rec', d.mode === 'rec', L('Use the recommendation', 'Empfehlung übernehmen'), L('Recommended · fastest way', 'Empfohlen · am schnellsten'), ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 22))}
        ${opt('mode', 'custom', d.mode === 'custom', L('Fine-tune the zones myself', 'Zonen selbst anpassen'), L('Adjust heel, midfoot, forefoot, toes', 'Ferse, Mittelfuß, Vorfuß, Zehen anpassen'), ico('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', 22))}
      </div>
      ${cta(contBtn('', d.mode ? '' : 'disabled'))}`;
  }
};
SCREENS.d_zones = {
  html() {
    const d = state.design; if (!d.zones) d.zones = recommendedZones(d.hardness);
    const sl = (k, label) => `<div class="slider"><span>${label}</span><input type="range" min="10" max="98" value="${d.zones[k]}" data-zone-sl="${k}" aria-label="${label}"><output id="z-${k}">${d.zones[k]}</output></div>`;
    return `${head(L('Fine-tune your cushioning', 'Dämpfung feinjustieren'), L('The comfort score updates live.', 'Der Komfortwert passt sich live an.'))}
      <div class="card hl between stickyscore"><div><span class="label">${L('Comfort score', 'Komfortwert')}</span><div class="score"><b id="cscore" style="font-size:38px">${comfortScore()}</b><span>/100</span></div></div><div style="text-align:right"><span class="label">${L('Price', 'Preis')}</span><div class="num" id="price" style="font-size:30px;font-weight:900">€${price().total}</div></div></div>
      <span class="label">${L('Start from a profile', 'Von einem Profil starten')}</span>
      <div class="seg">${['soft', 'medium', 'firm'].map(h => `<button data-hard="${h}" class="${d.hardness === h ? 'on' : ''}">${HARD()[h]}</button>`).join('')}</div>
      <div class="card stack" style="gap:10px">
        <div class="grid2" style="align-items:center"><div id="sole" style="max-width:140px;margin:0 auto">${soleSVG(d.zones, d.engraving)}</div><div class="stack" style="gap:6px"><span class="label">${L('Printed hardness zones', 'Gedruckte Härtezonen')}</span>${hardnessLegend()}</div></div>
        ${sl('heel', L('Heel', 'Ferse'))}${sl('mid', L('Midfoot', 'Mittelfuß'))}${sl('fore', L('Forefoot', 'Vorfuß'))}${sl('toes', L('Toes', 'Zehen'))}
        <span class="label">${L('3D-printed lattice (live)', '3D-gedrucktes Gitter (live)')}</span><canvas class="lattice" id="lattice"></canvas>
      </div>
      <button class="btn ghost" data-act="resetzones">${L('Reset to recommendation', 'Auf Empfehlung zurücksetzen')}</button>
      ${cta(contBtn())}`;
  },
  mount() {
    drawLattice(document.getElementById('lattice'), state.design.zones);
    app.querySelectorAll('[data-zone-sl]').forEach(sl => sl.addEventListener('input', () => {
      state.design.zones[sl.dataset.zoneSl] = +sl.value; state.design.touched = true; save();
      document.getElementById('z-' + sl.dataset.zoneSl).textContent = sl.value; refreshDesignLive();
    }));
  }
};
SCREENS.d_style = {
  html() {
    const d = state.design; if (!d.zones) d.zones = recommendedZones(d.hardness);
    const c = colorObj();
    return `${head(L('Make it yours', 'Mach ihn zu deinem'), L('Colour, upper and details.', 'Farbe, Obermaterial und Details.'))}
      <div class="heroshoe" style="position:relative">${shoePhoto(d.color)}<div class="between"><b>${state.lang === 'de' ? c.de : c.en} · ${d.texture}</b><span class="num" id="price" style="font-weight:900;font-size:20px">€${price().total}</span></div></div>
      <span class="label">${L('Colour', 'Farbe')}</span>
      <div class="swatches">${COLORS.map(k => `<button class="sw ${d.color === k.id ? 'on' : ''}" data-color="${k.id}" aria-label="${state.lang === 'de' ? k.de : k.en}" aria-pressed="${d.color === k.id}"><i style="background:conic-gradient(${k.accent} 0 50%, #111 0 100%)"></i></button>`).join('')}</div>
      <span class="label">${L('Upper', 'Obermaterial')}</span>
      <div class="grid2">${['Knit', 'Mesh'].map(t => `<button class="opt tile sm ${d.texture === t ? 'on' : ''}" data-tex="${t}"><span class="ot"><b>${t}</b><span>${t === 'Knit' ? L('Sock-like, flexible', 'Sockenartig, flexibel') : L('Breathable, light', 'Atmungsaktiv, leicht')}</span></span></button>`).join('')}</div>
      <span class="label">${L('Lacing', 'Schnürung')}</span>
      <div class="grid3">${[['standard', L('Classic', 'Klassisch'), L('included', 'inklusive')], ['speed', L('Speed', 'Schnell'), '+€12'], ['elastic', L('Elastic', 'Elastisch'), '+€8']].map(([v, l, p]) => `<button class="opt tile sm ${d.lacing === v ? 'on' : ''}" data-lace="${v}"><span class="ot"><b>${l}</b><span>${p}</span></span></button>`).join('')}</div>
      <details class="more" ${d.engraving ? 'open' : ''}><summary>${L('Engrave the sole (+€15)', 'Sohle gravieren (+15 €)')}</summary><div class="stack" style="gap:8px;padding-top:6px">
        <input class="text" id="engr" maxlength="8" value="${esc(d.engraving)}" placeholder="${L('up to 8 characters', 'bis zu 8 Zeichen')}" autocapitalize="characters">
        <div class="solewrap"><div class="sole3d" id="sole3d">${soleSVG(d.zones, d.engraving)}</div></div></div></details>
      <button class="opt" data-go="ar"><span class="oi">${ico('<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M7 15c2-1 4-1 6 0s4 1 4-1"/>', 22)}</span><span class="ot"><b>${L('Try it on (AR)', 'Anprobieren (AR)')}</b><span>${L('See the shoe on your own foot', 'Sieh den Schuh an deinem eigenen Fuß')}</span></span><span class="ock">›</span></button>
      ${cta(contBtn(L('Done: review my shoe', 'Fertig: Schuh prüfen')))}`;
  },
  mount() {
    const en = document.getElementById('engr');
    en.addEventListener('input', () => { en.value = en.value.toUpperCase().replace(/[^A-Z0-9 ÄÖÜ]/g, '').slice(0, 8); state.design.engraving = en.value.trim(); save(); refreshDesignLive(); });
  }
};
function refreshDesignLive() {
  const d = state.design;
  const s = document.getElementById('sole'); if (s) s.innerHTML = soleSVG(d.zones, d.engraving);
  const s3 = document.getElementById('sole3d'); if (s3) s3.innerHTML = soleSVG(d.zones, d.engraving);
  const cv = document.getElementById('lattice'); if (cv) drawLattice(cv, d.zones);
  const cs = document.getElementById('cscore'); if (cs) cs.textContent = comfortScore();
  const p = document.getElementById('price'); if (p) p.textContent = '€' + price().total;
}

/* ---------- AR (optional, from d_style) ---------- */
SCREENS.ar = {
  html() {
    const a = state.ar;
    return `${head(L('Try it on', 'Anprobieren'), L('Point the camera at your foot. Drag the shoe onto it, pinch to resize, twist to rotate.', 'Richte die Kamera auf deinen Fuß. Zieh den Schuh darauf, mit zwei Fingern Größe und Drehung ändern.'))}
      <div class="arstage" id="arstage">
        ${runtime.arPhoto ? `<img class="photo" src="${runtime.arPhoto}" alt="${L('Your photo', 'Dein Foto')}">` : `<video id="arvid" playsinline muted autoplay></video><canvas class="bg" id="arbg"></canvas>`}
        <span class="badge tl">AR</span>
        <div class="arshoe" id="arshoe" style="transform:translate(calc(-50% + ${a.x}px), calc(-50% + ${a.y}px)) rotate(${a.r}deg) scale(${a.s})"><img id="arimg" src="shoe-ar.png" alt="${L('Your custom shoe', 'Dein individueller Schuh')}" draggable="false" style="filter:${colorObj().filter};transform:scaleX(${a.f || 1})"></div>
      </div>
      <p class="small" id="arerr" hidden></p>
      <div class="slider"><span>${L('Size', 'Größe')}</span><input type="range" id="ars" min="0.4" max="2" step="0.01" value="${a.s}" aria-label="${L('Shoe size on screen', 'Schuhgröße am Bildschirm')}"><output></output></div>
      <div class="slider"><span>${L('Rotate', 'Drehen')}</span><input type="range" id="arr" min="-180" max="180" step="1" value="${a.r}" aria-label="${L('Rotation', 'Drehung')}"><output></output></div>
      <div class="grid3"><button class="btn secondary small" style="width:100%" data-act="arflip">⇋ ${L('Mirror', 'Spiegeln')}</button><button class="btn secondary small" style="width:100%" data-act="arsnap">◉ ${L('Snapshot', 'Foto')}</button><label class="btn secondary small" style="cursor:pointer;width:100%">⇪ ${L('Photo', 'Bild')}<input type="file" accept="image/*" class="visually-hidden" id="arfile"></label></div>
      ${cta(`<button class="btn primary" data-act="back">${L('Back to design', 'Zurück zum Design')}</button>`)}`;
  },
  async mount() {
    const stage = document.getElementById('arstage'), shoe = document.getElementById('arshoe'), a = state.ar;
    const apply = () => { shoe.style.transform = `translate(calc(-50% + ${a.x}px), calc(-50% + ${a.y}px)) rotate(${a.r}deg) scale(${a.s})`; };
    const pts = new Map(); let g0 = null;
    stage.addEventListener('pointerdown', e => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); g0 = snapshotGesture(); });
    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = snapshotGesture(); if (!g || !g0) return;
      if (g.n === 1 && g0.n === 1) { a.x = g0.ax + (g.cx - g0.cx); a.y = g0.ay + (g.cy - g0.cy); }
      if (g.n === 2 && g0.n === 2) { a.s = clamp(g0.as * g.d / g0.d, 0.4, 2); a.r = g0.ar + (g.ang - g0.ang) * 180 / Math.PI; }
      apply();
    });
    const up = e => { pts.delete(e.pointerId); g0 = snapshotGesture(); save(); };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    function snapshotGesture() { const v = [...pts.values()]; if (!v.length) return null; const cx = v.reduce((s, p) => s + p.x, 0) / v.length, cy = v.reduce((s, p) => s + p.y, 0) / v.length; const d = v.length > 1 ? Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) : 1; const ang = v.length > 1 ? Math.atan2(v[1].y - v[0].y, v[1].x - v[0].x) : 0; return { n: v.length, cx, cy, d, ang, ax: a.x, ay: a.y, as: a.s, ar: a.r }; }
    document.getElementById('ars').addEventListener('input', e => { a.s = +e.target.value; apply(); save(); });
    document.getElementById('arr').addEventListener('input', e => { a.r = +e.target.value; apply(); save(); });
    document.getElementById('arfile').addEventListener('change', e => { const f = e.target.files?.[0]; if (!f) return; runtime.arPhoto = URL.createObjectURL(f); stopStreams(); render(); });
    if (!runtime.arPhoto) {
      const bg = document.getElementById('arbg'); const ctx = bg.getContext('2d'); bg.width = 300; bg.height = 400;
      const gr = ctx.createLinearGradient(0, 0, 0, 400); gr.addColorStop(0, '#3a3836'); gr.addColorStop(1, '#1a1918'); ctx.fillStyle = gr; ctx.fillRect(0, 0, 300, 400);
      ctx.fillStyle = '#d6a98b'; ctx.beginPath(); ctx.moveTo(120, 0); ctx.lineTo(178, 0); ctx.lineTo(172, 230); ctx.bezierCurveTo(176, 300, 250, 320, 262, 350); ctx.bezierCurveTo(270, 372, 130, 375, 104, 350); ctx.bezierCurveTo(94, 320, 112, 260, 114, 230); ctx.closePath(); ctx.fill();
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (state.screen !== 'ar') { s.getTracks().forEach(t => t.stop()); return; }
        runtime.streams.push(s); const v = document.getElementById('arvid'); v.srcObject = s; await v.play().catch(() => {}); bg.style.display = 'none';
        logEvent('ar', { camera: true });
      } catch (e) { const er = document.getElementById('arerr'); if (!er) return; er.hidden = false; er.textContent = L('Camera not available: showing a sample view. Tap "Photo" to try it on your own foot.', 'Kamera nicht verfügbar: Beispielansicht. Mit „Bild“ kannst du deinen eigenen Fuß verwenden.'); logEvent('ar', { camera: false }); }
    }
  }
};
async function arSnapshot() {
  const stage = document.getElementById('arstage'); const r = stage.getBoundingClientRect();
  const c = document.createElement('canvas'); c.width = Math.round(r.width * 2); c.height = Math.round(r.height * 2); const x = c.getContext('2d'); x.scale(2, 2);
  const src = runtime.arPhoto ? stage.querySelector('img.photo') : (document.getElementById('arvid')?.videoWidth ? document.getElementById('arvid') : document.getElementById('arbg'));
  if (src) { const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height; const s = Math.max(r.width / sw, r.height / sh); x.drawImage(src, (r.width - sw * s) / 2, (r.height - sh * s) / 2, sw * s, sh * s); }
  const img = document.getElementById('arimg');
  if (!img.complete) await new Promise(res => { img.onload = res; img.onerror = res; });
  const a = state.ar; const w = r.width * 0.72, h = w * (img.naturalHeight || 453) / (img.naturalWidth || 651);
  x.save(); x.translate(r.width / 2 + a.x, r.height * 0.58 + a.y); x.rotate(a.r * Math.PI / 180); x.scale(a.s * (a.f || 1), a.s);
  const f = colorObj().filter; if (f !== 'none' && 'filter' in x) x.filter = f;
  x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 24; x.shadowOffsetY = 14;
  x.drawImage(img, -w / 2, -h / 2, w, h); x.restore();
  x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, r.height - 26, r.width, 26); x.fillStyle = '#d4ff00'; x.font = '700 12px Inter, sans-serif'; x.fillText('Nike Shoe Fit · ' + L('student prototype', 'Studentenprototyp'), 10, r.height - 9);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const file = new File([blob], 'my-custom-shoe.png', { type: 'image/png' });
  logEvent('ar-snapshot', {});
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Nike Shoe Fit' }); return; } catch (e) { /* cancelled */ } }
  download(blob, 'my-custom-shoe.png');
}

/* ---------- step 6: checkout + review ---------- */
SCREENS.checkout = {
  html() {
    const a = analysis(), sc = a.scan, d = state.design, pr = price(), c = colorObj();
    const ship = addBusinessDays(7);
    const uc = USECASES.find(x => x.id === state.usecase);
    return `${head(L('Your shoe at a glance', 'Dein Schuh auf einen Blick'), L('Check everything, then place your demo order.', 'Prüf alles, dann gib deine Demo-Bestellung auf.'))}
      <div class="card stack" style="gap:6px">
        <div class="row"><div style="width:84px;flex:none">${shoePhoto(d.color, 'height:62px;object-fit:cover')}</div><div><b>Custom Runner${state.nickname ? ` · ${esc(state.nickname)}` : ''}</b><div class="small">${state.lang === 'de' ? c.de : c.en} · ${d.texture}</div></div><span class="badge dim" style="margin-left:auto">1 ${L('pair', 'Paar')}</span></div>
        <div class="divider"></div>
        <div class="kv"><span>${L('Size', 'Größe')}</span><b>${sizeLabel(sc.eu)}</b></div>
        <div class="kv"><span>${L('Fit profile', 'Passprofil')}</span><b>${archLabel(sc.archType)} · ${strikeLabel(a.run.strike)}</b></div>
        <div class="kv"><span>${L('Hardness zones', 'Härtezonen')}</span><b class="num">${d.zones.heel} / ${d.zones.mid} / ${d.zones.fore} / ${d.zones.toes}</b></div>
        <div class="kv"><span>${L('Use case', 'Einsatz')}</span><b>${uc ? (state.lang === 'de' ? uc.de : uc.en) : '–'}</b></div>
        ${d.engraving ? `<div class="kv"><span>${L('Engraving', 'Gravur')}</span><b>${esc(d.engraving)}</b></div>` : ''}
      </div>
      <div class="grid2"><div class="card hl"><span class="label">${L('Comfort', 'Komfort')}</span><div class="score"><b style="font-size:40px">${comfortScore()}</b><span>/100</span></div></div><div class="card"><span class="label">${L('Fit accuracy', 'Passgenauigkeit')}</span><div class="score"><b style="font-size:40px;color:#fff">${fitAccuracy()}</b><span>%</span></div></div></div>
      <div class="card stack" style="gap:2px">${pr.items.map(([n, v]) => `<div class="kv"><span>${n}</span><b>€${v}</b></div>`).join('')}<div class="kv"><span>${L('Shipping', 'Versand')}</span><b>${L('Free', 'Kostenlos')}</b></div><div class="divider"></div><div class="price"><span class="label">${L('Total', 'Gesamt')}</span><span class="big">€${pr.total}</span></div></div>
      <div class="card trust">
        <div><span class="dot">✓</span><span><b>${L('Fit guarantee:', 'Passformgarantie:')}</b> ${L('free remake within 90 days', 'kostenlose Neuanfertigung innerhalb von 90 Tagen')}</span></div>
        <div><span class="dot">✓</span><span><b>${L('Delivery:', 'Lieferung:')}</b> ${fmtDate(ship)} ${L('(5 days printing + 2 days shipping)', '(5 Tage Druck + 2 Tage Versand)')}</span></div>
        <div><span class="dot">✓</span><span><b>${L('Take-back & recycling', 'Rücknahme & Recycling')}</b> ${L('of your old shoes', 'deiner alten Schuhe')}</span></div>
      </div>
      <p class="small" style="margin:0">${L('Demo checkout: no address, card or payment details are needed, and no money is charged.', 'Demo-Kasse: Keine Adresse, Karte oder Zahlungsdaten nötig, es wird nichts abgebucht.')}</p>
      ${cta(`<button class="btn primary" data-act="pay">${L('Place demo order', 'Demo-Bestellung aufgeben')} · €${pr.total}</button>`)}`;
  }
};
async function pay() {
  const bg = openSheet(`<div class="spinner"></div><h2 style="text-align:center">${L('Processing demo order…', 'Demo-Bestellung wird verarbeitet…')}</h2><p class="small" style="text-align:center">${L('No money is charged.', 'Es wird nichts abgebucht.')}</p>`);
  await sleep(1600);
  state.order = { id: 'NSF-' + Math.floor(100000 + Math.random() * 899999), at: Date.now(), total: price().total };
  save(); logEvent('order', { total: state.order.total }); bg.remove(); vibrate([20, 40, 20]); go('review');
}
SCREENS.review = {
  html() {
    const a = analysis(), sc = a.scan;
    const slides = [
      { vis: `<div style="width:56%">${pressureFoot('before', sc.archType)}</div>`, cap: L(`Your feet: ${archLabel(sc.archType).toLowerCase()} (${sc.archR} mm) and ${fmt(Math.abs(sc.lenR - sc.lenL))} cm length difference. Each side is printed separately.`, `Deine Füße: ${archLabel(sc.archType)} (${sc.archR} mm) und ${fmt(Math.abs(sc.lenR - sc.lenL))} cm Längenunterschied. Jede Seite wird einzeln gedruckt.`), sub: L('1 · Your feet', '1 · Deine Füße') },
      { vis: `<div style="font-size:64px;font-weight:900" class="volt num">${a.run.cadence}</div><div class="small">${L('steps per minute', 'Schritte pro Minute')}</div>`, cap: L(`Your stride: ${strikeLabel(a.run.strike).toLowerCase()} at ${a.run.cadence} steps per minute, so ${a.drop} mm drop.`, `Dein Laufstil: ${strikeLabel(a.run.strike)} bei ${a.run.cadence} Schritten pro Minute, daher ${a.drop} mm Sprengung.`), sub: L('2 · Your stride', '2 · Dein Laufstil') },
      { vis: `<div style="width:38%">${soleSVG(state.design.zones, state.design.engraving)}</div>`, cap: L(`Your sole: heel ${state.design.zones.heel}, midfoot ${state.design.zones.mid}, forefoot ${state.design.zones.fore}. Expected comfort ${comfortScore()}/100.`, `Deine Sohle: Ferse ${state.design.zones.heel}, Mittelfuß ${state.design.zones.mid}, Vorfuß ${state.design.zones.fore}. Erwarteter Komfort ${comfortScore()}/100.`), sub: L('3 · Ready to print', '3 · Bereit zum Druck') }
    ];
    local.slides = slides.length;
    return `${head(L('Final check before printing', 'Letzter Check vor dem Druck'), L('Checked by our AI and a running-gait expert.', 'Geprüft von unserer KI und einer Laufanalyse-Expertin.'), { back: false })}
      <div class="row"><div class="hero-logo" style="width:40px;height:40px;border-radius:50%;font-size:13px">MK</div><div><b style="font-size:14px">${L('M. Keller, gait specialist', 'M. Keller, Laufanalyse')}</b><div class="small">${L('+ AI fit engine · today', '+ KI-Passform · heute')}</div></div></div>
      <div class="slides" id="slides" aria-live="polite"><div class="sbars">${slides.map(() => '<span><i></i></span>').join('')}</div>
        ${slides.map((s, i) => `<div class="slide ${i === 0 ? 'on' : ''}" data-s="${i}"><div class="vis">${s.vis}</div><div class="cap">${s.cap}<small>${s.sub}</small></div></div>`).join('')}</div>
      <div class="grid2"><button class="btn secondary small" data-act="slideprev">‹ ${L('Back', 'Zurück')}</button><button class="btn secondary small" data-act="slidenext">${L('Next', 'Weiter')} ›</button></div>
      <div id="chat" class="chat" ${local.chat ? '' : 'hidden'}></div>
      <div id="qbtns" class="stack" ${local.chat ? '' : 'hidden'}></div>
      ${cta(`<button class="btn primary" data-act="approve">▶ ${L('Approve & start printing', 'Freigeben & Druck starten')}</button>
      <button class="btn ghost" data-act="question">${L('I have a question', 'Ich habe eine Frage')}</button>`)}`;
  },
  mount() {
    local.slide = 0; local.slideT0 = performance.now();
    const step = () => {
      if (!document.getElementById('slides')) return;
      const el = performance.now() - local.slideT0, dur = 5000;
      const bars = app.querySelectorAll('.sbars i');
      bars.forEach((b, i) => { b.style.width = i < local.slide ? '100%' : i === local.slide ? Math.min(100, el / dur * 100) + '%' : '0%'; });
      if (el > dur && local.slide < local.slides - 1) showSlide(local.slide + 1);
      runtime.raf.push(requestAnimationFrame(step));
    };
    runtime.raf.push(requestAnimationFrame(step));
  }
};
function showSlide(i) { local.slide = clamp(i, 0, local.slides - 1); local.slideT0 = performance.now(); app.querySelectorAll('.slide').forEach(s => s.classList.toggle('on', +s.dataset.s === local.slide)); }
const QA = () => [
  [L('Will the shoe really fit both feet?', 'Passt der Schuh wirklich an beide Füße?'), L('Yes. Each side is printed from its own scan, so your longer foot sets the size and the shorter one gets a slightly thicker insole.', 'Ja. Jede Seite wird nach ihrem eigenen Scan gedruckt. Der längere Fuß bestimmt die Größe, der kürzere bekommt eine etwas dickere Einlage.')],
  [L('What if it does not feel right?', 'Was, wenn er sich nicht gut anfühlt?'), L('Run in it for two weeks. One adjustment is free, and within 90 days we remake the shoe at no cost.', 'Lauf zwei Wochen darin. Eine Anpassung ist kostenlos, und innerhalb von 90 Tagen fertigen wir den Schuh kostenlos neu.')],
  [L('How long does printing take?', 'Wie lange dauert der Druck?'), L('About 5 business days: the TPU lattice midsole is printed in 4 hardness zones, then assembled and checked.', 'Etwa 5 Werktage: Die TPU-Gitter-Zwischensohle wird in 4 Härtezonen gedruckt, dann montiert und geprüft.')]
];
function openChat() {
  local.chat = true; const chat = document.getElementById('chat'), q = document.getElementById('qbtns'); chat.hidden = false; q.hidden = false;
  if (!chat.children.length) chat.innerHTML = `<div class="msg them">${L(`Hi ${nick()}! I reviewed your scan. What would you like to know?`, `Hallo ${nick()}! Ich habe deinen Scan geprüft. Was möchtest du wissen?`)}</div>`;
  q.innerHTML = QA().map(([qq], i) => `<button class="btn secondary small" style="width:100%" data-qa="${i}">${qq}</button>`).join('');
  logEvent('question-open', {});
  chat.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function askQA(i) {
  const [qq, aa] = QA()[i]; const chat = document.getElementById('chat');
  chat.insertAdjacentHTML('beforeend', `<div class="msg me">${qq}</div><div class="msg them" id="typing">…</div>`);
  state.review.questions.push(i); save(); logEvent('question', { i });
  await sleep(1100); const t = document.getElementById('typing'); if (t) { t.id = ''; t.textContent = aa; }
}

/* ---------- confirmation + tracker ---------- */
const TRACK = () => [
  { at: 0, t: L('Scan & order received', 'Scan & Bestellung erhalten'), d: L('Fit data locked in', 'Passformdaten übernommen') },
  { at: 4, t: L('Lattice generated', 'Gitter erzeugt'), d: L('184,000 cells in 4 hardness zones', '184.000 Zellen in 4 Härtezonen') },
  { at: 9, t: L('3D printing', '3D-Druck'), d: L('TPU lattice midsole, printed in our micro-factory', 'TPU-Gitter-Zwischensohle, gedruckt in unserer Mikrofabrik') },
  { at: 40, t: L('Quality check', 'Qualitätsprüfung'), d: L('Hardness and fit measured against your scan', 'Härte und Passform gegen deinen Scan geprüft') },
  { at: 48, t: L('Shipped', 'Versendet'), d: '' }
];
SCREENS.confirm = {
  html() {
    const o = state.order || { id: 'NSF-000000' };
    const ship = addBusinessDays(7, new Date(o.at || Date.now()));
    return `<h1 style="text-align:center;margin-top:6px">${L('Your shoe is being made', 'Dein Schuh entsteht')}</h1>
      <p class="sub" style="text-align:center;margin:0 auto">${L(`Order ${o.id}. Printed for ${possessive()} feet.`, `Bestellung ${o.id}. Gedruckt für ${possessive()} Füße.`)}</p>
      <div class="card"><div class="between" style="margin-bottom:10px"><span class="label">${L('Live production (time-lapse)', 'Live-Produktion (Zeitraffer)')}</span><span class="badge" id="printpct">0%</span></div><div class="tracker" id="tracker"></div></div>
      <div class="email"><div class="from">${L('Preview of your confirmation email (not sent)', 'Vorschau deiner Bestätigungs-E-Mail (nicht gesendet)')}</div><h4>${L(`Your custom shoe is on its way, ${state.nickname ? esc(state.nickname) : 'runner'}!`, `Dein individueller Schuh ist unterwegs, ${state.nickname ? esc(state.nickname) : 'Läufer:in'}!`)}</h4>
        <div>${L(`Order ${o.id} · ${sizeLabel(scanValues().eu)} · €${o.total || price().total}`, `Bestellung ${o.id} · ${sizeLabel(scanValues().eu)} · ${o.total || price().total} €`)}</div><div>${L('Expected delivery:', 'Voraussichtliche Lieferung:')} <b>${fmtDate(ship)}</b></div></div>
      <div class="card hl stack" style="gap:6px"><b>${L('Optional: 3 minutes of feedback?', 'Optional: 3 Minuten Feedback?')}</b><span class="small">${L('This is a student test. Your answers help our design sprint, but you can skip it.', 'Das ist ein Studierenden-Test. Deine Antworten helfen unserem Design Sprint, du kannst aber auch überspringen.')}</span></div>
      ${cta(`<button class="btn primary" data-go="survey">${L('Give feedback', 'Feedback geben')} ›</button><button class="btn ghost" data-act="skipsurvey">${L('Skip feedback', 'Feedback überspringen')}</button>`)}`;
  },
  mount() {
    if (!state.tracker.start) { state.tracker.start = Date.now(); save(); }
    const tick = () => {
      const el = (Date.now() - state.tracker.start) / 1000; const steps = TRACK(); const host = document.getElementById('tracker'); if (!host) return;
      const printing = clamp((el - 9) / 31, 0, 1);
      host.innerHTML = steps.map((s, i) => { const nx = steps[i + 1]; const done = nx ? el >= nx.at : el >= s.at; const now = !done && el >= s.at; return `<div class="tstep ${done ? 'done' : now ? 'now' : ''}"><i>${done ? '✓' : ''}</i><div><b>${s.t}${i === 2 && now ? ` · ${Math.round(printing * 100)}%` : ''}</b><span>${s.d}</span>${i === 2 && now ? `<div class="meter" style="margin-top:6px"><i style="width:${printing * 100}%"></i></div>` : ''}</div></div>`; }).join('');
      const pct = document.getElementById('printpct'); if (pct) pct.textContent = Math.round(clamp(el / 48, 0, 1) * 100) + '%';
    };
    tick(); const iv = setInterval(tick, 500); runtime.timers.push(iv);
  }
};

/* ---------- survey ---------- */
const SUS = () => [
  L('I would like to use an app like this regularly.', 'Ich würde so eine App gerne regelmäßig nutzen.'),
  L('The app felt more complicated than it needed to be.', 'Die App wirkte komplizierter als nötig.'),
  L('The app was easy to use.', 'Die App war einfach zu bedienen.'),
  L('I would need help from someone to use this app.', 'Ich bräuchte Hilfe, um diese App zu nutzen.'),
  L('The different parts of the app fit together well.', 'Die einzelnen Teile der App passen gut zusammen.'),
  L('Some parts of the app felt inconsistent.', 'Manche Teile der App wirkten uneinheitlich.'),
  L('Most people would learn this app quickly.', 'Die meisten Menschen würden diese App schnell lernen.'),
  L('The app was awkward to use.', 'Die App war umständlich zu bedienen.'),
  L('I felt confident while using the app.', 'Ich habe mich bei der Nutzung sicher gefühlt.'),
  L('I had to learn a lot before I could use the app.', 'Ich musste viel lernen, bevor ich die App nutzen konnte.')
];
const STEP_OPTIONS = () => [['landing', L('Intro page', 'Startseite')], ['profile', L('Profile questions', 'Profilfragen')], ['import', L('Data import', 'Datenimport')], ['video', L('Running video', 'Laufvideo')], ['scan', L('Foot scan', 'Fußscan')], ['analysis', L('AI analysis', 'KI-Analyse')], ['design', L('Design', 'Design')], ['ar', L('AR try-on', 'AR-Anprobe')], ['review', L('Final check', 'Letzter Check')], ['checkout', L('Order', 'Bestellung')]];
SCREENS.survey = {
  html() {
    const s = state.survey;
    const lik = (k, lo, hi) => `<div class="likert" role="group">${[1, 2, 3, 4, 5].map(n => `<button data-sv="${k}" data-v="${n}" class="${s[k] === n ? 'on' : ''}" aria-pressed="${s[k] === n}">${n}</button>`).join('')}</div><div class="ends"><span>${lo}</span><span>${hi}</span></div>`;
    const opts = STEP_OPTIONS().map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    return `${head(L('Your feedback', 'Dein Feedback'), L('Optional and anonymous, about 3–5 minutes.', 'Optional und anonym, etwa 3–5 Minuten.'))}
      <button class="btn secondary small" data-act="skipsurvey" style="align-self:flex-start">${L('Skip feedback ›', 'Feedback überspringen ›')}</button>
      <div class="q"><p>${L('I always knew which step I was in and what came next.', 'Ich wusste immer, in welchem Schritt ich bin und was als Nächstes kommt.')}</p>${lik('clarity', L('disagree', 'stimme nicht zu'), L('agree', 'stimme zu'))}</div>
      <div class="q"><p>${L('I understood why each step was useful for my shoe.', 'Ich habe verstanden, warum jeder Schritt für meinen Schuh nützlich war.')}</p>${lik('benefit_clear', L('disagree', 'stimme nicht zu'), L('agree', 'stimme zu'))}</div>
      <div class="q"><p>${L('How much do you trust that this shoe would fit you?', 'Wie sehr vertraust du darauf, dass dieser Schuh dir passt?')}</p>${lik('trust', L('not at all', 'gar nicht'), L('completely', 'völlig'))}</div>
      <div class="q"><p>${L('Did the foot scan feel real?', 'Wirkte der Fußscan echt?')}</p>${lik('scan_real', L('not at all', 'gar nicht'), L('very real', 'sehr echt'))}</div>
      <div class="q"><p>${L('Would you share your running data with such an app?', 'Würdest du deine Laufdaten mit so einer App teilen?')}</p><div class="seg">${[['yes', L('Yes', 'Ja')], ['depends', L('Depends', 'Kommt drauf an')], ['no', L('No', 'Nein')]].map(([v, l]) => `<button data-sv="share_data" data-v="${v}" class="${s.share_data === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="q"><p>${L('How much would you pay for this custom shoe?', 'Wie viel würdest du für diesen Schuh zahlen?')}</p><div class="slider" style="grid-template-columns:1fr 70px"><input type="range" min="0" max="400" step="10" id="wtp" value="${s.wtp_eur ?? 150}"><output id="wtpo" class="num">€${s.wtp_eur ?? 150}</output></div></div>
      <div class="q"><p>${L('Which step was most convincing?', 'Welcher Schritt hat dich am meisten überzeugt?')}</p><select class="text" id="conv"><option value="">–</option>${opts}</select></div>
      <div class="q"><p>${L('Which step was most confusing?', 'Welcher Schritt war am verwirrendsten?')}</p><select class="text" id="conf"><option value="">–</option>${opts}</select></div>
      <div class="q"><p>${L('Anything else? (optional)', 'Sonst noch etwas? (optional)')}</p><textarea class="text" id="comment" maxlength="800"></textarea></div>
      <h3 style="margin-top:8px">${L('Usability (10 statements)', 'Bedienbarkeit (10 Aussagen)')}</h3>
      ${SUS().map((q, i) => `<div class="q"><p>${i + 1}. ${q}</p>${lik('sus_' + (i + 1), L('strongly disagree', 'stimme gar nicht zu'), L('strongly agree', 'stimme voll zu'))}</div>`).join('')}
      <p class="small" id="serr" style="color:#ff8a70" hidden>${L('Please answer the rating questions marked 1–5.', 'Bitte beantworte die Bewertungsfragen 1–5.')}</p>
      <button class="btn primary" data-act="submit">${L('Send feedback', 'Feedback senden')}</button>
      <button class="btn ghost" data-act="skipsurvey">${L('Skip feedback', 'Feedback überspringen')}</button>`;
  },
  mount() {
    const s = state.survey;
    const w = document.getElementById('wtp'); w.addEventListener('input', () => { s.wtp_eur = +w.value; document.getElementById('wtpo').textContent = '€' + w.value; save(); });
    const conv = document.getElementById('conv'), conf = document.getElementById('conf'), com = document.getElementById('comment');
    conv.value = s.most_convincing || ''; conf.value = s.most_confusing || ''; com.value = s.comment || '';
    conv.addEventListener('change', () => { s.most_convincing = conv.value; save(); }); conf.addEventListener('change', () => { s.most_confusing = conf.value; save(); }); com.addEventListener('input', () => { s.comment = com.value; save(); });
  }
};
async function submitSurvey() {
  const s = state.survey;
  const need = ['clarity', 'benefit_clear', 'trust', 'scan_real', ...Array.from({ length: 10 }, (_, i) => 'sus_' + (i + 1))];
  if (need.some(k => !s[k])) { document.getElementById('serr').hidden = false; document.getElementById('serr').scrollIntoView({ block: 'center' }); return; }
  let sus = 0; for (let i = 1; i <= 10; i++) sus += i % 2 ? s['sus_' + i] - 1 : 5 - s['sus_' + i];
  sus = sus * 2.5;
  const log = state.log.map(e => ({ t: e.t - (state.log[0]?.t || 0), type: e.type, ...(e.from ? { from: e.from, to: e.to, ms: e.ms } : {}), ...(e.what ? { what: e.what } : {}), ...(e.mode ? { mode: e.mode } : {}), ...(e.n ? { n: e.n } : {}) }));
  const body = new URLSearchParams({ 'form-name': 'survey', app_version: 'v2', lang: state.lang, clarity: s.clarity, benefit_clear: s.benefit_clear, fit_accuracy: fitAccuracy(), trust: s.trust, scan_real: s.scan_real, share_data: s.share_data || '', wtp_eur: s.wtp_eur ?? 150, most_convincing: s.most_convincing || '', most_confusing: s.most_confusing || '', comment: s.comment || '', sus_score: sus, usecase: state.usecase || '', video_mode: state.video.skipped ? 'skipped' : (state.video.mode || 'none'), scan_source: state.facilitator.scanSource, event_log: JSON.stringify(log).slice(0, 9000) });
  for (let i = 1; i <= 10; i++) body.set('sus_' + i, s['sus_' + i]);
  let ok = false;
  try { const r = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }); ok = r.ok; } catch (e) { ok = false; }
  s.submitted = true; s.sent = ok; s.sus = sus; save(); logEvent('survey', { ok });
  go('thanks');
}

/* ---------- thanks + debrief ---------- */
SCREENS.thanks = {
  html() {
    const s = state.survey;
    return `<div class="hero-logo" style="margin:8px auto 0">♥</div>
      <h1 style="text-align:center">${L(`Thank you${state.nickname ? ', ' + esc(state.nickname) : ''}!`, `Danke${state.nickname ? ', ' + esc(state.nickname) : ''}!`)}</h1>
      <p class="sub" style="text-align:center;margin:0 auto">${s.skipped && !s.submitted ? L('No feedback was sent. That’s fine.', 'Es wurde kein Feedback gesendet. Das ist in Ordnung.') : s.sent ? L('Your anonymous feedback was sent.', 'Dein anonymes Feedback wurde gesendet.') : L('Your feedback is saved on this device. (The online form is only active on the Netlify site.)', 'Dein Feedback ist auf diesem Gerät gespeichert. (Das Online-Formular ist nur auf der Netlify-Seite aktiv.)')}</p>
      <div class="card stack">
        <h2>${L('Full transparency', 'Volle Transparenz')}</h2>
        <p class="small" style="color:#dcdce0;margin:0">${L('This was a student prototype for a design sprint at MCI Innsbruck. To test the idea, some parts were simulated:', 'Das war ein studentischer Prototyp für einen Design Sprint am MCI Innsbruck. Um die Idee zu testen, wurden manche Teile simuliert:')}</p>
        <ul class="bullets">
          <li><span class="dot">1</span><span>${L('The foot scan did not measure your feet. The 3D views are sample renders, and the measurements were generated from your profile.', 'Der Fußscan hat deine Füße nicht vermessen. Die 3D-Ansichten sind Beispielbilder, die Maße wurden aus deinem Profil erzeugt.')}</span></li>
          <li><span class="dot">2</span><span>${state.video.mode === 'pose' ? L('The running video was really analysed on your phone with pose detection.', 'Das Laufvideo wurde wirklich auf deinem Handy per Pose-Erkennung analysiert.') : L('The running analysis was estimated from your profile.', 'Die Laufanalyse wurde aus deinem Profil geschätzt.')}</span></li>
          <li><span class="dot">3</span><span>${L('The running-app connection, the "fit accuracy" percentage, the expert review and the production tracker were simulated. No order was placed and no money was charged.', 'Lauf-App-Verbindung, die Prozentzahl „Passgenauigkeit“, Experten-Prüfung und Produktions-Tracker waren simuliert. Es wurde nichts bestellt und nichts abgebucht.')}</span></li>
        </ul>
        <p class="small" style="margin:0">${L('Not affiliated with or endorsed by Nike or Strava.', 'Keine Verbindung zu Nike oder Strava.')}</p>
      </div>
      <div class="grow"></div>
      <button class="btn secondary" data-act="deleteall">${L('Delete my data from this device', 'Meine Daten von diesem Gerät löschen')}</button>
      <button class="btn ghost" data-act="restartall">${L('Start over', 'Neu starten')}</button>`;
  }
};

/* ===================== global events ===================== */
function pick(key, v, el) {
  const p = state.profile;
  switch (key) {
    case 'age': p.age = v; break;
    case 'sizeSys': p.sizeSys = v; break;
    case 'size': p.shoeEU = +v; break;
    case 'width': p.width = v; break;
    case 'runs': p.runsPerWeek = +v; break;
    case 'km': p.weeklyKm = +v; break;
    case 'longest': p.longestRun = +v; break;
    case 'pace': p.pace = v; break;
    case 'surf': toggleSurface(v); break;
    case 'goal': p.goal = v; break;
    case 'cushion': p.cushion = +v; break;
    case 'drop': p.drop = v; break;
    case 'shoekm': p.currentShoeKm = +v; break;
    case 'uc': { state.usecase = v; const uc = USECASES.find(u => u.id === v); state.design.hardness = uc.hard; state.design.zones = recommendedZones(uc.hard); logEvent('usecase', { uc: v }); break; }
    case 'mode': state.design.mode = v; if (v === 'rec') { state.design.zones = recommendedZones(state.design.hardness); } logEvent('design-mode', { what: v }); break;
  }
  save(); vibrate(8);
  if (key === 'size' && el) { app.querySelectorAll('.sizes button').forEach(b => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); return; }
  rerenderKeepScroll();
}

document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-go]');
  if (!t) return;
  if (t.closest('.scanfs')) return;
  if (t.closest('.sheet-bg')) return;
  if (t.dataset.go) { if (t.dataset.go === 'checkout' && !state.design.zones) state.design.zones = recommendedZones(state.design.hardness); go(t.dataset.go); return; }
  if (t.dataset.pick) { pick(t.dataset.pick, t.dataset.v, t); return; }
  if (t.dataset.layer) { state.design.layer = t.dataset.layer; save(); rerenderKeepScroll(); return; }
  if (t.dataset.hard) { state.design.hardness = t.dataset.hard; state.design.zones = recommendedZones(t.dataset.hard); save(); logEvent('hardness', { h: t.dataset.hard }); rerenderKeepScroll(); return; }
  if (t.dataset.tex) { state.design.texture = t.dataset.tex; save(); rerenderKeepScroll(); return; }
  if (t.dataset.color) { state.design.color = t.dataset.color; save(); rerenderKeepScroll(); return; }
  if (t.dataset.lace) { state.design.lacing = t.dataset.lace; save(); rerenderKeepScroll(); return; }
  if (t.dataset.sv) { const v = isNaN(+t.dataset.v) ? t.dataset.v : +t.dataset.v; state.survey[t.dataset.sv] = v; save(); t.parentElement.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b === t); b.setAttribute('aria-pressed', b === t); }); return; }
  if (t.dataset.qa) { askQA(+t.dataset.qa); return; }
  const act = t.dataset.act; if (!act) return;
  switch (act) {
    case 'logo': logoTap(); break;
    case 'lang': state.lang = state.lang === 'de' ? 'en' : 'de'; save(); render(); break;
    case 'menu': openMenu(); break;
    case 'fit': openFitInfo(); break;
    case 'back': back(); break;
    case 'next': if (!t.disabled) next(); break;
    case 'begin': logEvent('landing-cta', {}); if (state.consent) next(); else openConsent(); break;
    case 'inc': {
      const k = t.dataset.k, d = +t.dataset.d, p = state.profile; const lim = { weight: [40, 140], height: [140, 210] }[k];
      p[k] = clamp(p[k] + d, lim[0], lim[1]); save(); vibrate(5);
      document.getElementById('v-' + k).textContent = p[k]; const r = app.querySelector(`[data-num="${k}"]`); if (r) r.value = p[k]; break;
    }
    case 'connect': startImport(t.dataset.src); break;
    case 'disconnect': state.imported = null; save(); logEvent('import-remove', {}); go('p_train'); break;
    case 'manual': logEvent('skip', { what: 'import' }); next(); break;
    case 'record': go('video', { local: { mode: 'record' } }); break;
    case 'recstart': recordNow(); break;
    case 'skipvideo': logEvent('skip', { what: 'video' }); setVideo(null); state.video = { status: 'done', mode: 'simulated', metrics: simulatedRunMetrics(), skipped: true }; save(); go('done2'); break;
    case 'retake': logEvent('retake', { what: 'video' }); state.video = { status: 'none', mode: null, metrics: null }; setVideo(null); save(); go('v_intro', { back: true }); break;
    case 'ck': { local.ck = local.ck || {}; local.ck[t.dataset.k] = !local.ck[t.dataset.k]; vibrate(8); rerenderKeepScroll(); break; }
    case 'toscan': await askMotion(); if (state.device.webgl === null) await runChecks(); logEvent('scan-prep', { checked: Object.values(local.ck || {}).filter(Boolean).length }); next(); break;
    case 'scan': doScan(t.dataset.foot); break;
    case 'skipinsole': state.scan.skippedInsole = true; save(); logEvent('skip', { what: 'insole' }); render(); break;
    case 'reconstruct': local.view = 'recon'; render(); break;
    case 'rescan': logEvent('retake', { what: 'scan' }); state.scan = { right: false, left: false, insole: false, done: false, skippedInsole: false }; state.analysisSeen = false; save(); render(); break;
    case 'report': scanReport(); break;
    case 'skipload': clearInterval(local.loadIv); logEvent('skip', { what: 'analysis-animation' }); finishLoad(); break;
    case 'resetzones': state.design.zones = recommendedZones(state.design.hardness); save(); rerenderKeepScroll(); break;
    case 'arsnap': arSnapshot(); break;
    case 'arflip': { state.ar.f = (state.ar.f || 1) * -1; save(); const im = document.getElementById('arimg'); if (im) im.style.transform = `scaleX(${state.ar.f})`; logEvent('ar-flip', {}); break; }
    case 'pay': pay(); break;
    case 'slidenext': showSlide(local.slide + 1); break;
    case 'slideprev': showSlide(local.slide - 1); break;
    case 'question': openChat(); break;
    case 'approve': state.review.approved = true; state.tracker.start = 0; save(); logEvent('approve', {}); vibrate([30, 50, 30]); next(); break;
    case 'submit': submitSurvey(); break;
    case 'skipsurvey': state.survey.skipped = true; save(); logEvent('skip', { what: 'survey' }); go('thanks'); break;
    case 'deleteall': if (t.dataset.confirm) { cleanup(); resetAll(); render(); toast(L('Your data was deleted', 'Deine Daten wurden gelöscht')); } else { t.dataset.confirm = 1; t.textContent = L('Tap again to delete', 'Nochmals tippen zum Löschen'); } break;
    case 'restartall': cleanup(); { const lang = state.lang; resetAll(); state.lang = lang; save(); } render(); break;
  }
});

// range sliders under the −/+ steppers
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset || !el.dataset.num) return;
  const k = el.dataset.num; state.profile[k] = +el.value; save();
  const v = document.getElementById('v-' + k); if (v) v.textContent = el.value;
});

/* ===================== boot ===================== */
if (!state.consent && state.screen !== 'landing') state.screen = 'landing';
if (!SCREENS[state.screen]) state.screen = state.consent ? 'p_body' : 'landing';
if (state.screen === 'video' && state.video.status !== 'done') state.screen = 'v_intro';
if (state.screen.startsWith('done')) { const n = +state.screen.slice(4); state.screen = FLOW[FLOW.indexOf(state.screen) + 1] || state.screen; if (n === 1) state.flags.profile = true; if (n === 5) state.flags.design = true; }
state.stepEnter = Date.now();
render();
if (state.consent && !['landing', 'p_body'].includes(state.screen)) toast(L('Welcome back – you can continue where you left off', 'Willkommen zurück – du kannst dort weitermachen, wo du warst'));
