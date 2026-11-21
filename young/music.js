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
const chordStaffLeft = 200;
const chordStaffRight = 760;
const letterIndex = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const e4Index = 4 * 7 + letterIndex.E;
const labelY = 365;
const chordCenterX = 500;
const headShift = 22;
const accidentalGap = 24;
const accidentalColumnShift = 30;
const stemAttachX = 10.5;
const stemTop = -40.5;
const stemBottom = -2.5;
const selectedNotes = new Set();
const notePitch = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const syllablePitch = {
  do: 0, dos: 1,
  reb: 1, re: 2, res: 3,
  mib: 3, mi: 4, mis: 5,
  fa: 5, fas: 6,
  solb: 6, sol: 7, sols: 8,
  lab: 8, la: 9, las: 10,
  sib: 10, si: 11
};
let chordCatalog = [];
let catalogState = "loading";

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

chordStaff.append("line")
  .attr("class", "note-stem chord-stem")
  .attr("x1", chordCenterX + stemAttachX)
  .attr("x2", chordCenterX + stemAttachX)
  .attr("y1", chordStaffBottom)
  .attr("y2", chordStaffBottom + stemTop);

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

function staffStep(note) {
  return letterIndex[note.letter];
}

function assignColumns(orderedNotes, collides) {
  const columns = new Map();
  const placed = [];
  orderedNotes.forEach(note => {
    let column = 0;
    while (placed.some(other => columns.get(other.label) === column && collides(other, note))) {
      column += 1;
    }
    columns.set(note.label, column);
    placed.push(note);
  });
  return columns;
}

function layoutChord(chordNotes) {
  const byHeight = (a, b) => staffStep(a) - staffStep(b) || notePitch[a.label] - notePitch[b.label];
  const columns = assignColumns(chordNotes.slice().sort(byHeight), (other, note) => {
    return Math.abs(staffStep(other) - staffStep(note)) <= 1;
  });
  const accidentalColumns = assignColumns(
    chordNotes.filter(note => note.accidental).sort((a, b) => byHeight(b, a)),
    (other, note) => Math.abs(staffStep(other) - staffStep(note)) <= 2
  );
  return { columns, accidentalColumns };
}

function chordX(note, layout) {
  return chordCenterX + (layout.columns.get(note.label) || 0) * headShift;
}

function accidentalX(note, layout) {
  const headColumn = layout.columns.get(note.label) || 0;
  const accidentalColumn = layout.accidentalColumns.get(note.label) || 0;
  return -accidentalGap - accidentalColumn * accidentalColumnShift - headColumn * headShift;
}

function chordY(note) {
  return chordStaffBottom + noteY(note) - staffBottom;
}

function parseChordCatalog(text) {
  return text.trim().split(/\r?\n/).slice(1).flatMap(line => {
    const firstComma = line.indexOf(",");
    const rest = line.slice(firstComma + 1);
    const nameEnd = rest.indexOf(",");
    const name = rest.slice(0, nameEnd);
    const noteMatch = rest.match(/'([^']+)'/);
    const degreeStart = rest.lastIndexOf(",\"[");
    if (!name || !noteMatch || degreeStart === -1) {
      return [];
    }
    const pitch = syllablePitch[noteMatch[1]];
    if (pitch === undefined) {
      return [];
    }
    const degrees = JSON.parse(rest.slice(degreeStart + 2, rest.length - 1));
    return [{
      name,
      pitch,
      degrees,
      pitchCount: degrees.reduce((sum, bit) => sum + bit, 0)
    }];
  });
}

function lowestSelectedNote() {
  return notes
    .filter(note => selectedNotes.has(note.label))
    .reduce((lowest, note) => notePitch[note.label] < notePitch[lowest.label] ? note : lowest);
}

function matchingChords() {
  const selected = notes.filter(note => selectedNotes.has(note.label));
  if (!selected.length || catalogState !== "ready") {
    return [];
  }
  const mask = Array(12).fill(0);
  selected.forEach(note => {
    mask[notePitch[note.label]] = 1;
  });
  const rootPitch = notePitch[lowestSelectedNote().label];
  return chordCatalog
    .filter(chord => chord.pitch === rootPitch && chord.degrees.every((bit, index) => bit === 0 || mask[index] === 1))
    .sort((a, b) => b.pitchCount - a.pitchCount || a.name.localeCompare(b.name));
}

function renderChordResults() {
  const region = document.getElementById("chord-results");
  const heading = document.getElementById("chord-results-heading");
  const list = document.getElementById("chord-list");
  const empty = document.getElementById("chord-empty");

  if (!selectedNotes.size) {
    region.hidden = true;
    heading.hidden = false;
    list.hidden = false;
    list.replaceChildren();
    empty.hidden = true;
    empty.textContent = "";
    return;
  }

  region.hidden = false;
  if (catalogState !== "ready") {
    heading.hidden = true;
    list.hidden = true;
    list.replaceChildren();
    empty.hidden = false;
    empty.textContent = catalogState === "error"
      ? "Chord names could not be loaded."
      : "Loading chord names…";
    return;
  }

  const matches = matchingChords();
  if (!matches.length) {
    heading.hidden = true;
    list.hidden = true;
    list.replaceChildren();
    empty.hidden = false;
    empty.textContent = `No chord rooted on ${lowestSelectedNote().label} fits these notes.`;
    return;
  }

  heading.hidden = false;
  list.hidden = false;
  empty.hidden = true;
  empty.textContent = "";
  list.replaceChildren(...matches.map(chord => {
    const item = document.createElement("li");
    item.className = "chord-chip";
    item.textContent = chord.name;
    return item;
  }));
}

function updateChordStem(chordNotes) {
  if (!chordNotes.length) {
    return;
  }
  const ys = chordNotes.map(chordY);
  chordStaff.select(".chord-stem")
    .transition()
    .duration(450)
    .attr("x1", chordCenterX + stemAttachX)
    .attr("x2", chordCenterX + stemAttachX)
    .attr("y1", Math.max(...ys) + stemBottom)
    .attr("y2", Math.min(...ys) + stemTop);
}

function updateLedgerLines(chordNotes, layout) {
  const ledgerNotes = notes.filter(note => {
    const distanceBelowStaff = pitchY(note) - staffBottom;
    return distanceBelowStaff > 0 && distanceBelowStaff % 20 === 0;
  });
  const data = ledgerNotes.map(note => {
    if (selectedNotes.has(note.label)) {
      return { note, x: chordX(note, layout), y: chordY(note) };
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
  const layout = layoutChord(chordNotes);
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
      ? `translate(${chordX(note, layout)}, ${chordY(note)})`
      : `translate(${x(index)}, ${noteY(note)})`);

  noteGroups.select(".note-stem")
    .style("pointer-events", note => selectedNotes.has(note.label) ? "none" : "auto")
    .transition()
    .duration(200)
    .style("opacity", note => selectedNotes.has(note.label) ? 0 : 1);

  noteGroups.filter(note => note.accidental)
    .select(".accidental")
    .transition()
    .duration(450)
    .attr("x", note => selectedNotes.has(note.label) ? accidentalX(note, layout) : -accidentalGap);

  noteGroups.select(".note-label")
    .transition()
    .duration(250)
    .style("opacity", note => selectedNotes.has(note.label) ? 0 : 1);

  updateChordStem(chordNotes);
  updateLedgerLines(chordNotes, layout);

  d3.select("#interaction-status").text(chordNotes.length
    ? `${chordNotes.length} note${chordNotes.length === 1 ? "" : "s"} on the upper staff. Click an upper note to return it.`
    : "Click a note on the lower staff to move it to the upper staff.");

  renderChordResults();
}

function toggleNote(note) {
  if (selectedNotes.has(note.label)) {
    selectedNotes.delete(note.label);
  } else {
    selectedNotes.add(note.label);
  }
  updateScene();
}

updateScene();

fetch("chords_mapping.csv")
  .then(response => {
    if (!response.ok) {
      throw new Error(`Chord map request failed (${response.status})`);
    }
    return response.text();
  })
  .then(text => {
    chordCatalog = parseChordCatalog(text);
    catalogState = "ready";
    renderChordResults();
  })
  .catch(() => {
    catalogState = "error";
    renderChordResults();
  });