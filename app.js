(() => {
  "use strict";

  /* ---------- Build-time data (build_rune_forge.py) ----------
     RUNE_CHARS: every character the Glitch Runes cmap really has.
     RUNE_METRICS: advance and the tallest and deepest ink of any glyph, in em. */
  const RUNE_CHARS = " !\"'(),-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ‐‑–—‘’“”∀";
  const RUNE_METRICS = {"adv": 0.74, "top": 0.8301, "bottom": -0.1392};

  const HAS = new Set(Array.from(RUNE_CHARS));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /* ---------- Settings, as in runes.py png ---------- */
  const LEAD = 1.2;     // line spacing, in em
  const SMALL = 40;     // below this many pixels the runes get hard to read in a phone feed
  const MARGIN = 0.06;  // safe margin on every side
  const SIZES = {
    post:   { w: 1600, h: 900,  name: "Post" },
    square: { w: 1080, h: 1080, name: "Square" },
    story:  { w: 1080, h: 1920, name: "Story" },
    banner: { w: 1500, h: 500,  name: "Banner" },
  };
  const INKS = {
    green: { ink: "#4cf274", glow: "rgba(76, 242, 116, .7)" },
    white: { ink: "#f2f2f2", glow: "rgba(76, 242, 116, .7)" },  // white faces, green phosphor, as on the site
    blue:  { ink: "#1c1cff", glow: "rgba(28, 28, 255, .7)" },
  };
  const GROUNDS = { black: "#000000", clear: null, deep: "#07140c" };
  const DEFAULTS = { ink: "green", bg: "black", glow: "off", scan: "off", cap: "none", size: "post", align: "center", rune: "medium" };
  const START_TEXT = "BE THE GLITCH";
  const STORE = "glitch-rune-forge-v1";

  /* ---------- Our lines: every scramble rune spells one of these (glitch.js) ---------- */
  const LINES = ["BE THE GLITCH", "FREE YOUR MIND", "OWN THE COMPUTE"];
  const STREAM = LINES.join("").replace(/ /g, "");
  let at = 0;
  const next = () => STREAM[at++ % STREAM.length];

  /* ---------- Storage: optional. Every read and write may throw (blocked or private mode). ---------- */
  function load() {
    try { const raw = localStorage.getItem(STORE); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  let saveT;
  function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(STORE, JSON.stringify({ text: textEl.value, ...opts, secret: undefined, rain, hidden: hiddenEl.value })); } catch (e) { /* storage blocked: the app still works */ }
    }, 250);
  }

  /* ---------- Clean what people type ----------
     Accents off, smart quotes and dashes made plain (SAME in runes.py), and anything the font
     can't draw dropped and listed, never drawn as a box or in another font. */
  const SAME = { "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
    "‘": "'", "’": "'", "‚": "'", "′": "'", "“": '"', "”": '"', "„": '"', "″": '"',
    "…": "...", " ": " ", " ": " ", " ": " ", "\t": " ", "\r\n": "\n", "\r": "\n" };
  const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const graphemes = (s) => seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s);

  function clean(text) {
    let out = "";
    const skipped = [];
    for (const g of graphemes(text)) {
      let t = SAME[g] != null ? SAME[g] : g.normalize("NFD").replace(/\p{M}/gu, "");
      t = Array.from(t).map((c) => SAME[c] != null ? SAME[c] : c).join("");
      if (/^[^\S\n]+$/.test(t)) t = " ";   // any other kind of space is a space
      if (t === "\n" || (t && Array.from(t).every((c) => HAS.has(c)))) out += t;
      else if (!/^\s+$/.test(g) && !skipped.includes(g)) skipped.push(g);
    }
    return { text: out, skipped };
  }

  /* ---------- Layout: wrap at spaces (wrap() in runes.py), then binary-search the largest size that fits ---------- */
  function wrap(words, cols) {
    const rows = [];
    let row = "";
    for (let w of words) {
      while (w.length > cols) {
        if (row) { rows.push(row); row = ""; }
        rows.push(w.slice(0, cols));
        w = w.slice(cols);
      }
      if (!w) continue;
      if (row && row.length + 1 + w.length > cols) { rows.push(row); row = w; }
      else row = row ? row + " " + w : w;
    }
    rows.push(row);
    return rows;
  }

  // Measured once the fonts are in, so the layout uses the real advances.
  let RUNE_ADV = RUNE_METRICS.adv, MONO_ADV = 0.54;

  function layout(t, o) {
    const S = SIZES[o.size];
    const W = S.w, H = S.h;
    const mx = Math.round(W * MARGIN), my = Math.round(H * MARGIN);
    const safeW = W - 2 * mx, safeH = H - 2 * my;
    const paras = t.split("\n").map((p) => Array.from(p).join("").split(/ +/).filter(Boolean));
    while (paras.length && !paras[0].length) paras.shift();
    while (paras.length && !paras[paras.length - 1].length) paras.pop();
    const glyphs = paras.reduce((n, p) => n + p.reduce((a, w) => a + Array.from(w).length, 0), 0);
    const L = { W, H, mx, my, safeW, safeH, rows: [], size: 0, empty: glyphs === 0, tooLong: false, cap: null };
    if (L.empty) return L;

    // Caption: the cleaned text in small Share Tech Mono under the runes. It takes a quarter of the height at most.
    if (o.cap !== "none") {
      let cs = Math.round(Math.max(24, Math.min(52, Math.min(W, H) * 0.042)));
      const words = ("> " + paras.map((p) => p.join(" ")).join(" ")).split(" ");
      let rows, maxRows;
      for (;;) {
        const cols = Math.max(8, Math.floor(safeW / (MONO_ADV * cs)));
        rows = wrap(words.map((w) => Array.from(w)).map((a) => a.join("")), cols);
        maxRows = Math.max(1, Math.floor((safeH * 0.25) / (cs * 1.35)));
        if (rows.length <= maxRows || cs <= 18) break;
        cs -= 2;
      }
      let cut = false;
      if (rows.length > maxRows) {
        rows = rows.slice(0, maxRows);
        const cols = Math.max(8, Math.floor(safeW / (MONO_ADV * cs)));
        rows[maxRows - 1] = rows[maxRows - 1].slice(0, cols - 3).replace(/ +$/, "") + "...";
        cut = true;
      }
      L.cap = { size: cs, rows, cut, h: rows.length * cs * 1.35, gap: 0 };
    }

    const ink = RUNE_METRICS.top - RUNE_METRICS.bottom;
    const rowsAt = (s) => {
      const cols = Math.max(1, Math.floor(safeW / (RUNE_ADV * s)));
      return paras.flatMap((p) => p.length ? wrap(p, cols) : [""]);
    };
    const gapAt = (s) => (L.cap ? Math.max(L.cap.size * 1.1, s * 0.45) : 0);
    const availAt = (s) => safeH - (L.cap ? L.cap.h + gapAt(s) : 0);
    const heightAt = (s, rows) => ink * s + (rows.length - 1) * LEAD * s;
    const fits = (s) => { const r = rowsAt(s); return heightAt(s, r) <= availAt(s) ? r : null; };

    let lo = SMALL, hi = Math.floor(Math.min(safeH / ink, safeW / RUNE_ADV));
    // Keep words whole: no bigger than the size where the longest word still fits on a line.
    // Only a word too long for a line even at the 40 px floor gets broken.
    const longest = Math.max(...paras.flat().map((w) => Array.from(w).length));
    const whole = Math.floor(safeW / (RUNE_ADV * longest));
    if (whole >= SMALL) hi = Math.min(hi, whole);
    if (hi < lo || !fits(lo)) {
      L.tooLong = true;
      L.size = SMALL;
      L.rows = rowsAt(SMALL);
    } else {
      while (lo < hi) {             // largest whole-pixel size whose wrapped lines fit
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(mid)) lo = mid; else hi = mid - 1;
      }
      L.size = lo;
      L.rows = fits(lo);
    }
    const s = L.size;
    const blockH = heightAt(s, L.rows);
    const gap = gapAt(s);
    const total = blockH + (L.cap ? gap + L.cap.h : 0);
    const y0 = L.tooLong ? my : my + (safeH - total) / 2;
    L.base = y0 + RUNE_METRICS.top * s;   // first baseline
    if (L.cap) { L.cap.gap = gap; L.cap.base = y0 + blockH + gap + L.cap.size * 0.95; }
    return L;
  }

  /* ---------- Draw one frame. anim: { from, pos } locks glyphs below pos (in reading order, spaces skipped) ---------- */
  // x.scale draws the same picture smaller (the GIF); x.ground / x.scan false leave those out (the rain's word layer)
  function draw(ctx, L, o, anim, capLock, bgOverride, x = {}) {
    const { W, H } = L;
    const sc = x.scale || 1;
    ctx.save();
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowColor = "transparent";
    ctx.clearRect(0, 0, W, H);
    const ground = bgOverride || GROUNDS[o.bg];
    if (ground && x.ground !== false) { ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H); }
    if (L.empty) { ctx.restore(); return; }

    const s = L.size, adv = RUNE_ADV * s;
    const inkC = INKS[o.ink];
    const runeFont = `${s}px "Glitch Runes"`;
    ctx.textBaseline = "alphabetic";
    // 0 0 .3em, as in glitch.css (shadowBlur ignores the transform, so it's scaled by hand)
    if (o.glow === "on") { ctx.shadowColor = inkC.glow; ctx.shadowBlur = 0.3 * s * sc; }
    let k = 0;
    if (x.runes !== false) L.rows.forEach((row, r) => {
      const chars = Array.from(row);
      const x0 = o.align === "center" ? (W - chars.length * adv) / 2 : L.mx;
      const y = L.base + r * LEAD * s;
      if (!anim) {
        ctx.font = runeFont; ctx.fillStyle = inkC.ink; ctx.textAlign = "left";
        ctx.fillText(row, x0, y);
        return;
      }
      chars.forEach((c, i) => {
        if (c === " ") return;
        const cx = x0 + i * adv + adv / 2;
        ctx.textAlign = "center";
        if (k < anim.from || k < anim.pos) {
          ctx.font = runeFont; ctx.fillStyle = inkC.ink; ctx.fillText(c, cx, y);
        } else if (k < anim.pos + 2) {
          ctx.font = runeFont; ctx.fillStyle = inkC.ink; ctx.fillText(next(), cx, y);
        } else {
          ctx.save(); ctx.shadowColor = "transparent";
          ctx.font = `${Math.round(s * 0.9)}px "Share Tech Mono"`; ctx.fillStyle = "#949494"; ctx.fillText(c, cx, y);
          ctx.restore();
        }
        k++;
      });
    });

    // Caption: the plain text, or the same text caught mid-decode (its last letters still in their own runes)
    if (L.cap && x.caption !== false) {
      ctx.shadowColor = "transparent";
      const cs = L.cap.size, cadv = MONO_ADV * cs;
      const total = L.cap.rows.reduce((n, r) => n + r.length, 0);
      const lockAt = o.cap === "decode" ? Math.round(total * capLock) : total;
      let n = 0;
      L.cap.rows.forEach((row, r) => {
        const chars = Array.from(row);
        const x0 = o.align === "center" ? (W - chars.length * cadv) / 2 : L.mx;
        const y = L.cap.base + r * cs * 1.35;
        ctx.textAlign = "center";
        chars.forEach((c, i) => {
          const cx = x0 + i * cadv + cadv / 2;
          const prompt = r === 0 && i < 2;
          if (c !== " ") {
            if (n < lockAt || prompt) {
              ctx.font = `${cs}px "Share Tech Mono"`;
              ctx.fillStyle = prompt ? "#4cf274" : "#f2f2f2";
              ctx.fillText(c, cx, y);
            } else {
              ctx.font = `${Math.round(cs * 0.74)}px "Glitch Runes"`;
              ctx.fillStyle = "#4cf274";
              ctx.fillText(HAS.has(c) ? c : next(), cx, y - cs * 0.1);
            }
          }
          n++;
        });
      });
    }

    if (o.scan === "on" && x.scan !== false) scanlines(ctx, W, H);
    ctx.restore();
  }

  // Scanlines: glitch.css's 1-dark-in-3 pattern, scaled to the export, darkening only what's drawn
  function scanlines(ctx, W, H) {
    const p = Math.max(3, Math.round(Math.min(W, H) / 180));
    const d = Math.max(1, Math.round(p / 3));
    ctx.shadowColor = "transparent";
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(0, 0, 0, .22)";
    for (let y = 0; y < H; y += p) ctx.fillRect(0, y, W, d);
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- Glitch Rain: your runes turn into our code rain, and pour back ----------
     Same rain as loop_rain in motion.py and the site's rain: one cell a frame, a white head, two green cells, then
     the grays (TAIL in make_assets.py), each cell's rune fixed in place so the light runs down a column.
     One seamless 4 s loop at 24 fps (frame 96 is frame 0):
       hold   0-23   the runes stand whole (frame 0 is the poster)
       break  24-30  a sweep left to right shatters each letter into a grid of small runes, flashing white
       fall   ~25-60 every column of the letters lets go and falls as rain, off the bottom
       pour   ~56-84 drops fall from the top and pile up inside the letters, bottom first
       lock   86-94  a second sweep snaps the pile back into the solid runes */
  const RAIN_TAIL = ["#f2f2f2", "#4cf274", "#4cf274", "#949494", "#6b6b6b", "#6b6b6b", "#3a3a3a", "#3a3a3a", "#2a2a2a"];
  const LOOP = 96;
  const T = { breakAt: 24, breakLen: 6, clearBy: 60, pourFrom: 56, landBy: 84, lockAt: 86, lockLen: 8, enterAfter: 30 };
  const GIF_LONG = 960;   // GIF long side, like the 720×900 phrase GIFs: light enough to post
  const gifScale = (L) => Math.min(1, GIF_LONG / Math.max(L.W, L.H));
  // Rain rune size: the rain's cell is a share of the letter size, with a floor so it never turns to dust.
  // Medium is the original look (a ninth of the letter, 12 px at least).
  // fill: how much of a cell the letter must ink for that cell to join the rain. Big cells need less, or the
  // broken letters thin out to a few loose runes and lose their shape.
  const RAIN_RUNE = { small: { div: 14, min: 9, fill: 0.2 }, medium: { div: 9, min: 12, fill: 0.2 },
    large: { div: 6, min: 16, fill: 0.14 }, huge: { div: 4, min: 22, fill: 0.09 } };
  const rainCell = (L, rune) => { const k = RAIN_RUNE[rune] || RAIN_RUNE.medium; return Math.max(k.min, Math.round(L.size / k.div)); };
  // A drop's k-th cell from its head: white, then always two greens, then the grays spread over the rest
  const shade = (k, n) => RAIN_TAIL[k === 0 ? 0 : Math.max(1, Math.min(k, Math.floor((k / Math.max(1, n)) * RAIN_TAIL.length), RAIN_TAIL.length - 1))];
  const TRAIL = ["#6b6b6b", "#3a3a3a", "#2a2a2a"];   // the fade left above a falling drop

  function mulberry32(a) {
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; }

  function rainModel(L, o) {
    const rr = RAIN_RUNE[o.rune] || RAIN_RUNE.medium, cell = rainCell(L, o.rune);
    // The lower fill only while the cell is a true share of the letter. On its floor (long text, small letters)
    // the cell is already big next to the letters, and a low fill would light nearly every cell: a heavy GIF.
    const fill = cell > Math.round(L.size / rr.div) ? 0.2 : rr.fill;
    const cols = Math.ceil(L.W / cell), rows = Math.ceil(L.H / cell);
    // Which cells the runes cover: draw them once, plain, and measure each cell's ink
    const c = document.createElement("canvas");
    c.width = L.W; c.height = L.H;
    const g = c.getContext("2d", { willReadFrequently: true });
    draw(g, L, { ...o, glow: "off", scan: "off" }, null, 0.72, null, { ground: false, caption: false });
    const a = g.getImageData(0, 0, L.W, L.H).data;
    const on = new Uint8Array(cols * rows), inkCol = new Uint8Array(cols);
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      let hit = 0, n = 0;
      for (let y = r * cell + 1; y < Math.min(L.H, (r + 1) * cell); y += 2) for (let x = q * cell + 1; x < Math.min(L.W, (q + 1) * cell); x += 2) {
        n++; const al = a[(y * L.W + x) * 4 + 3];
        if (al > 100) hit++;
        if (al > 30) inkCol[q] = 1;
      }
      if (n && hit / n > fill) on[r * cols + q] = 1;
    }
    const glyphs = Array.from(L.rows.join("").replace(/\s+/g, ""));
    const hid = hiddenGlyphs();   // the Hidden Line, if there is one, is what the falling runes spell
    const stream = hid.length ? hid : glyphs.length ? glyphs : ["∀"];
    const rnd = mulberry32(hash(glyphs.join("")) || 7);
    const off = Array.from({ length: cols }, () => Math.floor(rnd() * stream.length));
    let minC = cols, maxC = -1;
    for (let q = 0; q < cols; q++) if (inkCol[q]) { minC = Math.min(minC, q); maxC = Math.max(maxC, q); }
    const span = Math.max(1, maxC - minC + 1);
    const sweep = (q, at, len) => at + Math.floor((len * (q - minC)) / span);
    // The letters themselves. Each one breaks and locks whole, on a sweep left to right, so no slice of a
    // letter (or of its glow) is ever left standing at the sweep's edge.
    const s = L.size, adv = RUNE_ADV * s, marks = [];
    L.rows.forEach((row, r) => {
      const chars = Array.from(row);
      const x0 = o.align === "center" ? (L.W - chars.length * adv) / 2 : L.mx;
      const base = L.base + r * LEAD * s;
      chars.forEach((ch, i) => {
        if (ch !== " ") marks.push({ ch, x: x0 + i * adv, base, y0: base - RUNE_METRICS.top * s, y1: base - RUNE_METRICS.bottom * s });
      });
    });
    const gx0 = Math.min(...marks.map((g) => g.x)), gspan = Math.max(1, Math.max(...marks.map((g) => g.x + adv)) - gx0);
    marks.forEach((g) => {
      const t = (g.x - gx0) / gspan;
      g.breakF = T.breakAt + Math.floor(T.breakLen * t);
      g.lockF = T.lockAt + Math.floor(T.lockLen * t);
    });
    const owner = (q, r) => {   // the letter a cell belongs to: the one whose box is nearest its middle
      const cx = q * cell + cell / 2, cy = r * cell + cell / 2;
      let best = marks[0], bd = Infinity;
      for (const g of marks) {
        const dx = cx < g.x ? g.x - cx : cx > g.x + adv ? cx - g.x - adv : 0;
        const dy = cy < g.y0 ? g.y0 - cy : cy > g.y1 ? cy - g.y1 : 0;
        if (dx + dy < bd) { bd = dx + dy; best = g; }
      }
      return best;
    };
    const col = [];
    for (let q = 0; q < cols; q++) {
      const cells = [];
      for (let r = rows - 1; r >= 0; r--) if (on[r * cols + q]) cells.push(r);    // bottom first
      if (!cells.length) continue;
      const minRow = cells[cells.length - 1], maxRow = cells[0];
      const own = new Map(cells.map((r) => [r, owner(q, r)]));
      const breakF = Math.max(...cells.map((r) => own.get(r).breakF));   // the column lets go once all its letters have broken
      const R = breakF + 1 + Math.floor(rnd() * 8);                                // lets go a beat after it breaks
      const v = Math.max(1, Math.ceil((rows - minRow + 1) / Math.max(1, T.clearBy - R)));
      const S = Math.min(T.landBy, Math.max(R + Math.ceil((maxRow - minRow + 1) / v) + 2, T.pourFrom + Math.floor(rnd() * 6)));
      const step = cells.length > 1 ? Math.min(1, (T.landBy - S) / (cells.length - 1)) : 0;
      // Each falling run of cells is one drop: its bottom cell is the white head
      const rank = new Map(), runLen = new Map();
      let i = 0;
      while (i < cells.length) {
        let j = i;
        while (j + 1 < cells.length && cells[j + 1] === cells[j] - 1) j++;
        for (let k = i; k <= j; k++) { rank.set(cells[k], k - i); runLen.set(cells[k], j - i + 1); }
        i = j + 1;
      }
      const pour = cells.map((r, k) => {
        const land = S + Math.floor(k * step);
        return { r, land, v: Math.max(1, Math.ceil((r + 1) / Math.max(1, land - T.enterAfter))) };
      });
      col.push({ q, cells, own, rank, runLen, breakF, R, v, pour });
    }
    return { cell, cols, rows, stream, off, col, marks };
  }

  // The solid runes and the caption, each on a clear layer drawn once and reused for every frame
  function rainLayers(L, o, sc) {
    const mk = (x) => {
      const c = document.createElement("canvas");
      c.width = Math.round(L.W * sc); c.height = Math.round(L.H * sc);
      draw(c.getContext("2d"), L, o, null, 0.72, null, { scale: sc, ground: false, scan: false, ...x });
      return c;
    };
    return { runes: mk({ caption: false }), caption: L.cap ? mk({ runes: false }) : null };
  }

  function rainFrame(ctx, L, o, m, layers, f, sc, bgOverride) {
    const { cell, rows, stream, off, col } = m;
    const ink = INKS[o.ink].ink;
    ctx.save();
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowColor = "transparent";
    ctx.clearRect(0, 0, L.W, L.H);
    const ground = bgOverride || GROUNDS[o.bg];
    if (ground) { ctx.fillStyle = ground; ctx.fillRect(0, 0, L.W, L.H); }

    ctx.font = `${cell}px "Glitch Runes"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const lift = ((RUNE_METRICS.top + RUNE_METRICS.bottom) / 2) * cell;   // centers each rune's ink in its cell
    const put = (q, r, color) => {
      if (r < 0 || r >= rows) return;
      ctx.fillStyle = color;
      ctx.fillText(stream[(r + off[q]) % stream.length], q * cell + cell / 2, r * cell + cell / 2 + lift);
    };
    for (const c of col) {
      if (f < c.R) {                                        // a letter's cells once it has broken, white on the frame it breaks
        for (const r of c.cells) {
          const g = c.own.get(r);
          if (f >= g.breakF) put(c.q, r, f === g.breakF ? RAIN_TAIL[0] : ink);
        }
      } else {                                              // falling: each run is a drop, white at its foot
        const dy = c.v * (f - c.R);
        for (const r of c.cells) {
          const k = c.rank.get(r), n = c.runLen.get(r);
          put(c.q, r + dy, shade(k, n));
          if (k === n - 1) for (let j = 1; j <= TRAIL.length; j++) {   // the run's top: a short fading trail above it
            const y = r - j;
            if (!c.rank.has(y)) put(c.q, y + dy, TRAIL[j - 1]);
          }
        }
      }
      for (const p of c.pour) {                             // pouring back: drops land and stay, bottom first
        if (f >= p.land) { if (f < c.own.get(p.r).lockF) put(c.q, p.r, f === p.land ? RAIN_TAIL[0] : ink); continue; }
        const head = p.r - p.v * (p.land - f);
        if (head < 0) continue;
        put(c.q, head, RAIN_TAIL[0]);
        for (let k = 1; k < 5; k++) {
          const y = head - k * p.v;
          if (y >= 0 && !c.pour.some((o2) => o2.r === y && f >= o2.land)) put(c.q, y, RAIN_TAIL[Math.min(RAIN_TAIL.length - 1, k * 2 - 1)]);
        }
      }
    }
    // The solid runes: every letter still whole or locked again, each drawn whole, glow and all
    const standing = m.marks.filter((g) => f < g.breakF || f >= g.lockF);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (standing.length === m.marks.length) ctx.drawImage(layers.runes, 0, 0);
    else if (standing.length) {
      const s = L.size;
      ctx.setTransform(sc, 0, 0, sc, 0, 0);
      ctx.font = `${s}px "Glitch Runes"`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = ink;
      if (o.glow === "on") { ctx.shadowColor = INKS[o.ink].glow; ctx.shadowBlur = 0.3 * s * sc; }
      for (const g of standing) ctx.fillText(g.ch, g.x, g.base);
      ctx.shadowColor = "transparent";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (layers.caption) ctx.drawImage(layers.caption, 0, 0);
    if (o.scan === "on") { ctx.setTransform(sc, 0, 0, sc, 0, 0); scanlines(ctx, L.W, L.H); }
    ctx.restore();
  }

  /* ---------- GIF89a writer: fixed palette from the frames, LZW, only changed pixels after frame 0 ---------- */
  function lzw(index, minSize, out) {
    const clear = 1 << minSize, eoi = clear + 1;
    let size = minSize + 1, next = eoi + 1;
    const codes = lzw.codes || (lzw.codes = new Int16Array(4096 * 256));
    const gens = lzw.gens || (lzw.gens = new Int32Array(4096 * 256));
    let gen = (lzw.gen = (lzw.gen || 0) + 1);
    let cur = 0, shift = 0;
    const bytes = [];
    const emit = (code) => { cur |= code << shift; shift += size; while (shift >= 8) { bytes.push(cur & 255); cur >>>= 8; shift -= 8; } };
    emit(clear);
    let prefix = index[0];
    for (let i = 1; i < index.length; i++) {
      const k = index[i], key = (prefix << 8) | k;
      if (gens[key] === gen) { prefix = codes[key]; continue; }
      emit(prefix);
      if (next === 4096) { emit(clear); next = eoi + 1; size = minSize + 1; gen = lzw.gen = lzw.gen + 1; }
      else { if (next >= 1 << size) size++; codes[key] = next++; gens[key] = gen; }
      prefix = k;
    }
    emit(prefix); emit(eoi);
    if (shift > 0) bytes.push(cur & 255);
    out.push(new Uint8Array([minSize]));
    for (let i = 0; i < bytes.length; i += 255) {
      const n = Math.min(255, bytes.length - i);
      const b = new Uint8Array(n + 1); b[0] = n;
      for (let j = 0; j < n; j++) b[j + 1] = bytes[i + j];
      out.push(b);
    }
    out.push(new Uint8Array([0]));
  }

  // 255 colors, most common first (the frames are a few inks on black, so this keeps them exact); 255 is "unchanged"
  function palette(samples) {
    const n = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
    for (const d of samples) for (let i = 0; i < d.length; i += 4) {
      const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      n[k]++; sr[k] += d[i]; sg[k] += d[i + 1]; sb[k] += d[i + 2];
    }
    const keys = [];
    for (let k = 0; k < 32768; k++) if (n[k]) keys.push(k);
    keys.sort((a, b) => n[b] - n[a]);
    const pal = keys.slice(0, 255).map((k) => [Math.round(sr[k] / n[k]), Math.round(sg[k] / n[k]), Math.round(sb[k] / n[k])]);
    while (pal.length < 256) pal.push([0, 0, 0]);
    const lut = new Int16Array(32768).fill(-1);
    const near = (k) => {
      const r = ((k >> 10) << 3) + 4, g = (((k >> 5) & 31) << 3) + 4, b = ((k & 31) << 3) + 4;
      let best = 0, bd = Infinity;
      for (let i = 0; i < 255; i++) { const p = pal[i], dd = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (dd < bd) { bd = dd; best = i; } }
      return (lut[k] = best);
    };
    return { pal, map: (k) => (lut[k] >= 0 ? lut[k] : near(k)) };
  }

  const tick0 = () => new Promise((r) => setTimeout(r, 0));

  async function makeGif(onProgress) {
    await fontsLoaded();
    const Lx = layout(cur.text, opts);
    if (Lx.empty || Lx.tooLong) return null;
    const sc = gifScale(Lx), w = Math.round(Lx.W * sc), h = Math.round(Lx.H * sc);
    const m = rainModel(Lx, opts), layer = rainLayers(Lx, opts, sc);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const ground = GROUNDS[opts.bg] || "#000000";   // GIF transparency is all-or-nothing, so clear saves on black
    const frame = (f) => { rainFrame(ctx, Lx, opts, m, layer, f, sc, ground); return ctx.getImageData(0, 0, w, h).data; };

    const samples = [];
    for (let f = 0; f < LOOP; f += 8) samples.push(frame(f));
    const { pal, map } = palette(samples);

    const le = (v) => [v & 255, (v >> 8) & 255];
    const out = [new Uint8Array([
      ..."GIF89a".split("").map((ch) => ch.charCodeAt(0)), ...le(w), ...le(h), 0xF7, 0, 0,
      ...pal.flat(),
      0x21, 0xFF, 0x0B, ..."NETSCAPE2.0".split("").map((ch) => ch.charCodeAt(0)), 3, 1, 0, 0, 0,
    ])];
    let prev = null;
    const idx = new Uint8Array(w * h);
    for (let f = 0; f < LOOP; f++) {
      const d = frame(f);
      for (let i = 0, p = 0; p < idx.length; i += 4, p++) idx[p] = map(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
      let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1, sub = idx, trans = false;
      if (prev) {
        // Only what changed since the last frame; the rest is index 255, see-through to the frame below
        x0 = w; y0 = h; x1 = -1; y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0, p = y * w; x < w; x++, p++) if (idx[p] !== prev[p]) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 < 0) { x0 = y0 = x1 = y1 = 0; }
        const sw = x1 - x0 + 1, sh = y1 - y0 + 1;
        sub = new Uint8Array(sw * sh);
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
          const p = (y + y0) * w + x + x0;
          sub[y * sw + x] = idx[p] === prev[p] ? 255 : idx[p];
        }
        trans = true;
      }
      // 24 fps in whole hundredths: 80 frames at 40 ms and 16 at 50 ms make exactly 4 s, as in the phrase GIFs
      const delay = f % 6 === 5 ? 5 : 4;
      out.push(new Uint8Array([0x21, 0xF9, 4, (1 << 2) | (trans ? 1 : 0), ...le(delay), trans ? 255 : 0, 0,
        0x2C, ...le(x0), ...le(y0), ...le(x1 - x0 + 1), ...le(y1 - y0 + 1), 0]));
      lzw(sub, 8, out);
      prev = prev || new Uint8Array(w * h);
      prev.set(idx);
      if (onProgress) onProgress(f + 1);
      await tick0();
    }
    out.push(new Uint8Array([0x3B]));
    return new Blob(out, { type: "image/gif" });
  }

  /* ---------- Secret Transmission: the cipher in runes.py, letter for letter ----------
     Letters only, A to Z, shifted by a key: encrypt adds each key letter (A = 0), decrypt takes it away.
     A random key as long as the message, used once, is a one-time pad and can't be broken; a short keyword
     repeats, which suits puzzles but can be broken. Groups of five, like runes.py, so the two work together. */
  const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const azLetters = (t) => Array.from(String(t).toUpperCase()).filter((c) => AZ.includes(c));
  const fives = (a) => a.join("").replace(/(.{5})(?=.)/g, "$1 ");
  function shift(text, key, sign) {
    const t = azLetters(text), k = azLetters(key);
    if (!k.length) return [];
    return t.map((c, i) => AZ[(AZ.indexOf(c) + sign * AZ.indexOf(k[i % k.length]) + 26) % 26]);
  }
  function randomLetters(n) {   // crypto randomness, rejection-sampled so every letter is equally likely
    const out = [], lim = Math.floor(4294967296 / 26) * 26, buf = new Uint32Array(Math.max(8, n * 2));
    while (out.length < n) {
      crypto.getRandomValues(buf);
      for (const x of buf) if (x < lim && out.length < n) out.push(AZ[x % 26]);
    }
    return out.join("");
  }

  /* ---------- State ----------
     The preview canvas is always the export's own pixel size and CSS scales it down, so it ignores
     devicePixelRatio on purpose: what you see is the file you get, on any screen. */
  const textEl = $("#text");
  const view = $("#view");
  const vctx = view.getContext("2d");
  const statusEl = $("#status");
  const opts = { ...DEFAULTS };
  let cur = { text: "", skipped: [] }, L = null, prevText = "", fontsReady = false;
  let rain = false, busy = false;
  // Secret Transmission: the one-time key lives only in memory (never stored), and grows as the message does
  opts.secret = "off";
  let pad = "", secretInfo = null;
  const keyWordEl = $("#key-word"), hiddenEl = $("#hidden-text");
  function secretize(c) {
    secretInfo = null;
    if (opts.secret !== "pad" && opts.secret !== "word") return c;
    const plain = azLetters(c.text);
    const dropped = Array.from(c.text).filter((ch) => !/\s/.test(ch)).length - plain.length;
    if (opts.secret === "pad" && pad.length < plain.length) pad += randomLetters(plain.length - pad.length + 24);
    const key = opts.secret === "pad" ? pad.slice(0, plain.length) : azLetters(keyWordEl.value).join("");
    secretInfo = { n: plain.length, key, dropped };
    if (!plain.length) return { ...c, text: "" };
    if (!key.length) return { ...c, text: "", needKey: true };
    return { ...c, text: fives(shift(plain, key, 1)) };
  }
  function refreshSecret() {
    const on = opts.secret === "pad" || opts.secret === "word";
    $("#keybox").hidden = !on;
    if (!on) return;
    const isPad = opts.secret === "pad";
    $("#key-out").hidden = !isPad;
    keyWordEl.hidden = isPad;
    $("#key-copy").hidden = !isPad;
    $("#key-new").hidden = !isPad;
    $("#key-label").htmlFor = isPad ? "key-out" : "key-word";
    $("#key-label").textContent = isPad ? "Your one-time key" : "Your keyword";
    const i = secretInfo || { n: 0, key: "", dropped: 0 };
    $("#key-out").value = isPad ? fives(Array.from(i.key)) : "";
    let note = isPad ? "Anyone with this key can read the message. Send it privately and use it once. It isn't saved, so copy it now."
      : !i.key.length ? "Type a keyword. A short one repeats and can be broken: fine for puzzles."
      : i.key.length < i.n ? "Your keyword repeats, so this can be broken. Fine for puzzles, not for secrets."
      : "Your keyword is as long as the message: hard to break if it's random.";
    if (i.dropped) note += ` ${i.dropped} digit${i.dropped === 1 ? "" : "s"} or mark${i.dropped === 1 ? "" : "s"} left out: the code is letters only, so spell numbers out.`;
    $("#secret-note").textContent = note;
    $("#count").textContent = `${i.n} letter${i.n === 1 ? "" : "s"} in code`;
  }
  // Hidden Line: what the falling runes spell, if anything
  const hiddenGlyphs = () => Array.from(clean(hiddenEl.value).text.replace(/\s+/g, ""));


  const stored = load();
  if (stored && typeof stored === "object") {
    for (const k of Object.keys(DEFAULTS)) {
      const v = stored[k];
      const ok = document.querySelector(`input[name="${k}"][value="${CSS.escape(String(v))}"]`);
      if (ok) opts[k] = v;
    }
    if (typeof stored.text === "string" && clean(stored.text).text.trim()) textEl.value = stored.text;
    rain = stored.rain === true;
    if (typeof stored.hidden === "string") hiddenEl.value = stored.hidden;
  }
  for (const k of Object.keys(DEFAULTS)) {
    const r = document.querySelector(`input[name="${k}"][value="${opts[k]}"]`);
    if (r) r.checked = true;
  }

  function say(msg, warn) {
    if (statusEl.textContent === msg && statusEl.classList.contains("warn") === !!warn) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle("warn", !!warn);
  }

  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").trim().split(/\s+/).filter(Boolean)
    .slice(0, 4).join("-").slice(0, 48).replace(/-+$/, "");
  const fileName = (ext) => { const s = slug(cur.text); return `glitch-runes${s ? "-" + s : ""}.${ext}`; };

  let blockedWhy = "";
  function refreshUI() {
    const S = SIZES[opts.size];
    const n = Array.from(cur.text.replace(/\n/g, "")).length;
    $("#count").textContent = `${n} character${n === 1 ? "" : "s"}`;
    $("#px").textContent = L && !L.empty ? `· runes at ${L.size} px` : "";
    refreshSecret();
    $("#hidden-wrap").hidden = !rain;
    const sk = $("#skipped");
    if (cur.skipped.length) {
      const shown = cur.skipped.slice(0, 12);
      sk.innerHTML = "";
      sk.append("Skipped: ");
      shown.forEach((g) => { const e = document.createElement("span"); e.className = "em"; e.textContent = g; sk.append(e); });
      if (cur.skipped.length > shown.length) sk.append(`+${cur.skipped.length - shown.length} more`);
      sk.hidden = false;
    } else sk.hidden = true;

    $$("[data-size]").forEach((e) => (e.textContent = `${S.w}×${S.h}`));
    $("#dims").textContent = rain && L && !L.empty
      ? `${S.w} × ${S.h} px · GIF ${Math.round(S.w * gifScale(L))} × ${Math.round(S.h * gifScale(L))}` : `${S.w} × ${S.h} px`;
    $("#rain").setAttribute("aria-pressed", String(rain));
    $("#rain-state").textContent = rain ? "On" : "Off";
    $("#save-gif").hidden = !rain;
    $("#rain-note").hidden = !rain;
    $("#rain-size").hidden = !rain;
    // Each choice says how big its runes come out in the GIF
    $$("[data-rune]").forEach((e) => (e.textContent = L && !L.empty ? `${Math.max(1, Math.round(rainCell(L, e.dataset.rune) * gifScale(L)))} px` : ""));
    if (L) $("#gif-size").textContent = `${Math.round(S.w * gifScale(L))}×${Math.round(S.h * gifScale(L))} · 4 s loop`;
    view.classList.toggle("clear", opts.bg === "clear");
    $("#clear-note").hidden = opts.bg !== "clear";
    const cn = $("#cap-note");
    cn.hidden = opts.cap !== "decode";
    cn.textContent = "Your text under the runes, its last letters still in code.";
    $("#empty-note").hidden = !(L && L.empty);
    view.setAttribute("aria-label", L && !L.empty ? `${cur.text.replace(/\s+/g, " ").trim()}, set in Glitch Runes, ${S.w} by ${S.h}` : "Empty preview");

    blockedWhy = "";
    if (cur.needKey) blockedWhy = "Type a keyword first.";
    else if (!L || L.empty) blockedWhy = cur.skipped.length ? "None of those characters are in the font. Try letters or numbers." : "Type something first.";
    else if (L.tooLong) blockedWhy = opts.size === "story" ? "Too long even for Story. Cut some words." : "Too long for this size, try Story";
    ["#save-png", "#save-jpg", "#copy", "#save-gif"].forEach((id) => $(id).setAttribute("aria-disabled", blockedWhy || busy ? "true" : "false"));
    if (blockedWhy) say(blockedWhy, true);
    else if (statusEl.classList.contains("warn")) say("");
  }

  /* ---------- The sweep: changed text shows as plain letters, then decodes into runes left to right ---------- */
  let anim = null, animTimer = null;
  const FPS = 24, FRAMES = 10;  // about 400 ms, stepped like glitch.js
  const glyphCount = (t) => Array.from(t).filter((c) => !/\s/.test(c)).length;

  function render(animate) {
    const before = prevText;
    cur = secretize(clean(textEl.value));
    L = layout(cur.text, opts);
    prevText = cur.text;
    // The preview is the export's own size: resize it with the Size setting (this also clears it)
    if (view.width !== L.W || view.height !== L.H) { view.width = L.W; view.height = L.H; }
    refreshUI();
    if (!fontsReady) return;
    if (rain) { stopSweep(); startRain(); return; }
    stopRain();
    if (animate && !reduce && !L.empty) {
      let d = 0;
      const a = Array.from(before), b = Array.from(cur.text);
      while (d < a.length && d < b.length && a[d] === b[d]) d++;
      const from = glyphCount(b.slice(0, d).join(""));
      const count = glyphCount(cur.text) - from;
      if (count > 0) {
        const start = anim ? Math.min(anim.from, from) : from;
        anim = { from: start, count: glyphCount(cur.text) - start, f: 0 };
        if (!animTimer) animTimer = setInterval(tick, 1000 / FPS);
        tick();
        return;
      }
    }
    if (anim) { anim.count = Math.max(0, glyphCount(cur.text) - anim.from); return; }
    draw(vctx, L, opts, null, 0.72);
  }
  function stopSweep() { if (anim) { clearInterval(animTimer); animTimer = null; anim = null; } }

  /* ---------- Rain preview: plays the loop the GIF will hold, from the same frames ---------- */
  let R = null, rainTimer = null, rainF = 0;
  function startRain() {
    if (L.empty) { stopRain(); draw(vctx, L, opts, null, 0.72); return; }
    R = { m: rainModel(L, opts), layer: rainLayers(L, opts, 1) };
    rainFrame(vctx, L, opts, R.m, R.layer, rainF, 1);
    if (!reduce && !rainTimer && !document.hidden) rainTimer = setInterval(() => {
      rainF = (rainF + 1) % LOOP;
      rainFrame(vctx, L, opts, R.m, R.layer, rainF, 1);
    }, 1000 / FPS);
  }
  function stopRain() { clearInterval(rainTimer); rainTimer = null; R = null; }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearInterval(rainTimer); rainTimer = null; }
    else if (rain && fontsReady && L) startRain();
  });

  function tick() {
    if (!anim) return;
    anim.f++;
    const t = Math.min(1, anim.f / FRAMES);
    const pos = anim.from - 2 + t * (anim.count + 2);
    draw(vctx, L, opts, { from: anim.from, pos }, 0.72 * Math.max(t, opts.cap === "decode" ? 0 : 1));
    if (anim.f >= FRAMES) {
      clearInterval(animTimer); animTimer = null; anim = null;
      draw(vctx, L, opts, null, 0.72);
    }
  }

  /* ---------- Fonts: a canvas drawn before the font is ready silently exports a fallback font ---------- */
  async function fontsLoaded() {
    await Promise.all([
      document.fonts.load('64px "Glitch Runes"', "BE THE GLITCH"),
      document.fonts.load('32px "Share Tech Mono"', "> be the glitch"),
    ]);
    return document.fonts.check('64px "Glitch Runes"', "A");
  }
  function measure() {
    const c = document.createElement("canvas").getContext("2d");
    c.font = '100px "Glitch Runes"'; const r = c.measureText("MMMMMMMMMM").width / 1000;
    c.font = '100px "Share Tech Mono"'; const m = c.measureText("MMMMMMMMMM").width / 1000;
    if (r > 0.3 && r < 1.2) RUNE_ADV = r;
    if (m > 0.3 && m < 1.2) MONO_ADV = m;
  }

  /* ---------- Export: always a fresh full-size canvas, never the preview mid-sweep ---------- */
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  async function makeBlob(type) {
    await fontsLoaded();
    const Lx = layout(cur.text, opts);
    if (Lx.empty || Lx.tooLong) return null;
    const c = document.createElement("canvas");
    c.width = Lx.W; c.height = Lx.H;
    const jpgOnClear = type === "image/jpeg" && !GROUNDS[opts.bg];
    draw(c.getContext("2d"), Lx, opts, null, 0.72, jpgOnClear ? "#000000" : null);
    return new Promise((res) => c.toBlob(res, type, 0.92));
  }

  function showSheet(url) {
    $("#sheet-img").src = url;
    $("#sheet").hidden = false;
    $("#sheet-close").focus();
  }
  $("#sheet-close").addEventListener("click", () => { $("#sheet").hidden = true; $("#save-png").focus(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) $("#sheet-close").click(); });

  async function save(kind) {
    if (busy) return;
    if (blockedWhy) { say(blockedWhy, true); return; }
    const type = kind === "jpg" ? "image/jpeg" : kind === "gif" ? "image/gif" : "image/png";
    const name = fileName(kind);
    // iOS Safari ignores download on data URLs, so open the image in its own tab to long-press.
    // The tab has to open inside the click, before anything is awaited, or it gets blocked.
    const tab = iOS ? window.open("", "_blank") : null;
    let blob;
    if (kind === "gif") {
      busy = true; refreshUI();
      const sz = $("#gif-size"), was = sz.textContent;
      say("Making the GIF: 96 frames.");
      try { blob = await makeGif((n) => { sz.textContent = `Frame ${n} of ${LOOP}`; }); } catch (e) { blob = null; }
      busy = false; sz.textContent = was; refreshUI();
    } else {
      try { blob = await makeBlob(type); } catch (e) { blob = null; }
    }
    if (!blob) { if (tab) tab.close(); say("Couldn't make the image. Try again.", true); return; }
    const url = URL.createObjectURL(blob);
    if (iOS) {
      if (tab) {
        const d = tab.document;
        d.write(`<!DOCTYPE html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title>` +
          `<body><p>&gt; LONG-PRESS THE IMAGE, THEN SAVE TO PHOTOS</p></body>`);
        d.close();
        // Styled through the DOM, not style attributes, so a strict security policy allows it
        d.body.style.cssText = "margin:0;background:#000;color:#4cf274;font:16px monospace;text-align:center";
        d.querySelector("p").style.padding = "14px";
        const img = d.createElement("img");
        img.alt = name;
        img.style.cssText = "max-width:100%;-webkit-touch-callout:default";
        img.src = url;
        d.body.appendChild(img);
      } else showSheet(url);
      say(`Opened ${name}. Long-press to save.`);
      return;
    }
    const a = document.createElement("a");
    a.href = url; a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    const mb = kind === "gif" ? ` (${(blob.size / 1e6).toFixed(1)} MB)` : "";
    say((kind === "jpg" || kind === "gif") && !GROUNDS[opts.bg]
      ? `Saved ${name} on black${mb} (${kind.toUpperCase()} has no transparency)` : `Saved ${name} to your downloads${mb}`);
  }

  $("#save-png").addEventListener("click", () => save("png"));
  $("#save-jpg").addEventListener("click", () => save("jpg"));
  $("#save-gif").addEventListener("click", () => save("gif"));
  $("#rain").addEventListener("click", () => { rain = !rain; rainF = 0; render(false); persist(); });
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); save(rain ? "gif" : "png"); }
  });

  // Copy image: only where the browser can put a PNG on the clipboard
  const copyBtn = $("#copy");
  // ClipboardItem.supports, where a browser has it, says up front whether a PNG can go on the clipboard
  const canCopyPng = window.isSecureContext && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write
    && (typeof ClipboardItem.supports !== "function" || ClipboardItem.supports("image/png"));
  if (canCopyPng) {
    copyBtn.hidden = false;
    copyBtn.addEventListener("click", async () => {
      if (blockedWhy) { say(blockedWhy, true); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": makeBlob("image/png").then((b) => b || Promise.reject()) })]);
        say("Copied the image. Paste it anywhere.");
      } catch (e) { say("This browser wouldn't copy it. Use Save PNG.", true); }
    });
  }

  /* ---------- Inputs ---------- */
  textEl.addEventListener("input", () => { render(true); persist(); });
  $$(".seg input").forEach((r) => r.addEventListener("change", () => {
    opts[r.name] = r.value;
    stopSweep();
    render(false);
    persist();
  }));

  /* ---------- Secret Transmission: key controls ---------- */
  keyWordEl.addEventListener("input", () => { render(true); });
  $("#key-new").addEventListener("click", () => { pad = ""; render(true); say("New key made. Copy it before you send the image."); });
  async function copyText(text, el) {
    try {
      if (!window.isSecureContext || !navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      if (el) { el.hidden = false; el.focus(); el.select(); try { return document.execCommand("copy"); } catch (e2) { return false; } }
      return false;
    }
  }
  $("#key-copy").addEventListener("click", async () => {
    const k = $("#key-out");
    const ok = await copyText(k.value, null);
    if (!ok) { k.focus(); k.select(); try { document.execCommand("copy"); } catch (e) { /* select is enough */ } }
    say(ok ? "Key copied. Send it privately, not with the image." : "Key selected. Press Ctrl+C to copy it.");
  });

  /* ---------- Decoder: the cipher backwards, with a rune keyboard for reading an image ---------- */
  (() => {
    const code = $("#dec-code"), key = $("#dec-key"), out = $("#dec-out"), keys = $("#dec-keys"), note = $("#dec-note");
    for (const ch of AZ) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = ch; b.setAttribute("aria-label", `Rune for ${ch}`);
      b.addEventListener("click", () => { code.value += ch; run(); });
      keys.appendChild(b);
    }
    const del = document.createElement("button");
    del.type = "button"; del.className = "del"; del.textContent = "⌫"; del.setAttribute("aria-label", "Delete the last letter");
    del.addEventListener("click", () => { code.value = code.value.replace(/[A-Za-z][^A-Za-z]*$/, ""); run(); });
    keys.appendChild(del);
    let timer = null;
    function run() {
      clearInterval(timer);
      const c = azLetters(code.value), k = azLetters(key.value);
      if (!c.length || !k.length) {
        out.textContent = ""; $("#dec-say").textContent = "";
        note.textContent = c.length ? "Now add the key." : "Works with runes.py too: same letters, same key.";
        return;
      }
      const plain = shift(c, k, -1).join("");
      note.textContent = k.length < c.length ? "The key is shorter than the code, so it repeats." : "That's what this key gives.";
      const done = () => { out.textContent = plain; $("#dec-say").textContent = `Decoded: ${plain}`; };
      if (reduce) return done();
      let f = 0; const N = 10;
      const frame = () => {
        f++;
        out.textContent = "";
        Array.from(plain).forEach((ch, i) => {
          const s = document.createElement("span");
          if (i < (f / N) * plain.length) s.textContent = ch; else { s.className = "rn"; s.textContent = next(); }
          out.appendChild(s);
        });
        if (f >= N) { clearInterval(timer); done(); }
      };
      frame();
      timer = setInterval(frame, 1000 / 24);
    }
    code.addEventListener("input", run);
    key.addEventListener("input", run);
  })();

  /* ---------- Hidden Line ---------- */
  hiddenEl.addEventListener("input", () => { if (rain) render(false); persist(); });

  /* ---------- Wordmark: breaks into runes and decodes back (glitch.js) ---------- */
  (function wordmark(mark) {
    const word = mark.querySelector(".mk-word");
    const texts = [];
    const walker = document.createTreeWalker(word, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) texts.push(walker.currentNode);
    const chars = [];
    texts.forEach((t) => {
      const frag = document.createDocumentFragment();
      for (const c of t.nodeValue) {
        if (c === " ") { frag.appendChild(document.createTextNode(" ")); continue; }
        const s = document.createElement("span");
        s.className = "ch"; s.textContent = c; s.dataset.own = c.toUpperCase();
        frag.appendChild(s); chars.push(s);
      }
      t.replaceWith(frag);
    });
    const strip = document.createElement("span");
    strip.className = "mk-runes";
    strip.setAttribute("aria-hidden", "true");
    const rows = Array.from({ length: 5 }, (_, k) => {
      const r = document.createElement("span");
      r.line = LINES[k % LINES.length] + "   ";
      r.off = (k * 5) % r.line.length;
      r.draw = () => { r.textContent = r.line.repeat(Math.ceil(110 / r.line.length) + 1).slice(r.off, r.off + 96); };
      r.step = () => { r.off = (r.off + 1) % r.line.length; r.draw(); };
      r.draw(); strip.appendChild(r);
      return r;
    });
    mark.insertBefore(strip, word);
    if (reduce) return;
    const set = (s, r) => { if (r == null) return s.classList.remove("rn"); s.classList.add("rn"); s.dataset.r = r; };
    const flash = (cls, ms) => { mark.classList.add(cls); setTimeout(() => mark.classList.remove(cls), ms); };
    const n = chars.length, OUT = 8, CODE = 16, IN = 10;
    let phase = "decode", f = 0, hold = 0, timer = null;
    chars.forEach((s) => set(s, next()));
    const step = () => {
      f++;
      if (phase === "code") rows.forEach((r) => r.step());
      else if (Math.random() < 0.12) rows[(Math.random() * rows.length) | 0].step();
      if (phase === "decode" || phase === "in") {
        const len = phase === "in" ? IN : 16;
        chars.forEach((s, i) => set(s, i < (f / len) * n ? null : next()));
        if (phase === "in" && f === len - 2) flash("jolt2", 84);
        if (f >= len) {
          chars.forEach((s) => set(s, null));
          mark.classList.remove("code");
          phase = "word"; f = 0; hold = Math.round(24 * (6 + Math.random() * 3));
        }
      } else if (phase === "word") {
        if (f >= hold) { phase = "out"; f = 0; flash("jolt", 84); flash("slice", 125); }
      } else if (phase === "out") {
        chars.forEach((s, i) => { if (i < (f / OUT) * n) set(s, f >= OUT - 1 ? s.dataset.own : next()); });
        if (f === 4) flash("jolt2", 42);
        if (f >= OUT) { mark.classList.add("code"); chars.forEach((s) => set(s, s.dataset.own)); phase = "code"; f = 0; }
      } else if (phase === "code") {
        if (f >= CODE) { phase = "in"; f = 0; flash("jolt", 84); }
      }
    };
    const run = () => { if (!timer) timer = setInterval(step, 1000 / 24); };
    const stop = () => { clearInterval(timer); timer = null; };
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
    run();
  })($("#mark"));

  /* ---------- Start: focus the box with the text selected, so typing replaces it ---------- */
  render(false);
  try { textEl.focus({ preventScroll: true }); } catch (e) { textEl.focus(); }
  textEl.select();
  fontsLoaded().then(() => {
    fontsReady = true;
    measure();
    prevText = "";
    render(true);   // first load: BE THE GLITCH decodes in once
  });
})();
