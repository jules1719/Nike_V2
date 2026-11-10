// Reusable visual building blocks (SVG and canvas). No state changes here.
import { L, esc, fmt } from './util.js';
import { COLORS } from './data.js';

export function shoePhoto(colorId, style = '') {
  const c = COLORS.find(k => k.id === colorId) || COLORS[0];
  return `<img class="shoe" src="shoe.jpg" alt="${esc(L('Custom running shoe', 'Individueller Laufschuh'))}, ${esc(L(c.en, c.de))}" style="filter:${c.filter};${style}" draggable="false">`;
}

// Transparent side-view shoe used for the AR overlay.
export function shoeSVG(colorId, texture = 'Knit') {
  const c = COLORS.find(k => k.id === colorId) || COLORS[0];
  const id = 'p' + Math.random().toString(36).slice(2, 7);
  const pat = texture === 'Mesh'
    ? `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.3" fill="rgba(255,255,255,.25)"/></pattern>`
    : `<pattern id="${id}" width="10" height="6" patternUnits="userSpaceOnUse"><path d="M0 5 L2.5 1 L5 5 L7.5 1 L10 5" fill="none" stroke="rgba(255,255,255,.2)"/></pattern>`;
  return `<svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(L('Shoe preview', 'Schuhvorschau'))}">
    <defs>${pat}<linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#b9b9be"/></linearGradient></defs>
    <path d="M18 116 C40 127 252 129 284 116 L286 123 C252 137 40 135 16 123 Z" fill="#141414"/>
    <path d="M14 96 C10 110 20 119 40 120 L270 120 C285 120 292 111 290 100 C288 92 280 90 270 92 L60 96 C40 97 22 92 14 96 Z" fill="url(#${id}m)"/>
    <path d="M16 96 C14 74 30 62 52 58 C70 55 86 48 100 34 C112 22 128 20 140 28 L160 44 C180 56 205 62 232 70 C258 77 282 84 288 98 L270 94 L60 98 C40 99 24 98 16 96 Z" fill="#1b1b1e"/>
    <path d="M16 96 C14 74 30 62 52 58 C70 55 86 48 100 34 C112 22 128 20 140 28 L160 44 C180 56 205 62 232 70 C258 77 282 84 288 98 L270 94 L60 98 C40 99 24 98 16 96 Z" fill="url(#${id})"/>
    <path d="M100 34 C112 22 128 20 140 28 C128 33 112 37 100 34 Z" fill="${c.accent}"/>
    <path d="M68 88 C120 80 175 70 236 78" stroke="${c.accent}" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M40 112 C110 114 200 113 270 108" stroke="${c.accent}" stroke-width="3" fill="none"/>
    <g stroke="#e9e9e9" stroke-width="3" stroke-linecap="round"><line x1="148" y1="40" x2="140" y2="52"/><line x1="160" y1="46" x2="152" y2="58"/><line x1="172" y1="52" x2="164" y2="64"/><line x1="184" y1="57" x2="177" y2="69"/><line x1="196" y1="61" x2="190" y2="72"/></g>
  </svg>`;
}

const WT = [[0, 0.02], [0.015, 0.36], [0.05, 0.56], [0.14, 0.655], [0.3, 0.61], [0.45, 0.67], [0.62, 0.88], [0.72, 1.0], [0.82, 0.97], [0.9, 0.84], [0.96, 0.6], [0.99, 0.3], [1, 0.02]];
function wAt(t) { for (let i = 1; i < WT.length; i++) if (t <= WT[i][0]) { const [a, va] = WT[i - 1], [b, vb] = WT[i]; const u = (t - a) / (b - a); return va + (vb - va) * u * u * (3 - 2 * u); } return 0; }

// Footprint outline path (top view), toes up. box: x, y (top), w, h. mirror for left foot.
export function footPath(x, y, w, h, mirror = false, heelRatio = 0.655) {
  const pts = [];
  const hr = heelRatio / 0.655;
  const hw = t => { let v = wAt(t) * w / 2; if (t < 0.32) v *= 1 + (hr - 1) * (1 - t / 0.32); return v; };
  const cx = x + w / 2;
  const drift = t => -0.06 * w * Math.max(0, (t - 0.55) / 0.45) * (mirror ? -1 : 1);
  for (let i = 0; i <= 50; i++) { const t = i / 50; pts.push([cx + (mirror ? -1 : 1) * hw(t) + drift(t), y + h - t * h]); }
  for (let i = 50; i >= 0; i--) { const t = i / 50; pts.push([cx - (mirror ? -1 : 1) * hw(t) + drift(t), y + h - t * h]); }
  return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' Z';
}

// Measurement drawing: top view of both feet with dimension lines + side view with arch and instep.
export function measureSVG(sc) {
  const scale = 7.4; // px per cm
  const hR = sc.lenR * scale, hL = sc.lenL * scale, wR = sc.ballW * scale, wL = sc.ballWL * scale;
  const top = 26, base = top + Math.max(hR, hL);
  const xL = 50, xR = 190;
  const dim = (x1, y1, x2, y2, label, vertical) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return `<g stroke="#d4ff00" stroke-width="1.2"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
      ${vertical ? `<line x1="${x1 - 5}" y1="${y1}" x2="${x1 + 5}" y2="${y1}"/><line x1="${x2 - 5}" y1="${y2}" x2="${x2 + 5}" y2="${y2}"/>` : `<line x1="${x1}" y1="${y1 - 5}" x2="${x1}" y2="${y1 + 5}"/><line x1="${x2}" y1="${y2 - 5}" x2="${x2}" y2="${y2 + 5}"/>`}</g>
      <text x="${vertical ? mx + 8 : mx}" y="${vertical ? my : my - 7}" fill="#d4ff00" font-size="11" font-weight="700" text-anchor="${vertical ? 'start' : 'middle'}" ${vertical ? `transform="rotate(-90 ${mx + 8} ${my})"` : ''}>${label}</text>`;
  };
  const ballY = (len, h) => top + (Math.max(hR, hL) - h) + h * (1 - 0.72);
  const heelY = (h) => top + (Math.max(hR, hL) - h) + h * (1 - 0.14);
  const sv = 300, svTop = base + 34;
  const sideLen = sc.lenR * 9.2, sx = (sv - sideLen) / 2 + 10, sy = svTop + 70;
  const arch = sc.archR * 0.9, inst = sc.instep * 9.2;
  return `<svg class="measure" viewBox="0 0 ${sv} ${svTop + 100}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(L('Foot measurements', 'Fußmaße'))}">
    <text x="${xL + 30}" y="14" fill="#9a9aa1" font-size="11" text-anchor="middle">${L('LEFT', 'LINKS')}</text>
    <text x="${xR + 30}" y="14" fill="#9a9aa1" font-size="11" text-anchor="middle">${L('RIGHT', 'RECHTS')}</text>
    <path d="${footPath(xL, top + (Math.max(hR, hL) - hL), wL, hL, true)}" fill="rgba(212,255,0,.08)" stroke="#d4ff00" stroke-width="1.5"/>
    <path d="${footPath(xR, top + (Math.max(hR, hL) - hR), wR, hR, false)}" fill="rgba(212,255,0,.08)" stroke="#d4ff00" stroke-width="1.5"/>
    ${dim(xL - 14, top + (Math.max(hR, hL) - hL), xL - 14, base, fmt(sc.lenL) + ' cm', true)}
    ${dim(xR + wR + 14, top + (Math.max(hR, hL) - hR), xR + wR + 14, base, fmt(sc.lenR) + ' cm', true)}
    ${dim(xR, ballY(sc.lenR, hR), xR + wR, ballY(sc.lenR, hR), fmt(sc.ballW) + ' cm')}
    ${dim(xR + wR / 2 - sc.heelW * scale / 2, heelY(hR), xR + wR / 2 + sc.heelW * scale / 2, heelY(hR), fmt(sc.heelW) + ' cm')}
    ${dim(xL, ballY(sc.lenL, hL), xL + wL, ballY(sc.lenL, hL), fmt(sc.ballWL) + ' cm')}
    <text x="10" y="${svTop + 6}" fill="#9a9aa1" font-size="11">${L('RIGHT FOOT · SIDE VIEW (INNER)', 'RECHTER FUSS · SEITE (INNEN)')}</text>
    <path d="M${sx} ${sy} C${sx - 6} ${sy - 30} ${sx + 8} ${sy - inst * 0.7} ${sx + sideLen * 0.12} ${sy - inst * 0.72} C${sx + sideLen * 0.3} ${sy - inst} ${sx + sideLen * 0.42} ${sy - inst} ${sx + sideLen * 0.55} ${sy - inst * 0.75} C${sx + sideLen * 0.75} ${sy - inst * 0.42} ${sx + sideLen * 0.93} ${sy - 18} ${sx + sideLen} ${sy - 8} C${sx + sideLen + 4} ${sy} ${sx + sideLen - 6} ${sy} ${sx + sideLen * 0.8} ${sy} C${sx + sideLen * 0.62} ${sy} ${sx + sideLen * 0.58} ${sy - arch} ${sx + sideLen * 0.45} ${sy - arch} C${sx + sideLen * 0.32} ${sy - arch} ${sx + sideLen * 0.26} ${sy} ${sx + sideLen * 0.12} ${sy} Z"
      fill="rgba(212,255,0,.08)" stroke="#d4ff00" stroke-width="1.5"/>
    <line x1="${sx - 4}" y1="${sy}" x2="${sx + sideLen + 6}" y2="${sy}" stroke="#4a5e14"/>
    ${dim(sx + sideLen * 0.45, sy, sx + sideLen * 0.45, sy - arch, sc.archR + ' mm', true)}
    ${dim(sx + sideLen * 0.36, sy, sx + sideLen * 0.36, sy - inst * 0.98, fmt(sc.instep) + ' cm', true)}
  </svg>`;
}

// Pressure footprint (top view) for the before/after comparison.
export function pressureFoot(kind, archType) {
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  const before = kind === 'before';
  const flat = archType === 'Flat foot';
  const spots = before
    ? [[60, 172, 30, 1], [44, 70, 22, 0.95], [82, 64, 18, 0.7], [52, 30, 12, 0.85], [64, 118, flat ? 22 : 10, flat ? 0.7 : 0.25]]
    : [[60, 168, 34, 0.55], [50, 70, 30, 0.5], [76, 66, 26, 0.45], [56, 30, 14, 0.4], [62, 118, 24, 0.42]];
  return `<svg viewBox="0 0 120 210" width="100%" style="max-width:130px" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${before ? L('Pressure in your current shoe', 'Druck im aktuellen Schuh') : L('Pressure in your custom shoe', 'Druck im individuellen Schuh')}">
    <defs>
      <clipPath id="${id}c"><path d="${footPath(20, 8, 80, 194, false)}"/></clipPath>
      <radialGradient id="${id}r"><stop offset="0" stop-color="#ff3b1f"/><stop offset=".45" stop-color="#ffb020" stop-opacity=".85"/><stop offset="1" stop-color="#d4ff00" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}v"><stop offset="0" stop-color="#d4ff00"/><stop offset="1" stop-color="#d4ff00" stop-opacity="0"/></radialGradient>
    </defs>
    <path d="${footPath(20, 8, 80, 194, false)}" fill="#14190a" stroke="#4a5e14"/>
    <g clip-path="url(#${id}c)">${spots.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id}${before ? 'r' : 'v'})" opacity="${o}"><animate attributeName="opacity" values="${o};${o * 0.75};${o}" dur="2.4s" repeatCount="indefinite"/></circle>`).join('')}</g>
  </svg>`;
}

// Comfort body map: right leg + foot sole.
export function bodyMap(selected) {
  const z = (id, el) => `<g class="zone ${selected.includes(id) ? 'on' : ''}" data-zone="${id}" role="button" tabindex="0" aria-pressed="${selected.includes(id)}" aria-label="${zoneLabel(id)}">${el}</g>`;
  return `<div class="bodymap">
    <svg viewBox="0 0 120 230" xmlns="http://www.w3.org/2000/svg">
      <path d="M44 6 L76 6 L74 70 L72 120 L70 175 L74 205 L96 214 L98 224 L40 224 L42 205 L46 175 L44 120 L42 70 Z" fill="#141416" stroke="#3a3a40"/>
      ${z('knee', '<ellipse class="zone" cx="59" cy="78" rx="17" ry="14"/>')}
      ${z('shin', '<rect class="zone" x="46" y="98" width="26" height="70" rx="10"/>')}
      ${z('achilles', '<rect class="zone" x="40" y="172" width="16" height="34" rx="7"/>')}
      <text x="60" y="54" fill="#6f6f76" font-size="9" text-anchor="middle">${L('tap', 'tippen')}</text>
    </svg>
    <svg viewBox="0 0 120 230" xmlns="http://www.w3.org/2000/svg">
      <path d="${footPath(20, 10, 80, 210, false)}" fill="#141416" stroke="#3a3a40"/>
      ${z('toes', '<rect class="zone" x="24" y="10" width="70" height="38" rx="16"/>')}
      ${z('ball', '<rect class="zone" x="20" y="52" width="80" height="40" rx="14"/>')}
      ${z('arch', '<rect class="zone" x="26" y="96" width="40" height="60" rx="14"/>')}
      ${z('heel', '<ellipse class="zone" cx="60" cy="188" rx="28" ry="26"/>')}
    </svg>
  </div>`;
}
export function zoneLabel(id) {
  return { knee: L('Knee', 'Knie'), shin: L('Shin', 'Schienbein'), achilles: L('Achilles tendon', 'Achillessehne'), toes: L('Toes', 'Zehen'), ball: L('Ball of the foot', 'Fußballen'), arch: L('Arch', 'Fußgewölbe'), heel: L('Heel', 'Ferse') }[id] || id;
}

export function barChart(values) {
  const max = Math.max(...values, 1);
  return `<div class="bars" aria-label="${L('Weekly kilometres, last 12 weeks', 'Wochenkilometer, letzte 12 Wochen')}">${values.map(v => `<i style="height:${Math.max(3, (v / max) * 100)}%" title="${fmt(v)} km"></i>`).join('')}</div>`;
}

// Sole (bottom view) with four hardness zones and optional engraving.
export function soleSVG(zones, engraving = '', accent = '#d4ff00') {
  const col = v => { const t = (v - 10) / 88; const r = Math.round(40 + 215 * t), g = Math.round(200 - 120 * t), b = Math.round(255 - 230 * t); return `rgb(${r},${g},${b})`; };
  const id = 's' + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 120 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${L('Sole with hardness zones', 'Sohle mit Härtezonen')}">
    <defs><clipPath id="${id}"><path d="${footPath(16, 6, 88, 228, false)}"/></clipPath></defs>
    <g clip-path="url(#${id})">
      <rect x="0" y="0" width="120" height="44" fill="${col(zones.toes)}"/>
      <rect x="0" y="44" width="120" height="58" fill="${col(zones.fore)}"/>
      <rect x="0" y="102" width="120" height="70" fill="${col(zones.mid)}"/>
      <rect x="0" y="172" width="120" height="70" fill="${col(zones.heel)}"/>
      <g stroke="rgba(0,0,0,.35)" stroke-width="1">${Array.from({ length: 22 }, (_, i) => `<line x1="0" y1="${i * 11}" x2="120" y2="${i * 11 + 8}"/>`).join('')}</g>
    </g>
    <path d="${footPath(16, 6, 88, 228, false)}" fill="none" stroke="#111" stroke-width="2"/>
    ${engraving ? `<text x="60" y="140" fill="#111" font-size="11" font-weight="900" text-anchor="middle" letter-spacing="1.5" transform="rotate(-90 60 140)" opacity=".75">${esc(engraving.toUpperCase())}</text>` : ''}
  </svg>`;
}
export function hardnessLegend() {
  return `<div class="between small"><span>${L('soft', 'weich')}</span><span style="flex:1;height:8px;border-radius:4px;margin:0 8px;background:linear-gradient(90deg,rgb(40,200,255),rgb(148,140,140),rgb(255,80,25))"></span><span>${L('firm', 'fest')}</span></div>`;
}

// Additive-manufacturing lattice preview: density follows cushioning values (higher = firmer = denser).
export function drawLattice(canvas, zones) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 110;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const parts = [['heel', zones.heel], ['mid', zones.mid], ['fore', zones.fore], ['toes', zones.toes]];
  const segW = w / 4;
  parts.forEach(([k, v], i) => {
    const cell = 26 - (v / 100) * 16;
    ctx.strokeStyle = 'rgba(212,255,0,.75)'; ctx.lineWidth = 1;
    ctx.save(); ctx.beginPath(); ctx.rect(i * segW, 8, segW, h - 24); ctx.clip();
    for (let x = i * segW - cell; x < (i + 1) * segW + cell; x += cell) {
      for (let y = 8; y < h; y += cell) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cell, y + cell); ctx.moveTo(x + cell, y); ctx.lineTo(x, y + cell); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.fillStyle = '#9a9aa1'; ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText({ heel: L('HEEL', 'FERSE'), mid: L('MIDFOOT', 'MITTELFUSS'), fore: L('FOREFOOT', 'VORFUSS'), toes: L('TOES', 'ZEHEN') }[k], i * segW + segW / 2, h - 5);
  });
}
