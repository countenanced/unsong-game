'use strict';

// ---------- the office clock ----------
// A red seven-segment desk clock in the bottom right corner, at the end of the tab bar.
// It keeps the Company's time, not the wall's: the day starts at 8:00 AM and
// runs fast enough that one cigarette break is ten minutes.  The time is
// remembered between visits (picked up where it left off, not caught up).
//
// Drop-in beside break.js.  The caller owns the frame loop:
//   Clock.tick(dt)            dt = seconds of the caller's clock that passed
//   Clock.place(scr, col, row) reserve its cells (blank, black) before scr.render()
//   Clock.paint(scr)          draw the digits over those cells, after scr.render(); not placed this frame, not drawn
//   Clock.reset()             back to the start of the day
CFG.clock = {
  dayStart: 8 * 3600,        // seconds after midnight that the day begins
  breakMinutes: 10,          // a whole cigarette break, lighting to the last ash, comes to this on the clock
  cols: 7, rows: 1,          // the cells it takes, in the corner (it is painted, so any size will do)
  saveEvery: 10,             // seconds (real) between writes to storage; also saved when the page is put away
  key: 'countenance-lab-clock',
  on:  '#a8382e',            // a lit segment: a muted red
  off: '#170605',            // an unlit one, faintly there as on a real display
  bg:  '#000000',
};
const Clock = (() => {
  const K = CFG.clock;
  let t = K.dayStart, at = null, sinceSave = 0;
  try { const v = parseFloat(localStorage.getItem(K.key)); if (isFinite(v)) t = v; } catch (e) {}
  function save() { try { localStorage.setItem(K.key, String(Math.round(t))); } catch (e) {} sinceSave = 0; }
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // clock seconds per second of the break's own clock
  const rate = () => K.breakMinutes * 60 / Break.endS();

  function tick(dt) {
    t = (t + dt * rate()) % 86400;
    if ((sinceSave += dt) >= K.saveEvery) save();
  }

  function place(scr, col, row) {
    at = { col, row };
    scr.fill(col, row, K.cols, K.rows, ' ', K.bg, K.bg);
  }

  // which of a b c d e f g are lit, per digit
  const SEGS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

  function digit(o, x, y, w, h, th, lit) {
    const gap = th * 0.18, half = th / 2;
    // a segment from (x1,y1) to (x2,y2), pointed at both ends
    const seg = (x1, y1, x2, y2) => {
      const horiz = y1 === y2;
      o.beginPath();
      if (horiz) {
        x1 += gap; x2 -= gap;
        o.moveTo(x1, y1); o.lineTo(x1 + half, y1 - half); o.lineTo(x2 - half, y1 - half);
        o.lineTo(x2, y1); o.lineTo(x2 - half, y1 + half); o.lineTo(x1 + half, y1 + half);
      } else {
        y1 += gap; y2 -= gap;
        o.moveTo(x1, y1); o.lineTo(x1 + half, y1 + half); o.lineTo(x1 + half, y2 - half);
        o.lineTo(x1, y2); o.lineTo(x1 - half, y2 - half); o.lineTo(x1 - half, y1 + half);
      }
      o.closePath(); o.fill();
    };
    const L = x + half, R = x + w - half, T = y + half, M = y + h / 2, B = y + h - half;
    const at = { a: [L, T, R, T], b: [R, T, R, M], c: [R, M, R, B], d: [L, B, R, B],
                 e: [L, M, L, B], f: [L, T, L, M], g: [L, M, R, M] };
    for (const s of 'abcdefg') {
      o.fillStyle = lit && lit.includes(s) ? K.on : K.off;
      seg(...at[s]);
    }
  }

  function paint(scr) {
    if (!at) return;
    const o = scr.ctx, cw = scr.cw, ch = scr.ch;
    const X = at.col * cw, Y = at.row * ch, W = K.cols * cw, H = K.rows * ch;
    o.save();
    o.beginPath(); o.rect(X, Y, W, H); o.clip();
    o.fillStyle = K.bg; o.fillRect(X, Y, W, H);

    const mins = Math.floor(t / 60), h24 = Math.floor(mins / 60), m = mins % 60;
    const h12 = (h24 + 11) % 12 + 1, pm = h24 >= 12;
    const dh = H * 0.72, dw = dh * 0.5, th = Math.max(2, dh * 0.13), sp = th * 1.4, colon = th * 2.4;
    const amW = H * 0.42;                                      // room for AM/PM
    const total = 4 * dw + 3 * sp + colon + sp + amW;
    let x = X + (W - total) / 2;
    const y = Y + (H - dh) / 2;
    const digits = [h12 >= 10 ? SEGS[1] : null, SEGS[h12 % 10], SEGS[Math.floor(m / 10)], SEGS[m % 10]];
    digits.forEach((lit, i) => {
      digit(o, x, y, dw, dh, th, lit);
      x += dw + sp;
      if (i === 1) {                                           // the colon, steady
        o.fillStyle = K.on;
        const cx = x - sp / 2 + colon / 2 - th / 2;
        o.fillRect(cx, y + dh * 0.3 - th / 2, th, th);
        o.fillRect(cx, y + dh * 0.7 - th / 2, th, th);
        x += colon;
      }
    });
    o.font = `bold ${Math.max(7, Math.round(H * 0.3))}px ${CFG.fontFamily}`;
    o.textAlign = 'left'; o.textBaseline = 'alphabetic';
    o.fillStyle = pm ? K.off : K.on; o.fillText('AM', x, y + dh * 0.42);
    o.fillStyle = pm ? K.on : K.off; o.fillText('PM', x, y + dh);
    o.restore();
    at = null;                                                 // placed afresh each frame, or it is put away
  }

  function reset() { t = K.dayStart; save(); }

  return { tick, place, paint, reset, time: () => t };
})();
