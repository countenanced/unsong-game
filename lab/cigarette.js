'use strict';

// ---------- the cigarette ----------
// A cigarette burning down as a progress bar, drawn into the cell grid.  Filter
// on the left, paper to the right, the ember eating leftward with ash behind it
// that falls away in lumps, and smoke rising off the ember.
//
// Everything is a function of (s, t): s = seconds since it was lit (null: not lit yet), which sets
// how far it has burned and when the ash fell; t = seconds on the wall clock,
// for the ember's flicker and the smoke.  No state, so it can be scrubbed.
//
// This file is the drop-in: paste it into index.html beside the other modules
// and call Cigarette.draw(scr, ...) from drawClockOut().  It reads only
// CFG.cigarette and the scr passed in.
CFG.cigarette = {
  style: 'slim',             // slim (one row) | fat (two rows) | ascii (characters only)
  len: 32,                   // whole length in cells, filter included
  filter: 0.24,              // the filter's share of the length
  duration: 60,              // seconds from lit to the filter
  ash: [3, 8],               // cells of ash that build up before a lump falls
  fall: 0.9,                 // seconds a falling lump stays visible
  smoke: true,
  plumes: 7,                 // wisps of smoke in the air at once
  rise: 1.6,                 // rows per second the smoke climbs
  height: 7,                 // rows it climbs before it is gone
  wind: 0.6,                 // cells per row it leans rightward
  seed: 7,
  colors: {
    filter:  '#c8955a',
    speckle: '#9c6a35',
    band:    '#d7af5f',      // the gold ring where the filter meets the paper
    paper:   '#e8e4dc',
    scorch:  '#c9b08a',      // paper just ahead of the ember
    tobacco: ['#8a5a2b', '#5c3a1a'],   // the open end, before it is lit
    ember:   ['#ff5f00', '#ff8700', '#d73a00', '#ffaf00'],
    ash:     '#6c6c6c',
    ashDark: '#3a3a3a',      // the char right behind the ember
    smoke:   ['#9a9a9a', '#6a6a6a', '#4a4a4a', '#2e2e2e'],
  },
};
const Cigarette = (() => {
  const hash = (a, b = 0, c = 0) => {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  };

  // where the burn stands at s: the ember (a fractional cell), the ash still
  // hanging on, and the lumps that have fallen, each with when it fell
  function burn(P, s) {
    const nFilter = Math.round(P.len * P.filter), paper = P.len - nFilter;
    if (s == null) return { nFilter, frac: 0, ember: P.len, ashEnd: P.len, drops: [], out: false, unlit: true };
    const frac = Math.max(0, Math.min(1, s / P.duration));
    const burned = paper * frac;
    const drops = [];
    let acc = 0;
    for (let i = 0; ; i++) {
      const L = P.ash[0] + Math.floor(hash(P.seed, i, 1) * (P.ash[1] - P.ash[0] + 1));
      if (acc + L > burned) break;
      drops.push({ from: P.len - acc - L, len: L, at: (acc + L) / paper * P.duration });
      acc += L;
    }
    return { nFilter, frac, ember: P.len - burned, ashEnd: P.len - acc, drops, out: frac >= 1 };
  }

  // what each column is made of: filter, band, paper, scorch, ember, ash, char, or nothing
  function columns(P, b) {
    const out = [], e = Math.floor(b.ember);
    for (let c = 0; c < P.len; c++) {
      if (b.unlit && c === P.len - 1) out.push('tip');
      else if (c < b.nFilter - 1) out.push('filter');
      else if (c === b.nFilter - 1) out.push('band');
      else if (c < e - 1) out.push('paper');
      else if (c === e - 1) out.push(b.out ? 'paper' : 'scorch');
      else if (c === e && !b.out) out.push(b.ember - e < 0.5 ? 'ember' : 'half');   // half: paper on the left, ember on the right
      else if (c < b.ashEnd) out.push(c === e + 1 ? 'char' : 'ash');
      else out.push(null);
    }
    return out;
  }

  const emberColor = (P, c, row, t) => P.colors.ember[Math.floor(hash(P.seed, c * 7 + row, Math.floor(t * 9)) * P.colors.ember.length)];

  // one cell of material, in each style.  row is 0, or 0/1 for the fat one's two rows.
  // (half blocks were tried for a rounder tube, but the glyphs don't fill the 1.25 line and it striped)
  function cell(P, kind, c, row, t) {
    const K = P.colors, sp = hash(P.seed, c, row + 5);
    if (P.style === 'ascii') {
      if (row) return null;
      switch (kind) {
        case 'filter': return [sp < 0.5 ? '%' : '#', K.filter, null];
        case 'band':   return ['|', K.band, null];
        case 'paper':  return ['=', K.paper, null];
        case 'scorch': return ['=', K.scorch, null];
        case 'half':
        case 'ember':  return ['*', emberColor(P, c, 0, t), null];
        case 'char':   return [':', K.ashDark, null];
        case 'tip':    return ['%', K.tobacco[0], null];
        case 'ash':    return [sp < 0.5 ? ':' : '.', K.ash, null];
      }
      return null;
    }
    switch (kind) {
      case 'filter': return [sp < 0.3 ? '·' : sp < 0.4 ? ':' : ' ', K.speckle, K.filter];
      case 'band':   return [' ', K.band, K.band];
      case 'paper':  return [' ', K.paper, K.paper];
      case 'scorch': return [' ', K.scorch, K.scorch];
      case 'ember':  return ['▓', emberColor(P, c, 9 + row, t), emberColor(P, c, row, t)];
      case 'half':   return ['▌', K.paper, emberColor(P, c, row, t)];
      case 'char':   return ['▒', K.ash, K.ashDark];
      case 'tip':    return ['▒', K.tobacco[1], K.tobacco[0]];
      case 'ash':    return [sp < 0.5 ? '░' : '▒', K.ashDark, K.ash];
    }
    return null;
  }

  // draw the cigarette with its left end at (x, y), the top row.
  // floor is the last row anything (falling ash) may be drawn on.
  function draw(scr, x, y, s, t, floor = scr.rows - 1, P = CFG.cigarette) {
    const b = burn(P, s), cols = columns(P, b);
    const rows = P.style === 'fat' ? [0, 1] : [0];
    for (let c = 0; c < P.len; c++) {
      if (!cols[c]) continue;
      for (const r of rows) {
        const k = cell(P, cols[c], c, r, t);
        if (k) scr.put(x + c, y + r, k[0], k[1], k[2]);
      }
    }
    const under = y + rows[rows.length - 1] + 1;

    // lumps of ash falling: they drop and crumble
    for (const d of b.drops) {
      const age = s - d.at;
      if (age < 0 || age > P.fall) continue;
      const k = age / P.fall, dy = Math.floor(k * k * 4);
      if (under + dy > floor) continue;
      for (let i = 0; i < d.len; i++) {
        if (hash(P.seed, d.from + i, Math.floor(k * 4)) < k * 0.8) continue;   // crumbling as it goes
        const ch = k < 0.4 ? '▒' : k < 0.7 ? '░' : '.';
        scr.put(x + d.from + i + Math.round(k * hash(P.seed, i, 3)), under + dy, ch, P.colors.ash);
      }
    }

    // smoke off the ember
    if (P.smoke && !b.out && !b.unlit) {
      const ex = x + Math.floor(b.ember), top = y + rows[0] - 1;
      const life = P.height / P.rise;
      for (let i = 0; i < P.plumes; i++) {
        const age = (t + i * life / P.plumes) % life;
        const gen = Math.floor((t + i * life / P.plumes) / life);   // each wisp a new one each time round
        const h = age * P.rise, ph = hash(P.seed, i, gen) * 6.28;
        const dx = Math.round(Math.sin(ph + h * 0.9) * (0.4 + h * 0.25) + h * P.wind * (0.5 + hash(P.seed, gen, i)));
        const k = h / P.height;
        const ch = k < 0.15 ? '\'' : k < 0.45 ? (Math.sin(ph + h) > 0 ? ')' : '(') : k < 0.75 ? '~' : '.';
        const col = P.colors.smoke[Math.min(P.colors.smoke.length - 1, Math.floor(k * P.colors.smoke.length))];
        scr.put(ex + dx, top - Math.floor(h), ch, col);
      }
    }
    return b;
  }

  return { draw, burn, height: P => (P || CFG.cigarette).style === 'fat' ? 2 : 1 };
})();
