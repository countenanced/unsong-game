'use strict';
// The office: a cubicle seen from the chair, in one-point perspective, drawn
// into the OFFICE tab's content area (100 × 25 cells).  The room is drawn by
// rule from a vanishing point and the back panel's size; the things in it are
// sprites pinned to cells.  Pure: render() returns cells, the page paints them.
// Runs in node too (`node lab/office.js` prints the scene) for checking.
const Office = (() => {
  const W = 100, H = 25;

  // the game's palette, plus a few for things that are not text
  const K = {
    fg: '#c8c8c8', dim: '#5a5a5a', bright: '#ffffff', yellow: '#ffd75f', ok: '#5faf5f', bad: '#d75f5f',
    blue: '#5f87d7', navy: '#1c3f95', ghost: '#6a6a6a',
    warm: '#d7af87', clay: '#d7875f', pink: '#d787af', leaf: '#87af5f', ink: '#1a1a1a',
    fabric: '#2a2e38', wallBg: '#12141a', deskBg: '#1c1814', glass: '#061006', screenDim: '#2f6f2f',
    carpet: '#1a1a22', beige: '#d7d7af',
  };

  // tunables, exposed to the lab's sliders
  // style: 'perspective' draws the seams as stairs of ___/; 'blocks' tapers each stair with
  // eighth-block bars ▔─▁; 'box' is close in, the side panels seen square-on as two vertical
  // strips; 'flat' is closer still, only the back panel and the desk.
  const P = { vpx: 50, vpy: 6, bw: 56, bh: 16, surfaces: true, grid: false, style: 'flat' };

  // steam off the mug: wisps exactly like the cigarette's smoke (its numbers, CFG.cigarette)
  // it steams in spells: `on` seconds of plume, then nothing new is born and the
  // last wisps rise away, then dormant for somewhere between `dormant` and twice that
  const STEAM = { plumes: 7, rise: 1.6, height: 7, wind: 0.6, seed: 3, on: 4, dormant: 15,
                  colors: ['#6a6a6a', '#4a4a4a', '#343434', '#222222'] };   // fainter than smoke: thin, translucent
  // was the mug steaming at second b?  spells start at 2 s and follow one another by rule
  function steaming(b) {
    const P = STEAM;
    for (let k = 0, start = 2; start <= b; k++) {
      if (b < start + P.on) return true;
      start += P.on + P.dormant * (1 + hash(P.seed, k, 99));
    }
    return false;
  }
  const hash = (a, b = 0, c = 0) => {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  };
  // wisps above (ex, top) at t seconds, as the cigarette does it
  function steam(ex, top, t) {
    const P = STEAM, life = P.height / P.rise;
    for (let i = 0; i < P.plumes; i++) {
      const age = (t + i * life / P.plumes) % life;
      const gen = Math.floor((t + i * life / P.plumes) / life);   // each wisp a new one each time round
      if (!steaming(t - age)) continue;                             // born while the mug was quiet: not there
      const h = age * P.rise, ph = hash(P.seed, i, gen) * 6.28;
      const dx = Math.round(Math.sin(ph + h * 0.9) * (0.4 + h * 0.25) + h * P.wind * (0.5 + hash(P.seed, gen, i)));
      const k = h / P.height;
      const ch = k < 0.15 ? '\'' : k < 0.45 ? (Math.sin(ph + h) > 0 ? ')' : '(') : k < 0.75 ? '~' : '.';
      const col = P.colors[Math.min(P.colors.length - 1, Math.floor(k * P.colors.length))];
      put(ex + dx, top - Math.floor(h), ch, col);
    }
  }

  let cells;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? null : cells[y * W + x];
  // ch === null leaves the character alone; bg === undefined leaves the background alone
  function put(x, y, ch, fg, bg) {
    const c = at(x, y); if (!c) return;
    if (ch != null) { c.ch = ch; c.fg = fg || K.fg; }
    if (bg !== undefined) c.bg = bg;
  }
  const text = (x, y, s, fg, bg) => { for (let i = 0; i < s.length; i++) put(x + i, y, s[i], fg, bg); };

  // a sprite: rows of art, where ' ' is see-through and '%' is a blank that covers.
  // paint (optional) is the same shape; each letter picks an entry of pal {fg, bg}.
  function sprite(x, y, art, fg, paint, pal) {
    art.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]; if (ch === ' ') continue;
        const p = paint && paint[j] && paint[j][i] !== ' ' ? pal[paint[j][i]] : null;
        put(x + i, y + j, ch === '%' ? ' ' : ch, p && p.fg || fg, p && p.bg !== undefined ? (P.surfaces ? p.bg : undefined) : undefined);
      }
    });
  }

  // ---------- the room ----------
  // a ray from the vanishing point through (cx, cy), followed out to the frame
  function rayEnd(cx, cy) {
    const dx = cx - P.vpx, dy = cy - P.vpy;
    let t = Infinity;
    if (dx < 0) t = Math.min(t, -cx / dx); else if (dx > 0) t = Math.min(t, (W - 1 - cx) / dx);
    if (dy < 0) t = Math.min(t, -cy / dy); else if (dy > 0) t = Math.min(t, (H - 1 - cy) / dy);
    return { x: Math.round(cx + dx * t), y: Math.round(cy + dy * t) };
  }
  // a shallow line drawn as runs per row, with the step marked by a slash: ___/ or \___
  function seam(x0, y0, x1, y1, run, fg) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy));
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push({ x: Math.round(x0 + dx * i / n), y: Math.round(y0 + dy * i / n) });
    if (P.style === 'blocks') {
      // each row's run descends (or climbs) one cell across its length: high bar, mid, low bar
      const rows = new Map();
      for (const p of pts) { if (!rows.has(p.y)) rows.set(p.y, []); rows.get(p.y).push(p.x); }
      const down = (dx < 0) !== (dy < 0);                       // the line falls to the left
      for (const [y, xs] of rows) {
        xs.sort((a, b) => a - b);
        const n = xs.length;
        xs.forEach((x, i) => {
          const k = n < 3 ? (n === 1 ? 1 : i * 2) : Math.floor(i * 3 / n);   // 0 high, 1 mid, 2 low
          const bar = ['▔', '─', '▁'][down ? 2 - k : k];
          put(x, y, bar, fg);
        });
      }
      return;
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], prev = pts[i - 1];
      const step = prev && prev.y !== p.y;                       // first cell of a new row
      const ch = !step ? run : (dx < 0) === (dy < 0) ? '\\' : '/';
      put(p.x, p.y, ch, fg);
    }
  }
  // x of the seam from (x0,y0) to (x1,y1) at row y, and y at column x
  const xAt = (a, b, y) => a.y === b.y ? a.x : a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
  const yAt = (a, b, x) => a.x === b.x ? a.y : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
  const weave = (x, y) => (x % 4 === 0 && y % 2 === 0) || (x % 4 === 2 && y % 2 === 1);

  // close in: no diagonals.  the back panel runs off the top; the desk's back edge is one
  // straight line.  'box' keeps the side panels as strips at the edges, seen square-on.
  function closeRoom(strip) {
    const wall = P.surfaces ? K.wallBg : null, desk = P.surfaces ? K.deskBg : null;
    const yd = 11, xl = strip, xr = W - 1 - strip, y0 = 1;   // the panel's top rail, and the ceiling beyond it
    for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
      const onDesk = y > yd && x >= xl && x <= xr;
      put(x, y, onDesk ? ' ' : weave(x, y) ? '·' : ' ', K.fabric, onDesk ? desk : wall);
    }
    for (let x = xl; x <= xr; x++) { put(x, y0, '─', K.dim); put(x, yd, '_', K.ghost); }
    if (strip) for (let y = y0; y < H; y++) { put(xl - 1, y, '│', K.dim); put(xr + 1, y, '│', K.dim); }
    text(36, 0, '╘' + '═'.repeat(26) + '╛', K.beige);
    return { x0: xl, x1: xr, y0, y1: H - 1, yd };
  }

  function room() {
    if (P.style === 'flat') return closeRoom(0);
    if (P.style === 'box') return closeRoom(4);
    const x0 = Math.round(50 - P.bw / 2), x1 = x0 + P.bw - 1;   // the back panel stays centred; only the eye moves
    const y1 = 16, y0 = y1 - P.bh + 1;
    const TL = { x: x0, y: y0 }, TR = { x: x1, y: y0 }, BL = { x: x0, y: y1 }, BR = { x: x1, y: y1 };
    const tl = rayEnd(x0, y0), tr = rayEnd(x1, y0), bl = rayEnd(x0, y1), br = rayEnd(x1, y1);
    const wall = P.surfaces ? K.wallBg : null;

    // panels: the back one, then each side between its top and bottom seams
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, weave(x, y) ? '·' : ' ', K.fabric, wall);
    for (let x = 0; x < x0; x++) for (let y = Math.ceil(yAt(TL, tl, x)); y <= Math.floor(yAt(BL, bl, x)); y++) put(x, y, weave(x, y) ? '·' : ' ', K.fabric, wall);
    for (let x = x1 + 1; x < W; x++) for (let y = Math.ceil(yAt(TR, tr, x)); y <= Math.floor(yAt(BR, br, x)); y++) put(x, y, weave(x, y) ? '·' : ' ', K.fabric, wall);
    // the carpet, in case any of it shows beside the desk
    for (let y = y1 + 1; y < H; y++) for (let x = Math.ceil(xAt(BL, bl, y)); x <= Math.floor(xAt(BR, br, y)); x++) put(x, y, (x + y) % 3 ? ' ' : ',', K.fabric, P.surfaces ? K.carpet : null);

    // the back panel's edges and the seams running out to the frame
    for (let x = x0; x <= x1; x++) { put(x, y0, '─', K.dim); put(x, y1, '─', K.dim); }
    for (let y = y0; y <= y1; y++) { put(x0, y, '│', K.dim); put(x1, y, '│', K.dim); }
    seam(x0, y0, tl.x, tl.y, '─', K.dim); seam(x1, y0, tr.x, tr.y, '─', K.dim);
    seam(x0, y1, bl.x, bl.y, '_', K.dim); seam(x1, y1, br.x, br.y, '_', K.dim);
    put(x0, y0, '┌', K.dim); put(x1, y0, '┐', K.dim); put(x0, y1, '└', K.dim); put(x1, y1, '┘', K.dim);

    // the light in the ceiling beyond the panel
    if (y0 > 0) text(36, 0, '╘' + '═'.repeat(26) + '╛', K.beige);

    // the desk: its back edge against the panel, its sides running out past the frame
    const yd = 11, DL = { x: x0 + 1, y: yd }, DR = { x: x1 - 1, y: yd };
    const dl = rayEnd(DL.x, DL.y), dr = rayEnd(DR.x, DR.y);
    const desk = P.surfaces ? K.deskBg : null;
    for (let y = yd + 1; y < H; y++) for (let x = Math.ceil(xAt(DL, dl, y)); x <= Math.floor(xAt(DR, dr, y)); x++) put(x, y, ' ', K.fg, desk);
    for (let x = DL.x; x <= DR.x; x++) put(x, yd, '_', K.ghost);
    seam(DL.x, DL.y, dl.x, dl.y, '_', K.ghost); seam(DR.x, DR.y, dr.x, dr.y, '_', K.ghost);
    return { x0, x1, y0, y1, yd };
  }

  // ---------- the things ----------
  // each: where it stands (x, y of its top-left) and how it looks.  the wall
  // ones hang above the desk's back edge (row 11); the desk ones stand on rows
  // 12-24, nearer things lower.
  const ITEMS = [
    { id: 'laptop', label: 'laptop', x: 38, y: 6, fg: K.ghost,
      art: ['%┌─────────────────────┐%',
            '%│%┌─────────────────┐%│%',
            '%│%│%%%%%%%%%%%%%%%%%│%│%',
            '%│%│%%%%%%%%%%%%%%%%%│%│%',
            '%│%│%%%%%%%%%%%%%%%%%│%│%',
            '%│%│%%%%%%%%%%%%%%%%%│%│%',
            '%│%└─────────────────┘%│%',
            '%│%%%%%%%%%%○%%%%%%%%%%│%',
            '┌┴─────────────────────┴┐',
            '└───────────────────────┘'],
      paint: ['                         ',
              '                         ',
              '    sssssssssssssssss    ',
              '    sssssssssssssssss    ',
              '    sssssssssssssssss    ',
              '    sssssssssssssssss    ',
              '                         ',
              '            g            ',
              '                         ',
              '                         '],
      pal: { s: { fg: K.fg, bg: K.ink }, g: { fg: K.ok } },
      after() {
        // the SPEAK tab, from across the desk: ledger rows, grey on the left (number,
        // hebrew, reading) and gold on the right ($2.20, the amulet and its gloss);
        // the prompt and the gold balance; and the blue tab bar along the bottom
        const sx = 42, sy = 8;
        const row = (y, segs) => { let x = sx; for (const [t, c, bg] of segs) { text(x, y, t, c, bg); x += t.length; } };
        row(sy,     [['▒▒ ▒▒▒ ▒▒▒▒ ', K.fg], ['▒▒ ▒▒', K.yellow]]);
        row(sy + 1, [['▒▒ ▒▒ ▒▒▒▒▒ ', K.fg], ['▒▒ ▒▒', K.yellow]]);
        row(sy + 2, [['  ', K.fg], ['▒', K.yellow], ['▒▒', K.fg], ['    ', K.fg], ['▒▒▒▒▒', K.yellow]]);
        row(sy + 3, [['▄'.repeat(17), K.navy]]);   // half a cell tall
      } },
    { id: 'mic', label: 'microphone', x: 47, y: 17, fg: K.fg,
      art: ['%╭───╮%',
            '%│▒▒▒│%',
            '%│▒▒▒│%',
            '%╰─┬─╯%',
            '%%%│%%%',
            '╶──┴──╴'],
      paint: ['       ', '  mmm  ', '  mmm  ', '       ', '       ', '       '],
      pal: { m: { fg: K.ghost } } },
    { id: 'clock', label: 'wall clock', x: 43, y: 1, fg: K.dim,
      // digital, the same seven-segment display as the one in the tab bar, painted
      // into its face (`face`, in cells from the top left) after the cells are drawn
      art: ['┌────────────┐',
            '│%%%%%%%%%%%%│',
            '│%%%%%%%%%%%%│',
            '└────────────┘'],
      face: { dx: 1, dy: 1, w: 12, h: 2 } },
    { id: 'calendar', label: 'calendar', x: 5, y: 2, fg: K.fg,
      art: ['╔═════════╗',
            '║%OCTOBER%║',
            '╟─────────╢',
            '║·%·%·%·%·║',
            '║·%·%X%·%·║',
            '║·%·%·%·%·║',
            '╚═════════╝'],
      paint: ['           ', ' rrrrrrrrr ', '           ', ' ppppppppp ', ' pppp' + 'y' + 'pppp ', ' ppppppppp ', '           '],
      pal: { r: { fg: K.bright, bg: K.bad }, p: { fg: K.ghost, bg: K.ink }, y: { fg: K.yellow, bg: K.ink } } },
    { id: 'notes', label: 'sticky notes', x: 24, y: 2, fg: K.ink,
      // a cell is about half as wide as it is tall, so a square note is 4 by 2
      art: ['%~~%      ', '~%~%      ', '    %~~%  ', '    ~%~%  ', ' %~~%     ', ' ~%~%     '],
      paint: ['yyyy      ', 'yyyy      ', '    pppp  ', '    pppp  ', ' yyyy     ', ' yyyy     '],
      pal: { y: { fg: '#7a5a00', bg: K.yellow }, p: { fg: '#7a2a50', bg: K.pink } } },
    { id: 'poster', label: 'motivational poster', x: 82, y: 2, fg: K.bright,
      art: ['┌──────────────┐',
            '│%%%%%%☼%%%%%%%│',
            '│%%%%/\\%%/\\%%%%│',
            '│%%%/%%\\/%%\\%%%│',
            '│%%/%%%%%%%%\\%%│',
            '│%%%ATTITUDE%%%│',
            '└──────────────┘'],
      paint: ['                ',
              ' bbbbbbyyyyyyyb ',
              ' bbbbbbbbbbbbbb ',
              ' bbbbbbbbbbbbbb ',
              ' bbbbbbbbbbbbbb ',
              ' bbbwwwwwwwwbbb ',
              '                '],
      pal: { b: { fg: K.blue, bg: K.navy }, y: { fg: K.yellow, bg: K.navy }, w: { fg: K.bright, bg: K.navy } } },
    { id: 'plant', label: 'plant', x: 6, y: 16, fg: K.leaf,
      art: ['%%%%_/\\_%%%',
            '%%_/%\\/%\\_%',
            '%/\\_/\\/\\_/\\',
            '%%\\/\\_/\\/%%',
            '%%%%\\%|%/%%',
            '%%%%┌─┴─┐%%',
            '%%%%│%%%│%%',
            '%%%%└───┘%%'],
      paint: ['           ', '           ', '           ', '           ', '      s    ',
              '    ccccc  ', '    ccccc  ', '    ccccc  '],
      pal: { s: { fg: K.clay }, c: { fg: K.clay } } },
    { id: 'photo', label: 'family photo', x: 24, y: 9, fg: K.fg,
      art: ['┌───────┐',
            '│%o%%%o%│',
            '│/|\\%/|\\│',
            '│%%%o%%%│',
            '│%%/|\\%%│',
            '└───┬───┘'],
      paint: ['         ', ' wwwwwww ', ' wwwwwww ', ' wwwwwww ', ' wwwwwww ', '         '],
      pal: { w: { fg: K.warm, bg: K.ink } } },
    { id: 'mug', label: 'coffee mug', x: 66, y: 18, fg: K.fg,
      art: ['┌───┐%', '│%%%├┐', '│%%%│┘', '└───┘%'],
      paint: ['      ', ' kkk  ', ' kkk  ', '      '],
      pal: { k: { fg: K.warm, bg: K.ink } },
      after(t) { steam(68, 17, t); } },     // from just above the rim
    { id: 'pens', label: 'pen cup', x: 93, y: 17, fg: K.fg,
      art: ['\\|/|', '┌──┐', '│%%│', '└──┘'],
      paint: ['ybgr', '    ', '    ', '    '],
      pal: { y: { fg: K.yellow }, b: { fg: K.blue }, g: { fg: K.ok }, r: { fg: K.bad } } },
    { id: 'lamp', label: 'desk lamp', x: 85, y: 11, fg: K.fg,
      art: ['┌─────┐',
            '╰──┬──╯',
            '%%%%/%%',
            '%%%│%%%',
            '%══╧══%'],
      paint: ['       ', 'yyyyyyy', '       ', '       ', '       '],
      pal: { y: { fg: K.yellow } } },
    { id: 'duck', label: 'rubber duck', x: 93, y: 13, fg: K.yellow,
      art: ['%%__%', '%(o%>', '~(__)'],
      paint: ['     ', '    c', '     '],
      pal: { c: { fg: K.clay } } },
  ];

  function render(on, t = 0) {
    cells = new Array(W * H);
    for (let i = 0; i < cells.length; i++) cells[i] = { ch: ' ', fg: K.fg, bg: null };
    const r = room();
    for (const it of ITEMS) {
      if (on && !on[it.id]) continue;
      sprite(it.x, it.y, it.art, it.fg, it.paint, it.pal);
      if (it.after) it.after(t);
    }
    if (P.grid) {
      for (let x = 0; x < W; x += 10) text(x, 0, String(x), K.bad);
      for (let y = 0; y < H; y += 5) text(0, y, String(y), K.bad);
    }
    return cells;
  }
  const toText = cs => { let s = ''; for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) s += cs[y * W + x].ch; s += '\n'; } return s; };

  return { W, H, K, P, STEAM, ITEMS, render, toText };
})();

if (typeof module !== 'undefined') { module.exports = Office; if (require.main === module) { Office.P.style = process.argv[2] || Office.P.style; process.stdout.write(Office.toText(Office.render())); } }
