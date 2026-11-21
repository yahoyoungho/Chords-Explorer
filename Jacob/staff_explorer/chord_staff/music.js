const notes = [
  { label: "C", letter: "C", accidental: "" },
  { label: "Db", letter: "D", accidental: "♭" },
  { label: "D", letter: "D", accidental: "♮" },
  { label: "Eb", letter: "E", accidental: "♭" },
  { label: "E", letter: "E", accidental: "♮" },
  { label: "F", letter: "F", accidental: "" },
  { label: "Gb", letter: "G", accidental: "♭" },
  { label: "G", letter: "G", accidental: "♮" },
  { label: "Ab", letter: "A", accidental: "♭" },
  { label: "A", letter: "A", accidental: "♮" },
  { label: "Bb", letter: "B", accidental: "♭" },
  { label: "B", letter: "B", accidental: "♮" }
];

const width = 920;
const height = 400;
const staffLeft = 95;
const staffRight = 870;
const staffTop = 220;
const staffBottom = 300;
const chordStaffTop = 55;
const chordStaffBottom = 135;
const chordStaffLeft = 350;
const chordStaffRight = 650;
const letterIndex = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const e4Index = 4 * 7 + letterIndex.E;
const labelY = 365;
const chordCenterX = 500;
const selectedNotes = new Set();

const x = d3.scalePoint()
  .domain(d3.range(notes.length))
  .range([180, 820]);

function pitchY(note) {
  const diatonicIndex = 4 * 7 + letterIndex[note.letter];
  return staffBottom - (diatonicIndex - e4Index) * 10;
}

function noteY(note) {
  const y = pitchY(note);
  if (note.letter === "D") {
    return y - 2.6;
  }
  return note.letter === "C" ? y - 2 : y;
}

const svg = d3.select("#chromatic-staff")
  .append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("role", "presentation")
  .style("width", "100%")
  .style("max-width", `${width}px`);

svg.selectAll(".staff-line")
  .data(d3.range(5))
  .join("line")
  .attr("class", "staff-line")
  .attr("x1", staffLeft)
  .attr("x2", staffRight)
  .attr("y1", d => staffTop + d * 20)
  .attr("y2", d => staffTop + d * 20);

svg.append("text")
  .attr("class", "treble-clef")
  .attr("x", 100)
  .attr("y", 295)
  .text("𝄞");

const chordStaff = svg.append("g")
  .attr("class", "chord-staff")
  .attr("opacity", 0)
  .attr("pointer-events", "none");

chordStaff.selectAll(".staff-line")
  .data(d3.range(5))
  .join("line")
  .attr("class", "staff-line")
  .attr("x1", chordStaffLeft)
  .attr("x2", chordStaffRight)
  .attr("y1", d => chordStaffTop + d * 20)
  .attr("y2", d => chordStaffTop + d * 20);

chordStaff.append("text")
  .attr("class", "treble-clef")
  .attr("x", chordStaffLeft + 5)
  .attr("y", chordStaffBottom - 5)
  .text("𝄞");

const ledgerLayer = svg.append("g").attr("class", "ledger-lines");

const noteGroups = svg.selectAll(".note")
  .data(notes)
  .join("g")
  .attr("class", "note")
  .attr("transform", (d, i) => `translate(${x(i)}, ${noteY(d)})`)
  .attr("tabindex", 0)
  .attr("role", "button")
  .on("click", (event, note) => toggleNote(note))
  .on("keydown", (event, note) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleNote(note);
    }
  });

noteGroups.append("ellipse")
  .attr("class", "note-head")
  .attr("rx", 11)
  .attr("ry", 8.3)
  .attr("transform", "rotate(-20)");

noteGroups.append("line")
  .attr("class", "note-stem")
  .attr("x1", 10.5)
  .attr("x2", 10.5)
  .attr("y1", -2.5)
  .attr("y2", -40.5);

noteGroups.filter(d => d.accidental)
  .append("text")
  .attr("class", "accidental")
  .attr("x", -14)
  .attr("y", 7)
  .attr("text-anchor", "end")
  .text(d => d.accidental);

noteGroups.append("text")
  .attr("class", "note-label")
  .attr("x", 0)
  .attr("y", d => labelY - noteY(d))
  .attr("text-anchor", "middle")
  .text(d => d.label);

function chordX(note, chordNotes) {
  const sameStaffPosition = chordNotes.filter(candidate => candidate.letter === note.letter);
  if (sameStaffPosition.length < 2) {
    return chordCenterX;
  }

  const position = sameStaffPosition.indexOf(note);
  return chordCenterX + (position - (sameStaffPosition.length - 1) / 2) * 28;
}

function chordY(note) {
  return chordStaffBottom + noteY(note) - staffBottom;
}

function updateLedgerLines(chordNotes) {
  const ledgerNotes = notes.filter(note => {
    const distanceBelowStaff = pitchY(note) - staffBottom;
    return distanceBelowStaff > 0 && distanceBelowStaff % 20 === 0;
  });
  const data = ledgerNotes.map(note => {
    if (selectedNotes.has(note.label)) {
      return { note, x: chordX(note, chordNotes), y: chordY(note) };
    }
    return { note, x: x(notes.indexOf(note)), y: noteY(note) };
  });

  const ledgerLines = ledgerLayer.selectAll(".ledger-line")
    .data(data, d => d.note.label);

  ledgerLines.exit()
    .transition()
    .duration(250)
    .style("opacity", 0)
    .remove();

  const enteredLines = ledgerLines.enter()
    .append("line")
    .attr("class", "ledger-line")
    .style("opacity", 0);

  enteredLines.merge(ledgerLines)
    .transition()
    .duration(450)
    .style("opacity", 1)
    .attr("x1", d => d.x - 15)
    .attr("x2", d => d.x + 15)
    .attr("y1", d => d.y)
    .attr("y2", d => d.y);
}

function updateScene() {
  const chordNotes = notes.filter(note => selectedNotes.has(note.label));
  chordStaff.transition()
    .duration(350)
    .attr("opacity", chordNotes.length ? 1 : 0);

  noteGroups
    .classed("is-selected", note => selectedNotes.has(note.label))
    .attr("aria-pressed", note => selectedNotes.has(note.label))
    .attr("aria-label", note => selectedNotes.has(note.label)
      ? `Return ${note.label} to the lower staff`
      : `Move ${note.label} to the chord staff`)
    .transition()
    .duration(450)
    .ease(d3.easeCubicInOut)
    .attr("transform", (note, index) => selectedNotes.has(note.label)
      ? `translate(${chordX(note, chordNotes)}, ${chordY(note)})`
      : `translate(${x(index)}, ${noteY(note)})`);

  noteGroups.select(".note-label")
    .transition()
    .duration(250)
    .style("opacity", note => selectedNotes.has(note.label) ? 0 : 1);

  updateLedgerLines(chordNotes);
  renderResults(chordNotes);

  d3.select("#interaction-status").text(chordNotes.length
    ? `${chordNotes.length} note${chordNotes.length === 1 ? "" : "s"} on the upper staff. Click an upper note to return it.`
    : "Click a note on the lower staff to move it to the upper staff.");
}

function toggleNote(note) {
  if (selectedNotes.has(note.label)) {
    selectedNotes.delete(note.label);
  } else {
    selectedNotes.add(note.label);
  }
  updateScene();
}


// ---------- results: genre distribution + songs for the selected base chords ----------
const GENRES = CHORD_DATA.genres, GTOT = CHORD_DATA.genreTotals;
const genreColor = d3.scaleOrdinal().domain(GENRES).range(d3.schemeTableau10.concat(["#999", "#bbb"]));
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function renderResults(chordNotes) {
  const mask = chordNotes.reduce((m, n) => m | (1 << notes.indexOf(n)), 0);
  const counts = CHORD_DATA.cnt[mask] || GENRES.map(() => 0);
  const n = d3.sum(counts);
  d3.select("#summary").html(chordNotes.length
    ? `<b>${chordNotes.map(c => c.label).join(" + ")}</b> &mdash; ${n.toLocaleString()} of ${CHORD_DATA.total.toLocaleString()} songs (${(100 * n / CHORD_DATA.total).toFixed(1)}%)`
    : "Pick one or more base chords to see matching songs.");

  const rows = GENRES.map((g, i) => ({ g, n: counts[i], pct: counts[i] / GTOT[i] })).sort((a, b) => b.pct - a.pct);
  const W = 460, H = 330, mg = { l: 90, r: 80, t: 4, b: 4 };
  const xs = d3.scaleLinear([0, Math.max(0.01, d3.max(rows, d => d.pct))], [mg.l, W - mg.r]);
  const ys = d3.scaleBand(rows.map(d => d.g), [mg.t, H - mg.b]).padding(0.2);
  const s = d3.select("#genre-chart").html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%");
  s.selectAll("rect").data(rows).join("rect").attr("x", mg.l).attr("y", d => ys(d.g)).attr("height", ys.bandwidth())
    .attr("width", d => xs(d.pct) - mg.l).attr("fill", d => genreColor(d.g));
  s.selectAll(".g").data(rows).join("text").attr("x", mg.l - 6).attr("y", d => ys(d.g) + ys.bandwidth() / 2 + 4)
    .attr("text-anchor", "end").attr("font-size", 12).attr("fill", "#425d6c").text(d => d.g);
  s.selectAll(".v").data(rows).join("text").attr("x", d => xs(d.pct) + 5).attr("y", d => ys(d.g) + ys.bandwidth() / 2 + 4)
    .attr("font-size", 11).attr("fill", "#61727e").text(d => chordNotes.length ? `${(d.pct * 100).toFixed(0)}% · ${d.n.toLocaleString()}` : "");

  const top = (CHORD_DATA.top[mask] || []).map(i => CHORD_DATA.songs[i]);
  d3.select("#songs").html(top.length
    ? "<tr><th>Song</th><th>Genre</th><th>Pop.</th></tr>" + top.map(r =>
      `<tr><td><b>${esc(r[0])}</b><br><span class="muted">${esc(r[1])}${r[2] ? " · " + r[2] : ""}</span></td>` +
      `<td><span class="tag" style="border-left:4px solid ${genreColor(GENRES[r[3]])}">${GENRES[r[3]]}</span></td><td>${r[4]}</td></tr>`).join("")
    : `<tr><td class="muted">${chordNotes.length ? "No songs use all of these chords." : "Nothing selected yet."}</td></tr>`);
}

updateScene();
