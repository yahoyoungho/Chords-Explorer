const notes = [
  { label: "C", letter: "C", accidental: "" },
  { label: "D", letter: "D", accidental: "" },
  { label: "E", letter: "E", accidental: "" },
  { label: "F", letter: "F", accidental: "" },
  { label: "G", letter: "G", accidental: "" },
  { label: "A", letter: "A", accidental: "" },
  { label: "B", letter: "B", accidental: "" }
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
const basePitch = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function displayNoteLabel(note) {
  if (note.accidental === "♮") {
    return note.letter;
  }
  if (note.accidental === "#") {
    return `${note.letter}#`;
  }
  if (note.accidental === "♭") {
    return `${note.letter}♭`;
  }
  return note.letter;
}

function notePitchValue(note) {
  const base = basePitch[note.letter];
  if (note.accidental === "♭") {
    return (base - 1 + 12) % 12;
  }
  if (note.accidental === "#") {
    return (base + 1) % 12;
  }
  return base;
}
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
let activePickerNote = null;

const x = d3.scalePoint()
  .domain(d3.range(notes.length))
  .range([180, 820]);

function pitchY(note) {
  const diatonicIndex = 4 * 7 + letterIndex[note.letter];
  return staffBottom - (diatonicIndex - e4Index) * 10;
}

function noteY(note) {
  const diatonicIndex = 4 * 7 + letterIndex[note.letter];
  return staffBottom - (diatonicIndex - e4Index) * 10;
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

const accidentalPicker = svg.append("g")
  .attr("class", "accidental-picker")
  .attr("opacity", 0)
  .attr("pointer-events", "none");

const noteGroups = svg.selectAll(".note")
  .data(notes)
  .join("g")
  .attr("class", "note")
  .attr("transform", (d, i) => `translate(${x(i)}, ${noteY(d)})`)
  .attr("tabindex", 0)
  .attr("role", "button")
  .on("click", (event, note) => {
    event.stopPropagation();
    if (selectedNotes.has(note.letter)) {
      toggleNote(note);
      return;
    }
    showAccidentalPicker(note);
  })
  .on("keydown", (event, note) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (selectedNotes.has(note.letter)) {
        toggleNote(note);
      } else {
        showAccidentalPicker(note);
      }
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

noteGroups.append("text")
  .attr("class", "accidental")
  .attr("x", -14)
  .attr("y", 7)
  .attr("text-anchor", "end")
  .text(d => d.accidental)
  .style("opacity", d => d.accidental ? 1 : 0);

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
  const byHeight = (a, b) => staffStep(a) - staffStep(b) || notePitchValue(a) - notePitchValue(b);
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

// change s to #
function prettifyChordName(chord) {
  const prettifyPart = part => {
    let result = part.replace(/^([A-G])s(?!us)/, "$1#");
    const susMarker = "\uE000";
    result = result.replace(/sus/g, susMarker);
    result = result.replace(/s/g, "#");
    result = result.replace(new RegExp(susMarker, "g"), "sus");
    return result;
  };

  if (!chord) {
    return chord;
  }

  if (chord.includes("/")) {
    const [left, right] = chord.split("/", 2);
    return `${prettifyPart(left)}/${prettifyPart(right)}`;
  }

  return prettifyPart(chord);
}

function parseChordCatalog(text) {
  const rawEntries = text.trim().split(/\r?\n/).slice(1).flatMap(line => {
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

  const rootPitch = root => {
    const values = {
      C: 0, Cs: 1, Db: 1, D: 2, Ds: 3, Eb: 3,
      E: 4, Es: 5, Fb: 4, F: 5, Fs: 6, Gb: 6,
      G: 7, Gs: 8, Ab: 8, A: 9, As: 10, Bb: 10,
      B: 11, Bs: 0, Cb: 11
    };
    return values[root];
  };

  const splitRoot = name => {
    const match = name.match(/^([A-G][bs]?)(.*)$/);
    return match ? { root: match[1], suffix: match[2] } : null;
  };

  const transposeDegrees = (degrees, shift) => degrees.map((bit, index) => [
    (index + shift) % 12,
    bit
  ]).reduce((transposed, [index, bit]) => {
    transposed[index] = bit;
    return transposed;
  }, Array(12).fill(0));

  const cPatterns = new Map(
    rawEntries
      .filter(entry => splitRoot(entry.name)?.root === "C")
      .map(entry => [splitRoot(entry.name).suffix, entry.degrees])
  );

  const diminishedIntervals = suffix => {
    if (suffix === "dim7") return [0, 3, 6, 9];
    if (suffix === "dimmaj7") return [0, 3, 6, 11];
    if (suffix === "dim9") return [0, 2, 3, 6, 9];
    if (suffix === "dimmaj9") return [0, 2, 3, 6, 11];
    return null;
  };

  return rawEntries.map(entry => {
    const parsedName = splitRoot(entry.name);
    if (!parsedName) return null;

    const pitch = rootPitch(parsedName.root);
    if (pitch === undefined) return null;

    const diminished = diminishedIntervals(parsedName.suffix);
    let degrees;

    if (diminished) {
      degrees = Array(12).fill(0);
      diminished.forEach(interval => {
        degrees[(pitch + interval) % 12] = 1;
      });
    } else {
      const cPattern = cPatterns.get(parsedName.suffix);
      degrees = cPattern
        ? transposeDegrees(cPattern, pitch)
        : entry.degrees;
    }

    return {
      name: prettifyChordName(entry.name),
      pitch,
      degrees,
      pitchCount: degrees.reduce((sum, bit) => sum + bit, 0)
    };
  }).filter(Boolean);
}

function lowestSelectedNote() {
  return notes
    .filter(note => selectedNotes.has(note.letter))
    .reduce((lowest, note) => notePitchValue(note) < notePitchValue(lowest) ? note : lowest);
}

function selectedNoteLabels() {
  return notes
    .filter(note => selectedNotes.has(note.letter))
    .map(displayNoteLabel);
}

function matchingChords() {
  const selected = notes.filter(note => selectedNotes.has(note.letter));
  if (!selected.length || catalogState !== "ready") {
    return [];
  }
  const mask = Array(12).fill(0);
  selected.forEach(note => {
    mask[notePitchValue(note)] = 1;
  });

  return chordCatalog
    .filter(chord =>
      mask[chord.pitch] === 1 &&
      chord.degrees.every((bit, index) => bit === 0 || mask[index] === 1)
    )
    .sort((a, b) => {
      const aExact = a.pitchCount === selected.length ? 1 : 0;
      const bExact = b.pitchCount === selected.length ? 1 : 0;
      return bExact - aExact ||
        b.pitchCount - a.pitchCount ||
        a.name.localeCompare(b.name);
    });
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
    empty.textContent = `No chord identified from just ${selectedNoteLabels().join(" - ")}.`;
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
    if (selectedNotes.has(note.letter)) {
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

function closeAccidentalPicker() {
  activePickerNote = null;
  accidentalPicker
    .attr("pointer-events", "none")
    .transition()
    .duration(150)
    .attr("opacity", 0);
}

function showAccidentalPicker(note) {
  activePickerNote = note;
  const noteX = x(notes.indexOf(note));
  const noteYPosition = noteY(note);
  const pickerX = Math.max(
    chordStaffLeft + 10,
    Math.min(chordStaffRight - 55, noteX + 25)
  );
  const pickerY = Math.max(chordStaffTop - 10, noteYPosition - 30);

  accidentalPicker
    .attr("transform", `translate(${pickerX}, ${pickerY})`)
    .attr("pointer-events", "auto")
    .attr("opacity", 1);

  accidentalPicker.selectAll("text.accidental-option")
    .data(["♭", "♮", "#"])
    .join("text")
    .attr("class", "accidental-option")
    .attr("x", (accidental, index) => index * 24)
    .attr("y", 0)
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", accidental => `Set ${note.letter} to ${accidental}`)
    .text(accidental => accidental)
    .on("click", (event, accidental) => {
      event.stopPropagation();
      note.accidental = accidental === "♮" ? "♮" : accidental;
      closeAccidentalPicker();
      toggleNote(note);
    })
    .on("keydown", (event, accidental) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        note.accidental = accidental === "♮" ? "♮" : accidental;
        closeAccidentalPicker();
        toggleNote(note);
      }
    });

  d3.select("#interaction-status").text(
    `Choose ♭, ♮, or # for ${note.letter}.`
  );
}

svg.on("click", () => closeAccidentalPicker());

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && activePickerNote) {
    closeAccidentalPicker();
  }
});

function updateScene() {
  const chordNotes = notes.filter(note => selectedNotes.has(note.letter));
  const layout = layoutChord(chordNotes);
  chordStaff.transition()
    .duration(350)
    .attr("opacity", chordNotes.length ? 1 : 0);

  noteGroups
    .classed("is-selected", note => selectedNotes.has(note.letter))
    .attr("aria-pressed", note => selectedNotes.has(note.letter))
    .attr("aria-label", note => selectedNotes.has(note.letter)
      ? `Return ${displayNoteLabel(note)} to the lower staff`
      : `Choose an accidental for ${note.letter}`)
    .transition()
    .duration(450)
    .ease(d3.easeCubicInOut)
    .attr("transform", (note, index) => selectedNotes.has(note.letter)
      ? `translate(${chordX(note, layout)}, ${chordY(note)})`
      : `translate(${x(index)}, ${noteY(note)})`);

  noteGroups.select(".note-stem")
    .style("pointer-events", note => selectedNotes.has(note.letter) ? "none" : "auto")
    .transition()
    .duration(200)
    .style("opacity", note => selectedNotes.has(note.letter) ? 0 : 1);

  noteGroups.select(".accidental")
    .text(note => note.accidental)
    .transition()
    .duration(450)
    .style("opacity", note => note.accidental ? 1 : 0)
    .attr("x", note => selectedNotes.has(note.letter) ? accidentalX(note, layout) : -accidentalGap);

  noteGroups.select(".note-label")
    .text(note => displayNoteLabel(note))
    .transition()
    .duration(250)
    .style("opacity", note => selectedNotes.has(note.letter) ? 0 : 1);

  updateChordStem(chordNotes);
  updateLedgerLines(chordNotes, layout);

  d3.select("#interaction-status").text(chordNotes.length
    ? `${chordNotes.length} note${chordNotes.length === 1 ? "" : "s"} on the upper staff. Click an upper note to return it.`
    : "Click a note on the lower staff, then choose ♭, ♮, or #.");

  renderChordResults();
}

function toggleNote(note) {
  if (selectedNotes.has(note.letter)) {
    selectedNotes.delete(note.letter);
    note.accidental = "";
  } else {
    selectedNotes.add(note.letter);
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