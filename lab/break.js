'use strict';

// ---------- the break ----------
// The CLOCK OUT scene.  A cigarette, not yet lit, over a few words about where
// you are and a choice: LIGHT UP or GO BACK IN.  Lit, the dialogue goes and a
// covert line opens under the cigarette: no caret until you speak, and a word
// left alone for a moment is spoken into the air, rises a line, and fogs away
// in grey steps.  Nothing here is heard by the microphone.
//
// Drop-in with cigarette.js.  The caller owns the clock and the tabs:
//   Break.key(e, now)          -> 'light' | 'back' | true (handled) | false
//   Break.draw(scr, x, y, w, h, now, s)   s = seconds since lit (the caller's clock)
//   Break.locked()             true while the cigarette burns: the tabs are shut
//   Break.reset()              back to the unlit cigarette and the choice
//   Break.endS()               s at which it ends: the last ash fallen, and a breath (the caller's clock must run this far)
//   Break.hear = word => ...   the host's ear for names: given the letters so far, return
//                              { text, fg, bold, holy, take() } if they end in a name, else null.
//                              It is asked after every letter, so it must not act: take() does
//                              whatever the word does, and is called once, as it is spoken.
//   Break.holyCells            after draw: the holy words in the air, for the light layers
CFG.breakScene = {
  scene: 'A chilly alley outside the Name Center, thankfully sheltered from the wind. ' +
         'Your breath fogs in the autumn air. No one\'s around to chat with.',
  options: ['LIGHT UP', 'GO BACK IN'],
  ending: 'The cigarette has burned down to the filter. You grind it out under your heel.',
  endOptions: ['GO BACK IN'],
  boxCols: 50,               // the dialogue's width, borders included
  smokeRows: 8,              // headroom kept above the cigarette for its smoke
  sendMs: 1000,              // silence this long and the word is spoken
  caretMs: 2000,             // ...and this much longer after, the caret goes away
  fieldCols: 24,             // the covert line's width; it starts under the cigarette's filter end
  fog: ['#9a9a9a', '#7a7a7a', '#5e5e5e', '#454545', '#303030', '#202020'],   // a spoken word's greys, in turn
  fogStepMs: 350,            // how long it holds each grey
  lingerMs: 1000,            // a name holds its colour this long before it fogs
  cooldownMs: 3000,          // after a name, you are hushed this long: no caret, and nothing more can be said
  holyMs: 3000,              // ...and a holy one floats in its light this long, then settles into the glass
  afterAshS: 1,              // once the last ash has fallen, this long before the ending dialogue
  lock: 'hide',              // what the tabs do while you smoke: hide | grey
  // while you smoke, a few thoughts drift by in a box where the dialogue was, one at a time
  thoughts: [
    'Nice to get away from the desk for a while.',
    'Can\'t wait to go home.',
  ],
  thoughtLeadS: 4,           // seconds after lighting before the first one begins to fade in
  thoughtSteps: 5,           // it fades in (and out) in this many discrete jumps of grey...
  thoughtStepS: 0.5,         // ...each held this many seconds
  thoughtHoldS: 4,           // seconds it lingers at full strength
  thoughtGapS: 20,           // seconds of nothing between one fading out and the next fading in
  thoughtCols: 50,           // the thought box's width, borders included
  speechStopsThoughts: true, // a letter said out here puts the thought away at once, and the rest never come
  escHint: '(Press ESC to go back inside early.)',
  escColor: '#4a4a4a',       // faint grey
};
const Break = (() => {
  let st;
  function reset() {
    st = { phase: 'ask', sel: 0, typed: '', lastKey: 0, spoken: [], hushUntil: 0, spoke: false };
  }
  reset();

  function speak(now, name = api.hear && st.typed && api.hear(st.typed)) {
    if (name) {
      name.take();
      st.spoken.push({ ...name, at: now, hold: name.holy ? CFG.breakScene.holyMs : CFG.breakScene.lingerMs });
    } else if (st.typed) st.spoken.push({ text: st.typed, at: now, hold: 0 });
    st.typed = '';
  }

  // a name keeps its own colour as it fogs, darkening in the same steps as the grey
  function fogged(wd, step) {
    const B = CFG.breakScene;
    return wd.fg ? dimmed(wd.fg, (B.fog.length - step) / B.fog.length) : B.fog[step];
  }

  // the word goes out on its own once you have been quiet long enough
  function tick(now) {
    if (st.typed && now - st.lastKey >= CFG.breakScene.sendMs) speak(st.lastKey + CFG.breakScene.sendMs);
    const life = CFG.breakScene.fog.length * CFG.breakScene.fogStepMs;
    st.spoken = st.spoken.filter(w => now - w.at < life + w.hold);
  }

  function key(e, now) {
    const B = CFG.breakScene;
    // while a dialogue is up, keys choose; nothing can be said
    if (st.phase === 'ask' || st.phase === 'out') {
      const opts = st.phase === 'ask' ? B.options : B.endOptions;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) {
        st.sel = (st.sel + 1) % opts.length;
        return true;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (opts[st.sel] === 'LIGHT UP') { st.phase = 'smoking'; return 'light'; }
        reset();
        return 'back';
      }
      return true;
    }
    if (st.phase !== 'smoking') return false;
    if (e.key === 'Escape') { reset(); return 'back'; }      // the cigarette, abandoned
    if (now < st.hushUntil) return true;                     // still getting your breath back
    if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      st.lastKey = now;
      st.spoke = true;                                        // ...and the thoughts are gone for good
      // a name goes out the moment its last consonant is said, and hushes you
      // (any vowels trailing it, as in TO-HU-VA-VO-HU, fall in the hush)
      if (st.typed.length < B.fieldCols - 1) st.typed += e.key.toUpperCase();
      const name = api.hear && api.hear(st.typed);
      if (name) { speak(now, name); st.hushUntil = now + B.cooldownMs; st.lastKey = 0; }   // the prompt goes covert again
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Backspace') { speak(now); st.lastKey = now - B.sendMs; return true; }   // as if the pause had come: no unsaying a sound
    return false;
  }

  // c's hex colour at strength k (0..1) over black
  function dimmed(c, k) {
    const n = parseInt(c.slice(1), 16);
    const ch = sh => Math.round((n >> sh & 255) * k).toString(16).padStart(2, '0');
    return `#${ch(16)}${ch(8)}${ch(0)}`;
  }

  // which thought is up s seconds after lighting, and how strongly: { text, k } or null
  function thought(s) {
    const B = CFG.breakScene, fade = B.thoughtSteps * B.thoughtStepS, span = 2 * fade + B.thoughtHoldS;
    const t = s - B.thoughtLeadS, i = Math.floor(t / (span + B.thoughtGapS)), u = t - i * (span + B.thoughtGapS);
    if (t < 0 || i >= B.thoughts.length || u >= span) return null;
    const step = Math.min(B.thoughtSteps, Math.floor(u / B.thoughtStepS) + 1, Math.floor((span - u) / B.thoughtStepS) + 1);
    return { text: B.thoughts[i], k: step / B.thoughtSteps };   // in jumps, never a smooth ramp
  }

  // the scene, in the panel's interior
  function draw(scr, x0, y0, w, h, now, s) {
    const C = CFG.colors, B = CFG.breakScene, P = CFG.cigarette;
    api.holyCells = [];
    tick(now);
    if (st.phase === 'smoking' && s >= api.endS()) { speak(now); st.phase = 'out'; st.sel = 0; }

    const cx = x0 + Math.floor((w - P.len) / 2), cy = y0 + B.smokeRows;
    const below = cy + Cigarette.height(P);
    const thoughtH = 5, inputRow = below + 2 + thoughtH + 1, hintRow = y0 + h - 2;
    Cigarette.draw(scr, cx, cy, st.phase === 'ask' ? null : s, now / 1000, inputRow - 1);

    // the dialogue, if one is up: placed now, drawn last, over everything
    let dlg = null;
    if (st.phase === 'ask' || st.phase === 'out') {
      const text = st.phase === 'ask' ? B.scene : B.ending, opts = st.phase === 'ask' ? B.options : B.endOptions;
      const W = B.boxCols, inner = W - 4, lines = [];
      let line = '';
      for (const word of text.split(' ')) {
        if ((line + ' ' + word).trim().length > inner) { lines.push(line); line = word; }
        else line = (line + ' ' + word).trim();
      }
      lines.push(line);
      dlg = { lines, opts, W, H: lines.length + 6, x: x0 + Math.floor((w - W) / 2), y: below + 2 };
    }

    // while smoking: a thought box where the dialogue sits, the covert line under it, and the way back in at the bottom
    const smoking = st.phase === 'smoking';

    // the covert line, and the spoken words fogging above it, newest lowest
    const fx = cx;                                            // flush with the filter end
    const top = below + 4;                                    // clear of the falling ash
    st.spoken.slice().reverse().forEach((wd, i) => {
      const r = inputRow - 1 - i;
      if (r < top || dlg && r >= dlg.y && r < dlg.y + dlg.H) return;   // nothing shows through the dialogue
      const age = now - wd.at - wd.hold;
      if (age < 0 && !wd.holy) { scr.text(fx, r, wd.text, wd.fg, null, wd.bold); return; }   // a name, lingering
      if (age < 0) {                                          // still aloft: the light layers draw it
        api.holyCells.push({ col: fx, row: r, w: wd.text.length, h: 1, seed: (wd.at | 0) % 9973 + 1,
                             glyphs: [...wd.text].map((ch, j) => ({ col: fx + j, row: r, ch })) });
        const rest = Levitate.floating ? CFG.levitate.restColor : wd.fg;
        if (rest) scr.text(fx, r, wd.text, rest, null, wd.bold);
        return;
      }
      const step = Math.floor(age / B.fogStepMs);
      scr.text(fx, r, wd.text, fogged(wd, Math.min(step, B.fog.length - 1)), null, wd.bold);
    });
    scr.text(fx, inputRow, st.typed, C.fg);
    const since = now - st.lastKey;
    if (st.phase === 'smoking' && st.lastKey && since < B.sendMs + B.caretMs && since % 1000 < 500)
      scr.put(fx + st.typed.length, inputRow, ' ', C.bg, C.fg);   // the caret, blinking from the last key

    if (smoking) {
      const th = !(B.speechStopsThoughts && st.spoke) && thought(s);
      if (th) {
        const W = B.thoughtCols, x = x0 + Math.floor((w - W) / 2), y = below + 2;
        scr.fill(x, y, W, thoughtH, ' ', C.fg, C.bg);
        scr.box(x, y, W, thoughtH, null, dimmed(C.border, th.k));
        scr.text(x + Math.floor((W - th.text.length) / 2), y + 2, th.text, dimmed(C.fg, th.k));
      }
      const hint = B.escHint;
      scr.text(x0 + Math.floor((w - hint.length) / 2), hintRow, hint, B.escColor);
    }

    if (dlg) {
      scr.fill(dlg.x, dlg.y, dlg.W, dlg.H, ' ', C.fg, C.bg);
      scr.box(dlg.x, dlg.y, dlg.W, dlg.H);
      dlg.lines.forEach((ln, i) => scr.text(dlg.x + 2, dlg.y + 2 + i, ln, C.fg));
      const btns = dlg.opts.map(o => `[ ${o} ]`), gap = 4;
      let bx = dlg.x + Math.floor((dlg.W - btns.join(' '.repeat(gap)).length) / 2);
      btns.forEach((b, i) => {
        const on = i === st.sel;
        scr.text(bx, dlg.y + dlg.H - 3, b, on ? C.bg : C.fg, on ? C.fg : null, on);
        bx += b.length + gap;
      });
    }
  }

  const api = { key, draw, reset, hear: null,
                endS: () => Cigarette.spent() + CFG.breakScene.afterAshS,   // s at which the cigarette scene gives way to the ending
                holyCells: [], phase: () => st.phase,
                locked: () => st.phase === 'smoking' || st.phase === 'out' };   // the only way out is back in
  return api;
})();
