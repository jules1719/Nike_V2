// Simulated LiDAR-style foot scan on top of the live camera feed (or a generated fallback background).
// Nothing is measured: the point cloud and mesh are drawn from a foot-shaped template.
import { state, runtime, rng, seed, vibrate, beep, reducedMotion, L } from './util.js';

const WT = [[0, 0.02], [0.015, 0.36], [0.05, 0.56], [0.14, 0.655], [0.3, 0.61], [0.45, 0.67], [0.62, 0.88], [0.72, 1.0], [0.82, 0.97], [0.9, 0.84], [0.96, 0.6], [0.99, 0.3], [1, 0.02]];
function wAt(t) {
  if (t <= 0) return WT[0][1];
  for (let i = 1; i < WT.length; i++) if (t <= WT[i][0]) { const [a, va] = WT[i - 1], [b, vb] = WT[i]; const u = (t - a) / (b - a); return va + (vb - va) * u * u * (3 - 2 * u); }
  return 0;
}

export function runScan({ foot = 'right', step = '1 / 3', lite = false, source = 'camera' }) {
  return new Promise(resolve => {
    const root = document.getElementById('overlay-root');
    const wrap = document.createElement('div');
    wrap.className = 'scanfs';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', L('Foot scan', 'Fußscan'));
    const titles = { right: L('Right foot', 'Rechter Fuß'), left: L('Left foot', 'Linker Fuß'), insole: L('Insole of your current shoe', 'Einlegesohle deines aktuellen Schuhs') };
    wrap.innerHTML = `
      <canvas class="bgc"></canvas><video playsinline muted autoplay></video><canvas class="ov"></canvas>
      <div class="scanhud">
        <div class="top">
          <div class="title">${titles[foot]}<small>${L('Scan', 'Scan')} ${step}</small></div>
          <div class="row">
            <button class="iconbtn" data-x="mute" aria-label="${L('Sound on/off', 'Ton an/aus')}">${state.muted ? '🔇' : '🔊'}</button>
            <button class="iconbtn" data-x="cancel" aria-label="${L('Cancel scan', 'Scan abbrechen')}">✕</button>
          </div>
        </div>
        <div class="stack" style="gap:12px">
          <div class="prompt" aria-live="polite"></div>
          <div style="height:110px"></div>
          <div class="framecount"></div>
          <div class="qchips"><span data-q="light">${L('Light', 'Licht')} …</span><span data-q="dist">${L('Distance', 'Abstand')} …</span><span data-q="stab">${L('Stability', 'Stabilität')} …</span></div>
        </div>
      </div>`;
    root.appendChild(wrap);
    const video = wrap.querySelector('video');
    const bgc = wrap.querySelector('canvas.bgc');
    const ov = wrap.querySelector('canvas.ov');
    const ctx = ov.getContext('2d'), bctx = bgc.getContext('2d');
    const promptEl = wrap.querySelector('.prompt'), countEl = wrap.querySelector('.framecount');
    const chip = k => wrap.querySelector(`[data-q="${k}"]`);
    const setChip = (k, txt, cls) => { const c = chip(k); c.textContent = txt; c.className = cls || ''; };

    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() { W = window.innerWidth; H = window.innerHeight; for (const c of [ov, bgc]) { c.width = W * dpr; c.height = H * dpr; } ctx.setTransform(dpr, 0, 0, dpr, 0, 0); bctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size(); window.addEventListener('resize', size);

    let stream = null, usingCamera = false;
    async function startCam() {
      if (source !== 'camera' || !navigator.mediaDevices?.getUserMedia) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        runtime.streams.push(stream);
        video.srcObject = stream; await video.play().catch(() => {});
        usingCamera = true;
      } catch (e) { usingCamera = false; video.style.display = 'none'; }
    }
    startCam();

    // motion tracking (optional)
    let motionAcc = 0, lastOri = null, motionSeen = false, tooFastUntil = 0;
    function onOri(e) {
      if (e.alpha == null && e.beta == null) return;
      motionSeen = true;
      if (lastOri) {
        let da = Math.abs((e.alpha || 0) - lastOri.a); if (da > 180) da = 360 - da;
        const d = da + Math.abs((e.beta || 0) - lastOri.b) + Math.abs((e.gamma || 0) - lastOri.g);
        motionAcc += Math.min(d, 8);
        if (d > 9 && phase === 'capture') tooFastUntil = performance.now() + 1200;
      }
      lastOri = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
    }
    window.addEventListener('deviceorientation', onOri);

    // geometry of the "detected" sheet and foot
    function sheetRect() {
      const sw = Math.min(W * 0.66, H * 0.4), sh = sw * 1.414;
      return { x: W / 2 - sw / 2, y: H * 0.47 - sh / 2, w: sw, h: sh };
    }
    const mirror = foot === 'left';
    const isInsole = foot === 'insole';
    function footPt(t, u, r) { // t: 0 heel (bottom) .. 1 toe (top); u: -1..1 across
      const fl = r.h * 0.84, fw = r.w * (isInsole ? 0.56 : 0.6);
      const cx = r.x + r.w / 2, cy0 = r.y + r.h * 0.92;
      const hw = wAt(t) * fw / 2;
      const drift = -0.06 * fw * Math.max(0, (t - 0.55) / 0.45) * (mirror ? -1 : 1);
      return { x: cx + (mirror ? -u : u) * hw + drift, y: cy0 - t * fl };
    }

    const R = rng(seed('scanfx|' + foot));
    const MAXP = lite || reducedMotion() ? 1800 : 6000;
    const pts = [];
    const segN = isInsole ? 4 : 8;
    const segNames = isInsole
      ? [L('Hold still: top view', 'Ruhig halten: Draufsicht'), L('Tilt slightly left', 'Leicht nach links kippen'), L('Tilt slightly right', 'Leicht nach rechts kippen'), L('Back to top view', 'Zurück zur Draufsicht')]
      : [L('Top view: hold still', 'Draufsicht: ruhig halten'), L('Move slowly to the inner side', 'Langsam zur Innenseite'), L('Now towards the toes', 'Jetzt Richtung Zehen'), L('Move to the outer side', 'Zur Außenseite bewegen'), L('Lower the phone, outer side', 'Handy tiefer, Außenseite'), L('Move around to the heel', 'Um die Ferse herum'), L('Heel: hold still', 'Ferse: ruhig halten'), L('Back to top view', 'Zurück zur Draufsicht')];
    const glitchSeg = 2 + Math.floor(R() * (segN - 3));
    let phase = 'search', t0 = performance.now(), segDone = 0, segStart = 0, segMotion0 = 0, glitchShown = false, finished = false;
    let reticle = { x: W / 2, y: H / 2, w: 120, h: 170 }, retTarget = { ...reticle }, nextWander = 0;
    let lightOK = true, lightCheckAt = 0;
    const sample = document.createElement('canvas'); sample.width = sample.height = 16; const sctx = sample.getContext('2d', { willReadFrequently: true });

    function drawFallbackBg(now) {
      const r = sheetRect();
      const shake = Math.sin(now / 420) * 1.5;
      const g = bctx.createRadialGradient(W / 2, H * 0.5, 20, W / 2, H * 0.5, Math.max(W, H) * 0.8);
      g.addColorStop(0, '#5b5650'); g.addColorStop(1, '#1d1b19');
      bctx.fillStyle = g; bctx.fillRect(0, 0, W, H);
      bctx.save(); bctx.translate(shake, -shake * 0.6);
      bctx.fillStyle = '#ecebe6'; bctx.fillRect(r.x, r.y, r.w, r.h);
      if (!isInsole) {
        bctx.fillStyle = '#d6a98b'; bctx.beginPath();
        for (let i = 0; i <= 40; i++) { const p = footPt(i / 40, 1, r); i ? bctx.lineTo(p.x, p.y) : bctx.moveTo(p.x, p.y); }
        for (let i = 40; i >= 0; i--) { const p = footPt(i / 40, -1, r); bctx.lineTo(p.x, p.y); }
        bctx.fill();
        bctx.fillStyle = 'rgba(120,70,50,.25)';
        for (let i = 0; i < 5; i++) { const p = footPt(0.86 + i * 0.002, (-0.75 + i * 0.37) * (mirror ? -1 : 1) * -1, r); bctx.beginPath(); bctx.arc(p.x, p.y - 8, i ? 6 : 9, 0, Math.PI * 2); bctx.fill(); }
      } else {
        bctx.fillStyle = '#3a3a3e'; bctx.beginPath();
        for (let i = 0; i <= 40; i++) { const p = footPt(i / 40, 1, r); i ? bctx.lineTo(p.x, p.y) : bctx.moveTo(p.x, p.y); }
        for (let i = 40; i >= 0; i--) { const p = footPt(i / 40, -1, r); bctx.lineTo(p.x, p.y); }
        bctx.fill();
      }
      bctx.restore();
      // sensor noise
      bctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 40; i++) bctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }

    function brackets(r, color, len = 26, lw = 4) {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
      const c = [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]];
      for (const [x, y, sx, sy] of c) { ctx.beginPath(); ctx.moveTo(x + sx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * len); ctx.stroke(); }
    }

    function drawOrbit(now) {
      const cx = W / 2, cy = H - 170 - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0), rad = 44;
      ctx.lineWidth = 7; ctx.lineCap = 'butt';
      for (let i = 0; i < segN; i++) {
        const a0 = -Math.PI / 2 + (i / segN) * Math.PI * 2 + 0.06, a1 = -Math.PI / 2 + ((i + 1) / segN) * Math.PI * 2 - 0.06;
        ctx.strokeStyle = i < segDone ? '#d4ff00' : i === segDone && phase === 'capture' ? `rgba(212,255,0,${0.35 + 0.35 * Math.sin(now / 180)})` : 'rgba(255,255,255,.18)';
        ctx.beginPath(); ctx.arc(cx, cy, rad, a0, a1); ctx.stroke();
      }
      const a = -Math.PI / 2 + ((segDone + Math.min(1, (now - segStart) / 1400)) / segN) * Math.PI * 2;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(cx, cy, rad - 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 15px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round((segDone / segN) * 100)}%`, cx, cy);
    }

    let raf = 0;
    function loop(now) {
      if (finished) return;
      const el = now - t0;
      if (!usingCamera) drawFallbackBg(now); else bctx.clearRect(0, 0, W, H);
      ctx.clearRect(0, 0, W, H);
      const r = sheetRect();

      // light check from the camera image
      if (usingCamera && now > lightCheckAt && video.videoWidth) {
        lightCheckAt = now + 900;
        try { sctx.drawImage(video, 0, 0, 16, 16); const d = sctx.getImageData(0, 0, 16, 16).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; lightOK = s / 256 > 38; } catch (e) { lightOK = true; }
      }

      if (phase === 'search') {
        promptEl.textContent = isInsole ? L('Place the insole on the A4 sheet…', 'Lege die Einlage auf das A4-Blatt…') : L('Searching for the A4 sheet…', 'Suche das A4-Blatt…');
        if (now > nextWander) { nextWander = now + 380; retTarget = { x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.47 + (Math.random() - 0.5) * H * 0.2, w: r.w * (0.5 + Math.random() * 0.3), h: r.h * (0.5 + Math.random() * 0.3) }; }
        reticle.x += (retTarget.x - reticle.x) * 0.12; reticle.y += (retTarget.y - reticle.y) * 0.12; reticle.w += (retTarget.w - reticle.w) * 0.12; reticle.h += (retTarget.h - reticle.h) * 0.12;
        brackets({ x: reticle.x - reticle.w / 2, y: reticle.y - reticle.h / 2, w: reticle.w, h: reticle.h }, 'rgba(255,255,255,.85)', 20, 3);
        setChip('light', `${L('Light', 'Licht')} ${lightOK ? '✓' : '!'}`, lightOK ? 'ok' : 'bad');
        if (el > 1900) { phase = 'lock'; vibrate(40); beep(1046, 80); }
      } else if (phase === 'lock') {
        reticle.x += (r.x + r.w / 2 - reticle.x) * 0.35; reticle.y += (r.y + r.h / 2 - reticle.y) * 0.35; reticle.w += (r.w - reticle.w) * 0.35; reticle.h += (r.h - reticle.h) * 0.35;
        brackets({ x: reticle.x - reticle.w / 2, y: reticle.y - reticle.h / 2, w: reticle.w, h: reticle.h }, '#d4ff00', 30, 5);
        promptEl.textContent = L('A4 sheet detected · scale calibrated', 'A4-Blatt erkannt · Maßstab kalibriert');
        setChip('dist', `${L('Distance', 'Abstand')} ✓`, 'ok');
        if (el > 2700) { phase = 'capture'; segStart = now; segMotion0 = motionAcc; }
      } else if (phase === 'capture' || phase === 'done') {
        brackets(r, '#d4ff00', 30, 5);
        ctx.strokeStyle = 'rgba(212,255,0,.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
        const paused = now < tooFastUntil;
        // laser sweep
        const sweepT = (Math.sin(now / 520) + 1) / 2;
        const sweepY = r.y + r.h * (0.06 + sweepT * 0.88);
        if (phase === 'capture') {
          const grd = ctx.createLinearGradient(0, sweepY - 26, 0, sweepY + 26);
          grd.addColorStop(0, 'rgba(212,255,0,0)'); grd.addColorStop(0.5, 'rgba(212,255,0,.35)'); grd.addColorStop(1, 'rgba(212,255,0,0)');
          ctx.fillStyle = grd; ctx.fillRect(r.x - 10, sweepY - 26, r.w + 20, 52);
          ctx.strokeStyle = '#d4ff00'; ctx.lineWidth = 2; ctx.shadowColor = '#d4ff00'; ctx.shadowBlur = 14;
          ctx.beginPath(); ctx.moveTo(r.x - 10, sweepY); ctx.lineTo(r.x + r.w + 10, sweepY); ctx.stroke(); ctx.shadowBlur = 0;
          const allowed = MAXP * Math.min(1, (segDone + Math.min(1, (now - segStart) / 1350)) / segN) + 300;
          if (!paused && pts.length < Math.min(MAXP, allowed)) {
            const tSweep = 1 - (sweepY - r.y) / (r.h * 0.92 * 0.92);
            const k = lite ? 10 : 30;
            for (let i = 0; i < k; i++) {
              const t = Math.max(0, Math.min(1, tSweep + (Math.random() - 0.5) * 0.25));
              const edge = Math.random() < 0.25;
              const u = edge ? (Math.random() < 0.5 ? -1 : 1) * (0.92 + Math.random() * 0.08) : (Math.random() * 2 - 1);
              const p = footPt(t, u, r);
              const depth = isInsole ? 0.55 + 0.2 * Math.random() : (1 - Math.abs(u) * 0.55) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
              pts.push({ x: p.x + (Math.random() - 0.5) * 2, y: p.y + (Math.random() - 0.5) * 2, b: depth, born: now });
            }
          }
        }
        // point cloud
        for (const p of pts) {
          const a = Math.min(1, (now - p.born) / 300) * (0.35 + 0.65 * p.b);
          ctx.fillStyle = `rgba(${Math.round(150 + 62 * p.b)},255,${Math.round(40 * (1 - p.b))},${a})`;
          ctx.fillRect(p.x, p.y, 2, 2);
        }
        // wireframe mesh forming
        const prog = segDone / segN;
        if (prog > 0.3) {
          const alpha = Math.min(0.75, (prog - 0.3) * 1.6);
          ctx.strokeStyle = `rgba(212,255,0,${alpha})`; ctx.lineWidth = 1;
          const lats = isInsole ? 5 : 9;
          for (let j = 0; j <= lats; j++) {
            const u = -1 + (2 * j) / lats; ctx.beginPath();
            for (let i = 0; i <= 36; i++) { const p = footPt(i / 36, u, r); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
            ctx.stroke();
          }
          const lons = Math.round(14 * Math.min(1, (prog - 0.3) / 0.5));
          for (let i = 1; i <= lons; i++) {
            const t = i / 15; ctx.beginPath();
            for (let j = 0; j <= 12; j++) { const p = footPt(t, -1 + (2 * j) / 12, r); j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
            ctx.stroke();
          }
        }
        if (phase === 'capture') {
          // segment progress
          const segEl = now - segStart;
          if (!glitchShown && segDone === glitchSeg && segEl > 500) { glitchShown = true; tooFastUntil = now + 1500; }
          const motionOK = !motionSeen || (motionAcc - segMotion0) > 14 || segEl > 2600;
          if (!paused && segEl > 1350 && motionOK) {
            segDone++; segStart = now; segMotion0 = motionAcc; vibrate(15); beep(660 + segDone * 40, 50, 0.04);
            if (segDone >= segN) { phase = 'done'; t0 = now; vibrate([30, 60, 30]); beep(1318, 140); }
          }
          setChip('stab', paused ? L('Too fast – slow down', 'Zu schnell – langsamer') : `${L('Stability', 'Stabilität')} ✓`, paused ? 'bad' : 'ok');
          setChip('light', `${L('Light', 'Licht')} ${lightOK ? '✓' : L('– more light', '– mehr Licht')}`, lightOK ? 'ok' : 'bad');
          promptEl.textContent = paused ? L('Too fast – slow down', 'Zu schnell – bitte langsamer') : segNames[Math.min(segDone, segN - 1)];
          countEl.textContent = `${L('Captured', 'Erfasst')} ${Math.round((segDone + Math.min(1, segEl / 1350)) / segN * 24)}/24 ${L('frames', 'Bilder')} · ${pts.length.toLocaleString()} ${L('points', 'Punkte')}`;
        } else {
          promptEl.textContent = `${titles[foot]} ${L('captured', 'erfasst')} ✓`;
          countEl.textContent = `24/24 ${L('frames', 'Bilder')} · ${pts.length.toLocaleString()} ${L('points', 'Punkte')}`;
          if (now - t0 > 1300) { finish(true); return; }
        }
      }
      drawOrbit(now);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    function finish(ok) {
      if (finished) return; finished = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('deviceorientation', onOri);
      window.removeEventListener('resize', size);
      if (stream) { stream.getTracks().forEach(t => t.stop()); runtime.streams = runtime.streams.filter(s => s !== stream); }
      wrap.remove();
      resolve({ ok, usedCamera: usingCamera, points: pts.length });
    }
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'cancel') finish(false);
      if (b.dataset.x === 'mute') { state.muted = !state.muted; b.textContent = state.muted ? '🔇' : '🔊'; }
    });
  });
}
