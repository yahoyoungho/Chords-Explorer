// Song timeline driven by the chord-progression staff. Reads Erik's cleaned Chords-Explorer/Erik/chordonomicon_transformed.csv.gz in the browser.
const CSV_URL = "../../Erik/chordonomicon_transformed.csv.gz";   // Chords-Explorer/Erik/chordonomicon_transformed.csv.gz (sharps written "#")
const X_MIN = 1950, X_MAX = 2022;
const COLORS = ["#9aa5ad", "#e15759", "#4e79a7", "#f28e2b", "#b07aa1", "#59a14f", "#edc948", "#76b7b2", "#ff9da7", "#9c755f", "#17becf", "#bab0ac", "#7f3c8d"];
const margin = { top: 8, right: 16, bottom: 34, left: 16 };
const canvas = document.getElementById("dots"), ctx = canvas.getContext("2d");
const axes = d3.select("#axes"), tooltip = d3.select("#tooltip");
const CH = i => String.fromCharCode(65 + i);   // chord index (pitch class x major/minor, 0-23) -> one character, so a progression is a substring of the song's chord string
const PC = { "C#": 1, "D#": 3, "E#": 5, "F#": 6, "G#": 8, "A#": 10, "B#": 0, C: 0, Cs: 1, Db: 1, D: 2, Ds: 3, Eb: 3, E: 4, Fb: 4, Es: 5, F: 5, Fs: 6, Gb: 6, G: 7, Gs: 8, Ab: 8, A: 9, As: 10, Bb: 10, B: 11, Cb: 11, Bs: 0 };   // F# and Gb are the same chord

let items = [], GENRES = [], color = () => "#999", dots = [], quad = null, W = 0, H = 0;
let selected = null, qArtist = "", qSong = "", prog = [], progStr = "", match = null, popTimer = null;

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
      if (!m || PC[m[1]] === undefined) v = -1; else { const q = m[2]; v = PC[m[1]] * 2 + (q.startsWith("min") || (q.startsWith("m") && !q.startsWith("maj")) ? 1 : 0); }
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
    let seq = "", last = -2;
    for (const t of r[col.chords].split(" ")) { const v = idOf(t); if (v < 0 || v === last) continue; seq += CH(v); last = v; }   // repeats collapse
    if (seq.length < 2) return;
    out.push({ year, g: r[col.main_genre] || "unlabeled", seq, title: r[col.track], artist: r[col.artist], pop: +r[col.popularity] || 0 });
  });
  for (;;) { const { done, value } = await reader.read(); if (done) break; parse(value); progress(count); }
  return { songs: out };
}

// ---------- matching ----------
function recomputeMatches() {
  progStr = prog.map(c => CH(ChordStaff.idx(c))).join("");
  match = new Uint8Array(items.length);
  if (progStr) for (let i = 0; i < items.length; i++) match[i] = items[i].seq.includes(progStr) ? 1 : 0;
}
// share of matching songs in which each palette chord directly follows the progression
function nextShares() {
  const n = d3.sum(match); if (!n || prog.length >= 4) return null;
  const f = new Array(24).fill(0);
  for (let k = 0; k < 24; k++) { const t = progStr + CH(k); let m = 0; for (let i = 0; i < items.length; i++) if (match[i] && items[i].seq.includes(t)) m++; f[k] = m / n; }
  return f;
}

// ---------- layout / drawing ----------
const hash = (i, a, b) => { const v = Math.sin(i * a + b) * 43758.5453; return v - Math.floor(v); };
function layout() {
  const box = canvas.parentElement.getBoundingClientRect(); W = box.width; H = box.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  axes.attr("viewBox", `0 0 ${W} ${H}`);
  const x = d3.scaleLinear([X_MIN, X_MAX], [margin.left + 30, W - margin.right - 10]);
  dots = items.map((d, i) => ({ d, i, px: x(d.year + (Number.isInteger(d.year) ? (d.j2 - 0.5) * 0.9 : 0)), py: margin.top + 6 + d.j * (H - margin.top - margin.bottom - 12) }));
  quad = d3.quadtree().x(p => p.px).y(p => p.py).addAll(dots);
  axes.selectAll("*").remove();
  const ticks = d3.range(X_MIN, X_MAX, 10);
  axes.append("g").selectAll("line").data(ticks).join("line").attr("class", "band-line").attr("x1", t => x(t)).attr("x2", t => x(t)).attr("y1", margin.top).attr("y2", H - margin.bottom);
  axes.append("g").attr("class", "axis").attr("transform", `translate(0,${H - margin.bottom + 6})`).call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("d")).tickSizeOuter(0));
  refresh(false);
}
const searching = () => qArtist !== "" || qSong !== "";
const hit = d => (!qArtist || d.la.includes(qArtist)) && (!qSong || d.lt.includes(qSong));
let groups = [], visibleCount = 0, boost = 1;
function regroup() {
  groups = GENRES.map(() => ({ dim: [], hl: [] })); visibleCount = 0;
  for (const p of dots) {
    p.vis = !!match[p.i] && (selected === null || p.d.g === selected);
    if (!p.vis) continue;
    visibleCount++; groups[p.d.g][searching() && !hit(p.d) ? "dim" : "hl"].push(p);
  }
  boost = Math.min(4, Math.max(1, Math.pow(30000 / Math.max(visibleCount, 1), 0.35)));   // fewer songs on screen -> bigger dots
  const e = d3.select("#empty");
  if (!prog.length) e.attr("hidden", null).text("Click chords on the staff and the songs that play them in that order will appear here.");
  else if (!visibleCount) e.attr("hidden", null).text("No songs play these chords in this order" + (selected !== null ? " in this genre." : "."));
  else e.attr("hidden", true);
}
function paintGroup(list, fill, alpha, extra, k) {
  if (!list.length) return;
  ctx.fillStyle = fill; ctx.globalAlpha = alpha; ctx.beginPath();
  for (const p of list) { const r = (0.9 + (p.d.pop / 100) * 1.7 + extra) * k * boost; ctx.moveTo(p.px + r, p.py); ctx.arc(p.px, p.py, r, 0, 6.2832); }
  ctx.fill();
}
function draw(t = 1) {
  ctx.clearRect(0, 0, W, H);
  const k = d3.easeBackOut.overshoot(1.6)(t), fade = Math.min(1, t * 2), s = searching();
  groups.forEach((g, i) => { paintGroup(g.dim, color(GENRES[i]), 0.1 * fade, 0, k); paintGroup(g.hl, color(GENRES[i]), (s ? 0.9 : boost > 1.5 ? 0.75 : 0.55) * fade, s ? 0.5 : 0, k); });
  ctx.globalAlpha = 1;
}
function refresh(animate) {
  regroup(); updateSummary();
  if (popTimer) popTimer.stop();
  if (!animate || !visibleCount) { draw(1); return; }
  popTimer = d3.timer(el => { const t = Math.min(1, el / 550); draw(t); if (t === 1) popTimer.stop(); });   // matching songs pop in
}

// ---------- legend, summary, inputs ----------
let legend;
function buildLegend() {
  legend = d3.select("#legend").selectAll("button").data(GENRES.map((g, i) => ({ g, i }))).join("button")
    .attr("type", "button").on("click", (e, d) => { selected = selected === d.i ? null : d.i; syncLegend(); refresh(true); });
  legend.append("span").attr("class", "swatch").style("background", d => color(d.g));
  legend.append("span").attr("class", "lt"); syncLegend();
}
function syncLegend() {
  legend.classed("is-active", d => selected === d.i).classed("is-dim", d => selected !== null && selected !== d.i).attr("aria-pressed", d => selected === d.i);
}
function updateSummary() {
  const counts = new Array(GENRES.length).fill(0); let n = 0;
  if (progStr) items.forEach((d, i) => { if (match[i]) { counts[d.g]++; n++; } });
  legend.select(".lt").text(d => progStr ? `${d.g} (${counts[d.i].toLocaleString()})` : d.g)
    .each(function (d) { this.parentNode.classList.toggle("is-empty", !!progStr && counts[d.i] === 0); });
  d3.select("#summary").html(progStr
    ? `<b>${prog.map(ChordStaff.label).join(" → ")}</b> &mdash; ${n.toLocaleString()} songs (${(100 * n / items.length).toFixed(1)}% of ${items.length.toLocaleString()})`
      + (selected !== null ? ` · showing ${counts[selected].toLocaleString()} in <b>${GENRES[selected]}</b>` : "")
    : "No progression yet. Build one in Step 2 and the songs that use it will appear here.");
}
window.addEventListener("progchange", e => {
  prog = e.detail.prog;
  if (!items.length) return;
  recomputeMatches(); ChordStaff.setNext(nextShares()); refresh(true);
});
d3.select("#q-artist").on("input", e => { qArtist = e.target.value.trim().toLowerCase(); if (items.length) refresh(false); });
d3.select("#q-song").on("input", e => { qSong = e.target.value.trim().toLowerCase(); if (items.length) refresh(false); });

canvas.addEventListener("mousemove", e => {
  if (!quad) return;
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 49;
  quad.visit((n, x0, y0, x1, y1) => {
    if (!n.length) do { const p = n.data; if (p.vis) { const dd = (p.px - mx) ** 2 + (p.py - my) ** 2; if (dd < bd) { bd = dd; best = p; } } } while (n = n.next);
    return x0 > mx + 7 || x1 < mx - 7 || y0 > my + 7 || y1 < my - 7;
  });
  if (!best) { tooltip.attr("hidden", true); return; }
  const d = best.d;
  tooltip.attr("hidden", null).style("left", Math.min(mx + 12, W - 270) + "px").style("top", (my + 12) + "px")
    .html(`<b>${esc(d.title)}</b>${esc(d.artist)}<br>${Math.floor(d.year)} · ${GENRES[d.g]}`);
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
  match = new Uint8Array(items.length);
  d3.select("#loader").attr("hidden", true);
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
