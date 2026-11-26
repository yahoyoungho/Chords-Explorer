// Step 1 demos: one chord (major / minor toggle) and a four-chord progression, drawn on little staffs.
(() => {
  const STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }, yb = 120, half = 10, Y = s => yb - (s - 2) * half;
  const NAVY = "#1d2330", LABEL_Y = 22;   // chord names live above the top staff line (y=40), never on a line

  function staff(svg, x0, x1) {
    for (let i = 0; i < 5; i++) svg.append("line").attr("x1", x0).attr("x2", x1).attr("y1", yb - i * 2 * half).attr("y2", yb - i * 2 * half).attr("stroke", "#444");
    svg.append("text").attr("class", "clef").attr("x", x0 + 4).attr("y", yb + 2).attr("font-size", 76).text("𝄞");
  }
  // notes = [[letter, octave-step, accidental "" | "♭" | "♯"]]; step is counted from C4 = 0
  function chord(svg, cx, notes, minor, label) {
    const g = svg.append("g");
    notes.forEach(([step, acc]) => {
      const cy = Y(step);
      if (step <= 0) g.append("line").attr("x1", cx - 16).attr("x2", cx + 16).attr("y1", cy).attr("y2", cy).attr("stroke", "#444");
      if (acc) g.append("text").attr("x", cx - 30).attr("y", cy + 6).attr("font-size", 20).text(acc);
      g.append("ellipse").attr("cx", cx).attr("cy", cy).attr("rx", 11).attr("ry", 8).attr("transform", `rotate(-20 ${cx} ${cy})`).attr("fill", NAVY).attr("stroke", NAVY).attr("stroke-width", 2);
    });
    const top = Y(d3.max(notes, n => n[0])), bot = Y(d3.min(notes, n => n[0]));
    g.append("line").attr("x1", cx + 10).attr("x2", cx + 10).attr("y1", bot).attr("y2", top - 30).attr("stroke", NAVY).attr("stroke-width", 1.8);
    if (label) g.append("text").attr("x", cx).attr("y", LABEL_Y).attr("text-anchor", "middle").attr("font-weight", 700).attr("font-size", 15).text(label);
    return g;
  }

  // ---- Step 1a: one chord, major/minor toggle ----
  const demo = d3.select("#demo-chord"), cap = d3.select("#demo-chord-cap");
  function drawDemo(minor) {
    demo.html(""); staff(demo, 10, 350);
    // C - E (or E♭) - G, played together
    chord(demo, 220, [[0, ""], [2, minor ? "♭" : ""], [4, ""]], minor, minor ? "C minor" : "C major");
    demo.append("text").attr("x", 262).attr("y", Y(0) + 5).attr("font-size", 13).attr("fill", "#6b7280").text("C");
    demo.append("text").attr("x", 262).attr("y", Y(2) + 5).attr("font-size", 13).attr("fill", "#6b7280").text(minor ? "E♭" : "E");
    demo.append("text").attr("x", 262).attr("y", Y(4) + 5).attr("font-size", 13).attr("fill", "#6b7280").text("G");
    cap.text(minor ? "C + E♭ + G played together = C minor." : "C + E + G played together = C major.");
    d3.select("#demo-maj").classed("on", !minor); d3.select("#demo-min").classed("on", minor);
  }
  d3.select("#demo-maj").on("click", () => drawDemo(false)); d3.select("#demo-min").on("click", () => drawDemo(true));
  drawDemo(false);

  // ---- Step 1b: four chords in order ----
  const pr = d3.select("#demo-prog"); staff(pr, 10, 350);
  const P = [["G", [[4, ""], [6, ""], [8, ""]], false], ["D", [[1, ""], [3, "♯"], [5, ""]], false], ["Em", [[2, ""], [4, ""], [6, ""]], true], ["C", [[0, ""], [2, ""], [4, ""]], false]];
  P.forEach(([name, notes, min], i) => {
    const cx = 120 + i * 70; chord(pr, cx, notes, min, name);
    if (i) pr.append("text").attr("x", cx - 35).attr("y", LABEL_Y + 1).attr("text-anchor", "middle").attr("fill", "#c2410c").attr("font-size", 18).attr("font-weight", 700).text("→");
  });
})();
