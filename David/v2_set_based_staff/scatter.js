// Song timeline driven by the chord-progression staff. Reads Erik's cleaned Chords-Explorer/Erik/chordonomicon_transformed.csv.gz in the browser.
const CSV_URL = "../../Erik/chordonomicon_transformed.csv.gz";   // Chords-Explorer/Erik/chordonomicon_transformed.csv.gz (sharps written "#")
const X_MIN = 1950, X_MAX = 2022;
const COLORS = ["#9aa5ad", "#e15759", "#4e79a7", "#f28e2b", "#b07aa1", "#59a14f", "#edc948", "#76b7b2", "#ff9da7", "#9c755f", "#17becf", "#bab0ac", "#7f3c8d"];
const margin = { top: 8, right: 16, bottom: 34, left: 16 };
const canvas = document.getElementById("dots"), ctx = canvas.getContext("2d");
const axes = d3.select("#axes"), labels = d3.select("#labels"), tooltip = d3.select("#tooltip");
const CH = i => String.fromCharCode(65 + i);   // chord index (pitch class x major/minor, 0-23) -> one character, so a progression is a substring of the song's chord string
const PC = { "C#": 1, "D#": 3, "E#": 5, "F#": 6, "G#": 8, "A#": 10, "B#": 0, C: 0, Cs: 1, Db: 1, D: 2, Ds: 3, Eb: 3, E: 4, Fb: 4, Es: 5, F: 5, Fs: 6, Gb: 6, G: 7, Gs: 8, Ab: 8, A: 9, As: 10, Bb: 10, B: 11, Cb: 11, Bs: 0 };   // F# and Gb are the same chord

let items = [], GENRES = [], color = () => "#999", dots = [], quad = null, W = 0, H = 0;
let selected = null, qArtist = "", qSong = "", prog = [], progStr = "", match = null, popTimer = null;

const varId = new Map(), VAR_BY_IDX = Array.from({ length: 24 }, () => new Set());   
let need = [], anyVar = false;   

// ---------- streaming CSV reader ----------
function csvParser(onRow) {
  let row = [], field = "", inQ = false, pend = false;
  const re = /[,"\n]/g;
  return chunk => {
    let pos = 0; const n = chunk.length;
    if (pend) { pend = false; if (chunk[0] === '"') { field += '"'; pos = 1; } else inQ = false; }
    while (pos < n) {
      if (inQ) {
        const q = chunk.indexOf('"', pos);
        if (q < 0) { field += chunk.slice(pos); break; }
        field += chunk.slice(pos, q); pos = q + 1;
        if (pos >= n) { pend = true; break; }
        if (chunk[pos] === '"') { field += '"'; pos++; } else inQ = false;
      } else {
        re.lastIndex = pos; const m = re.exec(chunk);
        if (!m) { field += chunk.slice(pos); break; }
        field += chunk.slice(pos, m.index); pos = m.index + 1;
        const c = m[0];
        if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); field = ""; onRow(row); row = []; }
        else if (field === "") inQ = true; else field += '"';
      }
    }
  };
}

// Chord -> 0..23 = pitch class x major/minor. "Amin7" -> A minor, "A/Cs" -> A, "Fsmaj7" -> F#, "Fsus4" -> F (the "s" in sus is not a sharp)
const chordRx = /^([A-G](?:#|s(?!us)|b)?)([^/]*)/;
async function readSongs(stream, gz, progress) {
  let text = stream;
  if (gz) text = text.pipeThrough(new DecompressionStream("gzip"));
  const reader = text.pipeThrough(new TextDecoderStream()).getReader();
  let col = null, count = 0;
  const seen = new Set(), out = [], tokId = new Map();
  const idOf = t => {
    let v = tokId.get(t);
    if (v === undefined) {
      const m = t[0] === "<" ? null : chordRx.exec(t);
      if (!m || PC[m[1]] === undefined) v = -1; else {
        const q = m[2]; v = PC[m[1]] * 2 + (q.startsWith("min") || (q.startsWith("m") && !q.startsWith("maj")) ? 1 : 0);
        if (!varId.has(t)) varId.set(t, varId.size);
        VAR_BY_IDX[v].add(t);
      }
      tokId.set(t, v);
    }
    return v;
  };
  const parse = csvParser(r => {
    if (!col) { col = Object.fromEntries(r.map((h, i) => [h, i])); return; }
    count++;
    const id = r[col.spotify_song_id]; if (!id || seen.has(id)) return; seen.add(id);
    const d = /^(\d{4})-(\d\d)-(\d\d)/.exec(r[col.release_date]); if (!d) return;
    const year = +d[1] + (Date.UTC(+d[1], +d[2] - 1, +d[3]) - Date.UTC(+d[1], 0, 1)) / 86400000 / 365.25;
    if (year < X_MIN) return;
    let seq = "", vs = "", last = -2;
    for (const t of r[col.chords].split(" ")) { const v = idOf(t); if (v < 0 || v === last) continue; seq += CH(v); vs += String.fromCharCode(varId.get(t)); last = v; }
    if (seq.length < 2) return;
    out.push({ year, g: r[col.main_genre] || "unlabeled", seq, vs, title: r[col.track], artist: r[col.artist], pop: +r[col.popularity] || 0 });
  });
  for (;;) { const { done, value } = await reader.read(); if (done) break; parse(value); progress(count); }
  return { songs: out };
}

// ---------- matching ----------
function hasProg(it, str) {   // la progresión aparece en la canción, respetando las variantes elegidas
  let p = it.seq.indexOf(str);
  if (!anyVar) return p >= 0;
  while (p >= 0) {
    let ok = true;
    for (let k = 0; k < need.length; k++) if (need[k] !== -1 && it.vs.charCodeAt(p + k) !== need[k]) { ok = false; break; }
    if (ok) return true;
    p = it.seq.indexOf(str, p + 1);
  }
  return false;
}
function recomputeMatches() {
  progStr = prog.map(c => CH(ChordStaff.idx(c))).join("");
  need = prog.map(c => c.variant ? (varId.get(c.variant) ?? -2) : -1);
  anyVar = need.some(k => k !== -1);
  match = new Uint8Array(items.length);
  if (progStr) for (let i = 0; i < items.length; i++) match[i] = hasProg(items[i], progStr) ? 1 : 0;
}
function nextShares() {
  const n = d3.sum(match); if (!n || prog.length >= 4) return null;
  const f = new Array(24).fill(0);
  for (let k = 0; k < 24; k++) { const t = progStr + CH(k); let m = 0; for (let i = 0; i < items.length; i++) if (match[i] && hasProg(items[i], t)) m++; f[k] = m / n; }
  return f;
}

// ---------- layout / drawing ----------
const hash = (i, a, b) => { const v = Math.sin(i * a + b) * 43758.5453; return v - Math.floor(v); };
// round the visible years outward so the dots fill the chart (1986–2018 -> 1980–2020)
function yearDomain() {
  let lo = Infinity, hi = -Infinity, n = 0;
  if (match) for (let i = 0; i < items.length; i++) {
    if (!match[i] || (selected !== null && items[i].g !== selected)) continue;
    const y = items[i].year; n++;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  if (!n) return [X_MIN, X_MAX, 10];
  lo = Math.floor(lo); hi = Math.ceil(hi);
  const span = Math.max(hi - lo, 1);
  const step = span >= 30 ? 10 : span >= 12 ? 5 : span >= 4 ? 2 : 1;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi <= lo) hi = lo + step;
  return [lo, hi, step];
}
function layout() {
  const box = canvas.parentElement.getBoundingClientRect(); W = box.width; H = box.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  axes.attr("viewBox", `0 0 ${W} ${H}`);
  labels.attr("viewBox", `0 0 ${W} ${H}`);
  fitAxis(false);
}
function fitAxis(animate) {
  const [lo, hi, step] = yearDomain();
  const x = d3.scaleLinear([lo, hi], [margin.left + 30, W - margin.right - 10]);
  dots = items.map((d, i) => ({ d, i, px: x(d.year + (Number.isInteger(d.year) ? (d.j2 - 0.5) * 0.9 : 0)), py: margin.top + 6 + d.j * (H - margin.top - margin.bottom - 12) }));
  quad = d3.quadtree().x(p => p.px).y(p => p.py).addAll(dots);
  axes.selectAll("*").remove();
  const ticks = d3.range(lo, hi + step * 0.5, step);
  axes.append("g").selectAll("line").data(ticks).join("line").attr("class", "band-line").attr("x1", t => x(t)).attr("x2", t => x(t)).attr("y1", margin.top).attr("y2", H - margin.bottom);
  axes.append("g").attr("class", "axis").attr("transform", `translate(0,${H - margin.bottom + 6})`).call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("d")).tickSizeOuter(0));
  refresh(animate);
}
const searching = () => qArtist !== "" || qSong !== "";
const hit = d => (!qArtist || d.la.includes(qArtist)) && (!qSong || d.lt.includes(qSong));
const dotR = (p, extra, k) => (0.9 + (p.d.pop / 100) * 1.7 + extra) * k * boost;
let groups = [], visibleCount = 0, boost = 1, featured = new Uint8Array(0), featKey = "";
// one most-popular match per genre, or the top 5 in the selected genre (later year wins a popularity tie)
function pickFeatured() {
  const key = progStr + "\0" + need.join(",") + "\0" + selected;
  if (key === featKey && featured.length === items.length) return;
  featKey = key;
  featured = new Uint8Array(items.length);
  if (!progStr) return;
  const better = (i, b) => items[i].pop > items[b].pop || (items[i].pop === items[b].pop && items[i].year > items[b].year);
  if (selected !== null) {
    const idxs = [];
    for (let i = 0; i < items.length; i++) if (match[i] && items[i].g === selected) idxs.push(i);
    idxs.sort((a, b) => items[b].pop - items[a].pop || items[b].year - items[a].year || a - b);
    for (let k = 0; k < Math.min(5, idxs.length); k++) featured[idxs[k]] = 1;
  } else {
    const best = new Array(GENRES.length).fill(-1);
    for (let i = 0; i < items.length; i++) {
      if (!match[i]) continue;
      const g = items[i].g, b = best[g];
      if (b < 0 || better(i, b)) best[g] = i;
    }
    for (const i of best) if (i >= 0) featured[i] = 1;
  }
}
function regroup() {
  pickFeatured();
  groups = GENRES.map(() => ({ dim: [], hl: [], featDim: [], featHl: [] })); visibleCount = 0;
  for (const p of dots) {
    p.vis = !!match[p.i] && (selected === null || p.d.g === selected);
    if (!p.vis) continue;
    visibleCount++;
    const dim = searching() && !hit(p.d);
    groups[p.d.g][featured[p.i] ? (dim ? "featDim" : "featHl") : (dim ? "dim" : "hl")].push(p);
  }
  boost = Math.min(4, Math.max(1, Math.pow(30000 / Math.max(visibleCount, 1), 0.35)));   // fewer songs on screen -> bigger dots
  const e = d3.select("#empty");
  if (!prog.length) e.attr("hidden", null).text("Build a progression in Step 2 and the songs that play them in that order will appear here. The most popular song in each genre is outlined.");
  else if (!visibleCount) e.attr("hidden", null).text("No songs play these chords in this order" + (selected !== null ? " in this genre." : "."));
  else e.attr("hidden", true);
}
function paintGroup(list, fill, alpha, extra, k) {
  if (!list.length) return;
  ctx.fillStyle = fill; ctx.globalAlpha = alpha; ctx.beginPath();
  for (const p of list) { const r = dotR(p, extra, k); ctx.moveTo(p.px + r, p.py); ctx.arc(p.px, p.py, r, 0, 6.2832); }
  ctx.fill();
}
function paintBorder(list, alpha, extra, k) {
  if (!list.length) return;
  ctx.globalAlpha = alpha; ctx.strokeStyle = "#172a38"; ctx.lineWidth = 4;
  for (const p of list) { const r = dotR(p, extra, k) + 2; ctx.beginPath(); ctx.arc(p.px, p.py, r, 0, 6.2832); ctx.stroke(); }
}
function draw(t = 1) {
  ctx.clearRect(0, 0, W, H);
  const k = d3.easeBackOut.overshoot(1.6)(t), fade = Math.min(1, t * 2), s = searching();
  const hlA = (s ? 0.9 : boost > 1.5 ? 0.75 : 0.55) * fade;
  groups.forEach((g, i) => { paintGroup(g.dim, color(GENRES[i]), 0.1 * fade, 0, k); paintGroup(g.hl, color(GENRES[i]), hlA, s ? 0.5 : 0, k); });
  groups.forEach((g, i) => {   // popular songs sit on top of the cloud, with the large border
    paintGroup(g.featDim, color(GENRES[i]), 0.45 * fade, 0.6, k);
    paintGroup(g.featHl, color(GENRES[i]), Math.min(1, hlA + 0.3), (s ? 0.8 : 0.6), k);
    paintBorder(g.featDim, 0.55 * fade, 0.6, k);
    paintBorder(g.featHl, fade, (s ? 0.8 : 0.6), k);
  });
  ctx.globalAlpha = 1;
}
const LABEL_W = 176, LABEL_H = 38, LABEL_GAP = 18;
function measureText(text, size, weight) {
  const t = labels.append("text").attr("font-size", size).attr("font-weight", weight).attr("font-family", "Inter, Segoe UI, Arial, sans-serif").text(text);
  const w = t.node().getComputedTextLength();
  t.remove();
  return w;
}
function fitText(s, max, size, weight) {
  s = String(s);
  if (measureText(s, size, weight) <= max) return s;
  let lo = 1, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measureText(s.slice(0, mid) + "…", size, weight) <= max) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + "…";
}
function boxesOverlap(a, b, pad) {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}
function inPlot(b) {
  return b.x >= 2 && b.y >= 2 && b.x + b.w <= W - 2 && b.y + b.h <= H - margin.bottom + 4;
}
function labelAnchor(box, px, py) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, dx = px - cx, dy = py - cy;
  if (Math.abs(dx) * box.h > Math.abs(dy) * box.w) return { x: dx > 0 ? box.x + box.w : box.x, y: Math.max(box.y + 6, Math.min(box.y + box.h - 6, py)) };
  return { x: Math.max(box.x + 6, Math.min(box.x + box.w - 6, px)), y: dy > 0 ? box.y + box.h : box.y };
}
function placeLabels() {
  labels.selectAll("*").remove();
  if (!W || !progStr) return;
  const songs = [];
  groups.forEach(g => g.featHl.forEach(p => songs.push(p)));
  songs.sort((a, b) => b.d.pop - a.d.pop || b.d.year - a.d.year);
  const taken = songs.map(p => ({ x: p.px - 11, y: p.py - 11, w: 22, h: 22 }));
  const placed = [];
  for (const p of songs) {
    const title = fitText(p.d.title, LABEL_W - 16, 12, 700);
    const tail = ` · ${Math.floor(p.d.year)} · ${p.d.pop}`;
    const artist = fitText(p.d.artist, Math.max(24, LABEL_W - 16 - measureText(tail, 11, 400)), 11, 400);
    const meta = artist + tail;
    const w = Math.min(LABEL_W, Math.max(measureText(title, 12, 700), measureText(meta, 11, 400)) + 16);
    const h = LABEL_H;
    const cx = p.px - w / 2, mid = p.py - h / 2;
    const spots = [
      [cx, p.py - LABEL_GAP - h], [cx, p.py + LABEL_GAP], [p.px + LABEL_GAP, mid], [p.px - LABEL_GAP - w, mid],
      [p.px + LABEL_GAP, p.py - LABEL_GAP - h], [p.px - LABEL_GAP - w, p.py - LABEL_GAP - h],
      [p.px + LABEL_GAP, p.py + LABEL_GAP], [p.px - LABEL_GAP - w, p.py + LABEL_GAP]
    ];
    for (let k = 1; k <= 5; k++) {
      spots.push([cx, p.py - LABEL_GAP - h - k * (h + 6)], [cx, p.py + LABEL_GAP + k * (h + 6)]);
      spots.push([p.px + LABEL_GAP + k * 14, mid], [p.px - LABEL_GAP - w - k * 14, mid]);
    }
    const free = box => inPlot(box) && !taken.some(o => boxesOverlap(box, o, 4));
    let box = null;
    for (const [x, y] of spots) { const b = { x, y, w, h }; if (free(b)) { box = b; break; } }
    if (!box) {
      let best = null, bestD = Infinity;
      for (let y = 2; y <= H - margin.bottom - h; y += 10) {
        for (let x = 2; x <= W - w - 2; x += 12) {
          const b = { x, y, w, h };
          if (!free(b)) continue;
          const dx = x + w / 2 - p.px, dy = y + h / 2 - p.py, d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = b; }
        }
      }
      box = best;
    }
    if (!box) box = { x: Math.max(2, Math.min(cx, W - w - 2)), y: Math.max(2, Math.min(p.py - LABEL_GAP - h, H - margin.bottom - h)), w, h };
    taken.push(box);
    placed.push({ ...box, px: p.px, py: p.py, title, meta, g: p.d.g, ax: 0, ay: 0 });
  }
  const layer = labels.append("g");
  for (const lab of placed) {
    const a = labelAnchor(lab, lab.px, lab.py);
    const node = layer.append("g").attr("class", "callout");
    node.append("line").attr("x1", lab.px).attr("y1", lab.py).attr("x2", a.x).attr("y2", a.y).attr("stroke", color(GENRES[lab.g])).attr("stroke-width", 1.25);
    node.append("rect").attr("x", lab.x).attr("y", lab.y).attr("width", lab.w).attr("height", lab.h).attr("rx", 7).attr("fill", "rgba(255,255,255,.95)").attr("stroke", color(GENRES[lab.g])).attr("stroke-width", 1.5);
    node.append("text").attr("class", "callout-title").attr("x", lab.x + 8).attr("y", lab.y + 16).text(lab.title);
    node.append("text").attr("class", "callout-meta").attr("x", lab.x + 8).attr("y", lab.y + 30).text(lab.meta);
  }
}
function refresh(animate) {
  regroup(); updateSummary(); placeLabels();
  if (popTimer) popTimer.stop();
  if (!animate || !visibleCount) { draw(1); return; }
  popTimer = d3.timer(el => { const t = Math.min(1, el / 550); draw(t); if (t === 1) popTimer.stop(); });   // matching songs pop in
}

// ---------- legend, summary, inputs ----------
let legend;
function buildLegend() {
  legend = d3.select("#legend").selectAll("button").data(GENRES.map((g, i) => ({ g, i }))).join("button")
    .attr("type", "button").on("click", (e, d) => { selected = selected === d.i ? null : d.i; syncLegend(); fitAxis(true); });
  legend.append("span").attr("class", "swatch").style("background", d => color(d.g));
  legend.append("span").attr("class", "lt"); syncLegend();
}
function syncLegend() {
  legend.classed("is-active", d => selected === d.i).classed("is-dim", d => selected !== null && selected !== d.i).attr("aria-pressed", d => selected === d.i);
}
function updateSummary() {
  const counts = new Array(GENRES.length).fill(0); let n = 0, y0 = Infinity, y1 = -Infinity;
  if (progStr) items.forEach((d, i) => {
    if (!match[i]) return;
    counts[d.g]++; n++;
    const onChart = selected === null || d.g === selected;
    if (onChart && d.year < y0) y0 = d.year;
    if (onChart && d.year > y1) y1 = d.year;
  });
  legend.select(".lt").text(d => progStr ? `${d.g} (${counts[d.i].toLocaleString()})` : d.g)
    .each(function (d) { this.parentNode.classList.toggle("is-empty", !!progStr && counts[d.i] === 0); });
  if (!progStr) {
    d3.select("#summary").text("No chords selected. Build a progression in Step 2.");
    return;
  }
  const pills = prog.map(c => `<span class="sum-chord">${esc(ChordStaff.label(c))}</span>`).join('<span class="sum-arrow" aria-hidden="true">→</span>');
  const genreN = counts.reduce((a, c) => a + (c > 0 ? 1 : 0), 0);
  let topI = 0;
  counts.forEach((c, i) => { if (c > counts[topI]) topI = i; });
  const years = n && y0 <= y1 ? (Math.floor(y0) === Math.floor(y1) ? String(Math.floor(y0)) : `${Math.floor(y0)}–${Math.floor(y1)}`) : "—";
  const pct = items.length ? (100 * n / items.length).toFixed(1) : "0.0";
  const stat = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  let stats, note;
  if (selected !== null) {
    const shown = counts[selected] || 0, top = Math.min(5, shown);
    stats = stat("On the chart", shown.toLocaleString()) + stat("All matches", `${n.toLocaleString()} · ${pct}%`) + stat("Outlined", top ? String(top) : "—") + stat("Release years", years);
    note = shown
      ? `Limited to <b>${esc(GENRES[selected])}</b>. The top ${top} by Spotify popularity are outlined.`
      : `No <b>${esc(GENRES[selected])}</b> songs play these chords in this order.`;
  } else {
    stats = stat("Matching songs", n.toLocaleString()) + stat("Share of catalog", `${pct}%`) + stat("Genres", genreN.toLocaleString()) + stat("Release years", years);
    note = n
      ? `Outlined dots are the most popular matching song in each genre. <b>${esc(GENRES[topI])}</b> has the most matches (${counts[topI].toLocaleString()}).`
      : "No songs play these chords in this order.";
  }
  d3.select("#summary").html(`<div class="sum"><div class="sum-prog" aria-label="Chord progression">${pills}</div><dl class="sum-stats">${stats}</dl><p class="sum-note">${note}</p></div>`);
}
window.addEventListener("progchange", e => {
  prog = e.detail.prog;
  if (!items.length) return;
  recomputeMatches(); ChordStaff.setNext(nextShares()); fitAxis(true);
});
d3.select("#q-artist").on("input", e => { qArtist = e.target.value.trim().toLowerCase(); if (items.length) refresh(false); });
d3.select("#q-song").on("input", e => { qSong = e.target.value.trim().toLowerCase(); if (items.length) refresh(false); });

canvas.addEventListener("mousemove", e => {
  if (!quad) return;
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 49, feat = null, fd = 144;
  quad.visit((n, x0, y0, x1, y1) => {
    if (!n.length) do {
      const p = n.data;
      if (p.vis) {
        const dd = (p.px - mx) ** 2 + (p.py - my) ** 2;
        if (dd < bd) { bd = dd; best = p; }
        if (featured[p.i] && dd < fd) { fd = dd; feat = p; }
      }
    } while (n = n.next);
    return x0 > mx + 12 || x1 < mx - 12 || y0 > my + 12 || y1 < my - 12;
  });
  if (feat && fd <= bd + 36) best = feat;   // the outlined song wins when the pointer is on its border
  if (!best) { tooltip.attr("hidden", true); return; }
  const d = best.d;
  tooltip.attr("hidden", null).style("left", Math.min(mx + 12, W - 270) + "px").style("top", (my + 12) + "px")
    .html(`<b>${esc(d.title)}</b>${esc(d.artist)}<br>${Math.floor(d.year)} · ${GENRES[d.g]} · popularity ${d.pop}${featured[best.i] ? "<br>Most popular" : ""}`);
});
canvas.addEventListener("mouseleave", () => tooltip.attr("hidden", true));
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let timer; window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(() => items.length && layout(), 120); });

// ---------- boot ----------
function start({ songs }) {
  const counts = d3.rollup(songs, v => v.length, d => d.g);
  GENRES = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  color = d3.scaleOrdinal().domain(GENRES).range(COLORS);
  items = songs.map((d, i) => Object.assign(d, { g: GENRES.indexOf(d.g), j: hash(i, 12.9898, 78.233), j2: hash(i, 39.3467, 11.135), lt: d.title.toLowerCase(), la: d.artist.toLowerCase() }));
  match = new Uint8Array(items.length); featKey = ""; featured = new Uint8Array(items.length);
  d3.select("#loader").attr("hidden", true);
  window.CHORD_VARIANTS = VAR_BY_IDX.map(s => [...s].sort());
  window.dispatchEvent(new Event("variantsready")); 
  buildLegend(); ChordStaff.init(); layout();
}
async function load(getStream, gz) {
  const msg = d3.select("#summary");
  start(await readSongs(await getStream(), gz, n => msg.text(`Reading songs… ${n.toLocaleString()} rows`)));
}
function showFallback(err) {
  d3.select("#summary").text("Couldn't open the data file automatically.");
  d3.select("#loader").attr("hidden", null);
  d3.select("#loader-msg").text(location.protocol === "file:"
    ? "Browsers block reading local files from a file:// page. Either pick the file below, or run `python -m http.server` in the Chords-Explorer folder and open this page from http://localhost:8000/."
    : `Could not fetch ${CSV_URL} (${err && err.message}). Pick the file below instead.`);
}
d3.select("#file").on("change", e => {
  const f = e.target.files[0]; if (!f) return;
  d3.select("#loader").attr("hidden", true);
  load(async () => f.stream(), /\.gz$/i.test(f.name)).catch(showFallback);
});
fetch(CSV_URL).then(r => { if (!r.ok) throw new Error(r.status); return load(async () => r.body, true); }).catch(showFallback);
