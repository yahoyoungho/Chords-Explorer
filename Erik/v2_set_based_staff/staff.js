// Chord staff: the lower staff shows the seven natural notes. Click one and a small chooser opens next to it:
// pick ♭ / ♮ / ♯ and major or minor, and the chord lifts into the progression lane above the staff.
// Emits a "progchange" event with the ordered progression; scatter.js calls setNext() to hint at the likeliest next chords.
const ChordStaff = (() => {
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const NAT_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const ACCS = [{ sym: "♭", val: "b", d: -1 }, { sym: "♮", val: "", d: 0 }, { sym: "♯", val: "s", d: 1 }];
  const PCNAME = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const SOLFEGE = {
    do: { letter: "C", pc: 0 }, dos: { letter: "C", pc: 1 },
    reb: { letter: "D", pc: 1 }, re: { letter: "D", pc: 2 }, res: { letter: "D", pc: 3 },
    mib: { letter: "E", pc: 3 }, mi: { letter: "E", pc: 4 }, mis: { letter: "E", pc: 5 },
    fa: { letter: "F", pc: 5 }, fas: { letter: "F", pc: 6 },
    solb: { letter: "G", pc: 6 }, sol: { letter: "G", pc: 7 }, sols: { letter: "G", pc: 8 },
    lab: { letter: "A", pc: 8 }, la: { letter: "A", pc: 9 }, las: { letter: "A", pc: 10 },
    sib: { letter: "B", pc: 10 }, si: { letter: "B", pc: 11 }
  };
  // Each of the 12 chords is shown under exactly one note: C♯ under C, E♭ under E, F♯ under F, A♭ under A, B♭ under B (matches PCNAME)
  const HINT_PCS = { C: [0, 1], D: [2], E: [4, 3], F: [5, 6], G: [7], A: [9, 8], B: [11, 10] };
  const fullLabel = c => c.letter + (c.acc === "b" ? "♭" : c.acc === "s" ? "♯" : "") + (c.min ? " minor" : " major");
  const label = c => c.letter + (c.acc === "b" ? "♭" : c.acc === "s" ? "♯" : "") + (c.min ? "m" : "");
  const idx = c => c.pc * 2 + (c.min ? 1 : 0);   // 24 chords: pitch class x major/minor (F♯ and G♭ are the same chord)
 const pretty = t => t.replace(/#/g, "♯").replace(/(^|\/)([A-G])s(?!us)/g, "$1$2♯").replace(/(^|\/)([A-G])b/g, "$1$2♭");   // "Fsmin7" -> "F♯min7", "Bbmaj7" -> "B♭maj7"
  const display = c => c.variant ? pretty(c.variant) : label(c); 
  const yb = 215, half = 10, stepY = s => yb - (s - 2) * half;
  const PROG_BOTTOM = 105, progY = s => PROG_BOTTOM - (s - 2) * half;
  const laneX = i => 220 + i * 200, MAX = 4;
  let prog = [], laneNodes = [], chordTemplates = new Map(), lane, arrows, nodes, popup, xs, selectedAcc = null, selectedQuality = null, openLetter = null, staff;
  const hint = t => d3.select("#hint").text(t);
  const DEFAULT_HINT = "Click a note, then choose ♭, ♮ or ♯ and major or minor.";

  function drawNote(sel, step, acc, min, cx, cy, stemUp) {
    if (step === 0 && cy >= stepY(0) - 1) sel.append("line").attr("x1", cx - 16).attr("x2", cx + 16).attr("y1", cy).attr("y2", cy).attr("stroke", "#444");
    if (acc) sel.append("text").attr("x", cx - 28).attr("y", cy + 6).attr("font-size", 20).text(acc === "b" ? "♭" : "♯");
    sel.append("ellipse").attr("class", "head").attr("cx", cx).attr("cy", cy).attr("rx", 11).attr("ry", 8).attr("transform", `rotate(-20 ${cx} ${cy})`)
      .attr("fill", "#1d2330").attr("stroke", "#1d2330").attr("stroke-width", 2);
    sel.append("line").attr("x1", cx + (stemUp ? 10 : -10)).attr("x2", cx + (stemUp ? 10 : -10)).attr("y1", cy).attr("y2", cy + (stemUp ? -36 : 36)).attr("stroke", "#1d2330").attr("stroke-width", 1.8);
  }

  function parseChordName(name) {
    const main = name.split("/")[0];
    const match = /^([A-G](?:#|s(?!us)|b)?)(.*)$/.exec(main);
    if (!match) return null;
    const root = /^([A-G])([#sb]?)$/.exec(match[1]);
    if (!root) return null;
    const accidental = root[2] === "b" ? -1 : root[2] ? 1 : 0;
    return {
      letter: root[1],
      step: STEP[root[1]],
      pc: (NAT_PC[root[1]] + accidental + 12) % 12,
      name: match[1].replace("#", "s") + match[2],
      suffix: match[2]
    };
  }

  function fallbackNotes(chord) {
    return chord.min ? ["do", "mib", "sol"] : ["do", "mi", "sol"];
  }

  function renderChordTones(group, chord, index) {
    const toneGroup = group.select(".chord-tones");
    toneGroup.selectAll("*").remove();

    const variantRoot = chord.variant ? parseChordName(chord.variant) : null;
    const template = variantRoot && chordTemplates.get(variantRoot.name);
    const useVariant = !!template && template.spaced;
    const root = useVariant ? variantRoot : {
      letter: chord.letter,
      step: STEP[chord.letter],
      pc: chord.pc
    };
    const isDiminished = useVariant && variantRoot.suffix.startsWith("dim");
    const isAugmented = useVariant && variantRoot.suffix.startsWith("aug");
    const names = useVariant ? template.notes : fallbackNotes(chord);
    const seenPitches = new Set();
    let previousInterval = -1;
    const tones = names.map(name => {
      const source = SOLFEGE[name];
      if (!source) throw new Error(`Unknown chord template note: ${name}`);
      const pc = useVariant ? source.pc : (root.pc + source.pc) % 12;
      if (seenPitches.has(pc)) return null;
      seenPitches.add(pc);
      let interval = useVariant ? (source.pc - root.pc + 12) % 12 : source.pc;
      const intervalClass = interval;
      while (interval <= previousInterval) interval += 12;
      previousInterval = interval;
      let diatonicOffset = useVariant
        ? (STEP[source.letter] - root.step + LETTERS.length) % LETTERS.length
        : STEP[source.letter];
      if (intervalClass === 0) diatonicOffset = 0;
      else if (isDiminished && intervalClass === 3) diatonicOffset = 2;
      else if (isDiminished && intervalClass === 6) diatonicOffset = 4;
      else if (isAugmented && intervalClass === 4) diatonicOffset = 2;
      else if (isAugmented && intervalClass === 8) diatonicOffset = 4;
      const step = root.step + diatonicOffset + Math.floor(interval / 12) * LETTERS.length;
      return {
        step,
        pc,
        y: progY(step)
      };
    }).filter(Boolean);

    const ledgerSteps = new Set();
    tones.forEach(tone => {
      if ((tone.step < 2 || tone.step > 10) && tone.step % 2 === 0 && !ledgerSteps.has(tone.step)) {
        ledgerSteps.add(tone.step);
        toneGroup.append("line").attr("x1", laneX(index) - 16).attr("x2", laneX(index) + 16)
          .attr("y1", tone.y).attr("y2", tone.y).attr("stroke", "#444");
      }
    });
    tones.forEach(tone => {
      const letter = LETTERS[tone.step % LETTERS.length];
      let accidental = (tone.pc - NAT_PC[letter] + 12) % 12;
      if (accidental > 6) accidental -= 12;
      const accidentalText = accidental === -2 ? "♭♭" : accidental === -1 ? "♭" : accidental === 1 ? "♯" : accidental === 2 ? "𝄪" : "";
      if (accidentalText) {
        const isDoubleSharp = accidentalText === "𝄪";
        toneGroup.append("text").attr("x", laneX(index) - 28).attr("y", tone.y + (isDoubleSharp ? 16 : 6))
          .attr("font-size", isDoubleSharp ? 30 : 20).text(accidentalText);
      }
      toneGroup.append("ellipse").attr("class", "head").attr("cx", laneX(index)).attr("cy", tone.y).attr("rx", 11).attr("ry", 8)
        .attr("transform", `rotate(-20 ${laneX(index)} ${tone.y})`)
        .attr("fill", "#1d2330").attr("stroke", "#1d2330").attr("stroke-width", 2);
    });

    if (!tones.length) return;
    const lowest = tones[0], highest = tones[tones.length - 1];
    const stemUp = (lowest.y + highest.y) / 2 >= progY(6);
    toneGroup.append("line")
      .attr("x1", laneX(index) + (stemUp ? 10 : -10))
      .attr("x2", laneX(index) + (stemUp ? 10 : -10))
      .attr("y1", stemUp ? lowest.y : highest.y)
      .attr("y2", stemUp ? highest.y - 36 : lowest.y + 36)
      .attr("stroke", "#1d2330")
      .attr("stroke-width", 1.8);
  }

  function init() {
    staff = d3.select("#staff").html("");
    xs = d3.scalePoint(LETTERS, [230, 980]).padding(0);
    const progressionStaff = staff.append("g").attr("class", "progression-staff");
    for (let i = 0; i < 5; i++) progressionStaff.append("line").attr("x1", 20).attr("x2", 1020).attr("y1", PROG_BOTTOM - i * 2 * half).attr("y2", PROG_BOTTOM - i * 2 * half).attr("stroke", "#444");
    progressionStaff.append("text").attr("x", 20).attr("y", 16).attr("font-size", 14).attr("font-weight", 700).attr("fill", "#1d2b36").text("Chord progression");
    progressionStaff.append("text").attr("x", 26).attr("y", PROG_BOTTOM - 4).attr("font-size", 84).text("𝄞");
    for (let i = 0; i < 5; i++) staff.append("line").attr("x1", 20).attr("x2", 1020).attr("y1", yb - i * 2 * half).attr("y2", yb - i * 2 * half).attr("stroke", "#444");
    staff.append("text").attr("x", 26).attr("y", yb - 4).attr("font-size", 84).text("𝄞");
    lane = staff.append("g"); arrows = staff.append("g");
    nodes = staff.append("g").selectAll("g.note").data(LETTERS).join("g").attr("class", "note").attr("tabindex", 0)
      .on("click", (e, l) => { e.stopPropagation(); toggle(l); })
      .on("keydown", (e, l) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(l); } });
    nodes.each(function (l) {
      const n = d3.select(this), cx = xs(l), cy = stepY(STEP[l]);
      n.append("rect").attr("x", cx - 24).attr("y", cy - 44).attr("width", 48).attr("height", 100).attr("fill", "transparent");   // bigger click target
      drawNote(n, STEP[l], "", false, cx, cy, STEP[l] < 4);
      n.append("text").attr("x", cx).attr("y", yb + 52).attr("text-anchor", "middle").attr("font-weight", 700).text(l);
      n.append("text").attr("class", "nxt").attr("x", cx).attr("y", yb + 68).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#c2410c");
    });
    popup = staff.append("g").attr("class", "popup").attr("hidden", true).style("display", "none");
    staff.on("click", () => closePopup());
    document.addEventListener("keydown", e => { if (e.key === "Escape") closePopup(); });
    d3.select("#undo").on("click", () => pop()); d3.select("#reset").on("click", reset);
    hint(DEFAULT_HINT); emit();
  }

  // ---- the ♭ ♮ ♯ chooser ----
  function toggle(l) { openLetter === l ? closePopup() : openPopup(l); }
  function closePopup() { openLetter = null; popup.style("display", "none"); nodes.classed("is-selected", false); hint(DEFAULT_HINT); }
  function chooseAccidental(l, a) {
    selectedAcc = a;
    popup.selectAll(".acc-btn rect").attr("fill", function () {
      return this.parentNode.getAttribute("data-acc") === a.val ? "#1d2330" : "#f3f6f8";
    });
    popup.selectAll(".acc-btn text").attr("fill", function () {
      return this.parentNode.getAttribute("data-acc") === a.val ? "#fff" : "#1d2330";
    });
    if (selectedQuality !== null) add(l, a, selectedQuality);
    else hint(`Choose major or minor for ${l}.`);
  }
  function chooseQuality(l, isMinor) {
    selectedQuality = isMinor;
    popup.selectAll(".q-btn rect").attr("fill", function () {
      return (this.parentNode.getAttribute("data-q") === "min") === isMinor ? "#1d2330" : "#fff";
    });
    popup.selectAll(".q-btn text").attr("fill", function () {
      return (this.parentNode.getAttribute("data-q") === "min") === isMinor ? "#fff" : "#1d2330";
    });
    if (selectedAcc) add(l, selectedAcc, isMinor);
    else hint(`Choose ♭, ♮ or ♯ for ${l}.`);
  }
  function openPopup(l) {
    openLetter = l; nodes.classed("is-selected", d => d === l);
    selectedAcc = null; selectedQuality = null;
    hint(`Choose ♭, ♮ or ♯ for ${l}, major or minor.`);
    popup.style("display", null).html("");
    const cx = xs(l), w = 176, h = 92, px = Math.max(30, Math.min(1010 - w, cx - w / 2)), py = stepY(STEP[l]) - 34 - h;
    popup.append("rect").attr("x", px).attr("y", py).attr("width", w).attr("height", h).attr("rx", 10).attr("fill", "#fff").attr("stroke", "#c2410c").attr("stroke-width", 1.5);
    popup.append("text").attr("x", px + w / 2).attr("y", py + 15).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#6b7280").text(`${l}: ♭  ♮  ♯`);
    ACCS.forEach((a, i) => {
      const g = popup.append("g").attr("class", "acc-btn").attr("data-acc", a.val).attr("tabindex", 0).style("cursor", "pointer")
        .on("click", e => { e.stopPropagation(); chooseAccidental(l, a); })
        .on("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chooseAccidental(l, a); } });
      const bx = px + 10 + i * 52;
      g.append("rect").attr("x", bx).attr("y", py + 22).attr("width", 46).attr("height", 38).attr("rx", 8).attr("fill", "#f3f6f8").attr("stroke", "#c8d3da");
      g.append("text").attr("x", bx + 23).attr("y", py + 49).attr("text-anchor", "middle").attr("font-size", 26).text(a.sym);
      g.append("title").text(`${l}${a.val === "b" ? " flat" : a.val === "s" ? " sharp" : " natural"}`);
    });
    [["major", false], ["minor", true]].forEach(([t, m], i) => {
      const g = popup.append("g").attr("class", "q-btn").attr("data-q", m ? "min" : "maj").style("cursor", "pointer")
        .on("click", e => { e.stopPropagation(); chooseQuality(l, m); });
      const bx = px + 10 + i * 81;
      g.append("rect").attr("x", bx).attr("y", py + 66).attr("width", 75).attr("height", 20).attr("rx", 10).attr("stroke", "#1d2330").attr("fill", "#fff");
      g.append("text").attr("x", bx + 37.5).attr("y", py + 80).attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#1d2330").text(t);
    });
  }

  // ---- progression lane ----
  function add(letter, a, isMinor) {
    if (prog.length >= MAX) { closePopup(); return; }
    const c = { letter, acc: a.val, min: isMinor, pc: (NAT_PC[letter] + a.d + 12) % 12 };
    const i = prog.length; prog.push(c); closePopup();
    const rootStep = STEP[letter];
    const rootY = progY(rootStep);
    const g = lane.append("g").attr("class", "lane-note").datum({ c, i }).attr("transform", `translate(${xs(letter) - laneX(i)},${stepY(rootStep) - rootY})`);
    g.append("g").attr("class", "chord-tones");
    renderChordTones(g, c, i);
    laneNodes.push(g);
    g.append("text").attr("class", "lane-label").attr("x", laneX(i)).attr("y", 16).attr("text-anchor", "middle").attr("font-weight", 700).attr("font-size", 15).text(fullLabel(c));
    g.transition().duration(650).ease(d3.easeCubicOut).attr("transform", "translate(0,0)");
    emit();
  }
  function pop(silent) {
    if (!prog.length) return; prog.pop();
    const g = laneNodes.pop(), { c, i } = g.datum();   // the exact note group for the last chord, even while an earlier one is still fading out
    g.interrupt().transition().duration(450).attr("transform", `translate(${xs(c.letter) - laneX(i)},${stepY(STEP[c.letter]) - progY(STEP[c.letter])})`).style("opacity", 0).remove();
    setTimeout(() => g.remove(), 520);   // belt and braces: still cleans up if the browser pauses animations (e.g. background tab)
    if (silent !== true) emit();
  }
  function reset() { closePopup(); while (prog.length) pop(true); emit(); }
  function emit() {
    arrows.selectAll("path").data(prog.slice(1)).join("path").attr("d", (c, i) => {
      const currentLabel = laneNodes[i].select(".lane-label").node();
      const nextLabel = laneNodes[i + 1].select(".lane-label").node();
      const gap = 5, y = 10;
      return `M${laneX(i) + currentLabel.getComputedTextLength() / 2 + gap},${y} L${laneX(i + 1) - nextLabel.getComputedTextLength() / 2 - gap},${y}`;
    })
      .attr("stroke", "#c2410c").attr("stroke-width", 2).attr("fill", "none").attr("stroke-dasharray", "4 3");
    setNext(null);
    window.dispatchEvent(new CustomEvent("progchange", { detail: { prog: prog.map(c => ({ ...c })) } }));
  }
  // shares: array of 24 (pitch class x major/minor) = share of matching songs where that chord comes next, or null to clear.
  // Under each note we show the likeliest next chord that starts on that letter (any accidental, major or minor).
  function setNext(shares) {
    const on = !!shares && prog.length > 0 && prog.length < MAX, best = {};
    LETTERS.forEach(l => {
      let b = { s: 0, pc: 0, m: 0 };
      if (on) for (const pc of HINT_PCS[l]) for (const m of [0, 1]) { const s = shares[pc * 2 + m]; if (s > b.s) b = { s, pc, m }; }
      best[l] = b;
    });
    nodes.select(".head").attr("stroke", l => on && best[l].s > 0.1 ? "#c2410c" : "#1d2330").attr("stroke-width", l => 2 + (on ? best[l].s * 8 : 0));
    nodes.select(".nxt").text(l => on && best[l].s >= 0.05 ? `${PCNAME[best[l].pc]}${best[l].m ? "m" : ""} ${Math.round(best[l].s * 100)}%` : "");
    nodes.style("opacity", l => !on || best[l].s >= 0.02 ? 1 : 0.35);
  }
  // Fill the lane from a list like ["G","D","Emin","C"] (used by the "Try one" buttons)
  function setProg(list) {
    closePopup(); while (prog.length) pop(true);
    list.slice(0, MAX).forEach((name, i) => setTimeout(() => {
      const m = /^([A-G])(#|s|b)?(min)?$/.exec(name); if (!m) return;
      const a = ACCS.find(x => x.val === (m[2] === "#" ? "s" : m[2] || ""));
      add(m[1], a, !!m[3]);
    }, 120 + i * 380));
  }

  function setVariant(v) {
  	if (!prog.length) return;
  	const c = prog[prog.length - 1];
  	if (v) c.variant = v; else delete c.variant;
    const group = laneNodes[laneNodes.length - 1];
    const { i } = group.datum();
    renderChordTones(group, c, i);
  	group.select(".lane-label").text(v ? pretty(v) : fullLabel(c));
  	emit();
  }

  return { init, setNext, setProg, setVariant, setChordTemplates(templates) { chordTemplates = templates; }, label, display, idx, get prog() { return prog; } };
})();
