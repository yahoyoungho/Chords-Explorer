// Chord staff (from Jacob/staff_explorer/staff_absolute.html): click chords on the staff, they lift into a progression lane above it.
// Emits a "progchange" event with the ordered progression; scatter.js calls setNext() to glow the likeliest next chords.
const ChordStaff = (() => {
  const NAME = { Fs: "F♯", Cs: "C♯", Gs: "G♯", Ds: "D♯", As: "A♯", Bb: "B♭", Eb: "E♭", Ab: "A♭", Db: "D♭", Gb: "G♭" };
  const root = c => c.replace("min", ""), isMin = c => c.endsWith("min");
  const label = c => (NAME[root(c)] || root(c)) + (isMin(c) ? "m" : "");
  const STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const ACC = c => { const r = root(c); return r.length > 1 ? (r[1] === "s" ? "♯" : "♭") : ""; };
  const stepOf = c => STEP[root(c)[0]];
  const yb = 215, half = 10, stepY = s => yb - (s - 2) * half, LANE_Y = 52, laneX = i => 200 + i * 150, MAX = 4;
  let prog = [], data = [], nodes, lane, arrows, xs, nodeEls;

  function drawNote(sel, d, cx, cy, stemUp) {
    if (d.st === 0 && cy >= stepY(0) - 1) sel.append("line").attr("x1", cx - 16).attr("x2", cx + 16).attr("y1", cy).attr("y2", cy).attr("stroke", "#444");
    sel.append("text").attr("x", cx - 27).attr("y", cy + 6).attr("font-size", 20).text(ACC(d.c));
    sel.append("ellipse").attr("class", "head").attr("cx", cx).attr("cy", cy).attr("rx", 11).attr("ry", 8).attr("transform", `rotate(-20 ${cx} ${cy})`)
      .attr("fill", isMin(d.c) ? "#fff" : "#1d2330").attr("stroke", "#1d2330").attr("stroke-width", 2);
    sel.append("line").attr("x1", cx + (stemUp ? 10 : -10)).attr("x2", cx + (stemUp ? 10 : -10)).attr("y1", cy).attr("y2", cy + (stemUp ? -36 : 36)).attr("stroke", "#1d2330").attr("stroke-width", 1.8);
  }

  function init(pal) {
    const order = [...pal].sort((a, b) => stepOf(a) - stepOf(b) || (ACC(a) === "♭" ? -1 : ACC(a) === "♯" ? 1 : 0) - (ACC(b) === "♭" ? -1 : ACC(b) === "♯" ? 1 : 0) || isMin(a) - isMin(b));
    data = order.map(c => ({ c, st: stepOf(c) }));
    xs = d3.scalePoint(order, [150, 1000]).padding(0);
    const staff = d3.select("#staff").html("");
    staff.append("text").attr("x", 14).attr("y", LANE_Y + 6).attr("fill", "#6b7280").attr("font-size", 12).text("progression");
    for (let i = 0; i < 5; i++) staff.append("line").attr("x1", 20).attr("x2", 1020).attr("y1", yb - i * 2 * half).attr("y2", yb - i * 2 * half).attr("stroke", "#444");
    staff.append("text").attr("x", 26).attr("y", yb + 4).attr("font-size", 84).text("𝄞");
    lane = staff.append("g"); arrows = staff.append("g");
    nodes = staff.append("g").selectAll("g.note").data(data).join("g").attr("class", "note").on("click", (e, d) => pick(d.c));
    nodes.each(function (d) {
      const n = d3.select(this), cx = xs(d.c), cy = stepY(d.st);
      drawNote(n, d, cx, cy, d.st < 4);
      n.append("text").attr("x", cx).attr("y", yb + 38).attr("text-anchor", "middle").attr("font-weight", 700).text(label(d.c));
      n.append("text").attr("class", "nxt").attr("x", cx).attr("y", yb + 52).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#c2410c");
      n.append("title").text(label(d.c));
    });
    d3.select("#undo").on("click", pop); d3.select("#clear").on("click", () => { while (prog.length) pop(true); emit(); });
    emit();
  }

  function pick(c) {
    if (prog.length >= MAX) return;
    const d = data.find(x => x.c === c), i = prog.length; prog.push(c);
    // the clicked note is copied and lifted above the staff into the progression lane
    const g = lane.append("g").attr("class", "lane-note").datum({ c, i }).attr("transform", `translate(${xs(c) - laneX(i)},${stepY(d.st) - LANE_Y})`);
    drawNote(g, d, laneX(i), LANE_Y, false);
    g.append("text").attr("x", laneX(i)).attr("y", LANE_Y - 26).attr("text-anchor", "middle").attr("font-weight", 700).attr("font-size", 15).text(label(c));
    g.transition().duration(650).ease(d3.easeCubicOut).attr("transform", "translate(0,0)");
    emit();
  }
  function pop(silent) {
    if (!prog.length) return; prog.pop();
    const g = lane.selectAll(".lane-note").filter((d, i, a) => i === a.length - 1), { c, i } = g.datum(), d = data.find(x => x.c === c);
    g.transition().duration(450).attr("transform", `translate(${xs(c) - laneX(i)},${stepY(d.st) - LANE_Y})`).style("opacity", 0).remove();
    if (silent !== true) emit();
  }
  function emit() {
    arrows.selectAll("path").data(prog.slice(1)).join("path").attr("d", (c, i) => `M${laneX(i) + 18},${LANE_Y} L${laneX(i + 1) - 22},${LANE_Y}`)
      .attr("stroke", "#c2410c").attr("stroke-width", 2).attr("fill", "none").attr("stroke-dasharray", "4 3");
    setNext(null);
    window.dispatchEvent(new CustomEvent("progchange", { detail: { prog: [...prog] } }));
  }
  // frac: Map chord -> share of matching songs where that chord comes next (or null to clear)
  function setNext(frac) {
    const f = d => (frac && frac.get(d.c)) || 0, on = !!frac && prog.length > 0 && prog.length < MAX;
    nodes.select(".head").attr("stroke", d => on && f(d) > 0.1 ? "#c2410c" : "#1d2330").attr("stroke-width", d => 2 + (on ? f(d) * 8 : 0));
    nodes.select(".nxt").text(d => on && f(d) >= 0.05 ? Math.round(f(d) * 100) + "%" : "");
    nodes.style("opacity", d => !on || f(d) >= 0.02 ? 1 : 0.35);
  }
  return { init, setNext, label, get prog() { return prog; } };
})();
