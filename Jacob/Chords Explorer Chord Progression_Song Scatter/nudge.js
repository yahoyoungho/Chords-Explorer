// Floating "next step" note for the single scrolling page (index.html).
(() => {
  // ---- floating next-step note ----
  const nudge = d3.select("#nudge"), txt = d3.select("#nudge-text"), go = d3.select("#nudge-go"), x = d3.select("#nudge-x");
  let cur = "learn", dismissed = {}, target = null;
  const scrollTo = id => document.getElementById(id).scrollIntoView({ behavior: "smooth", block: "start" });
  function render() {
    const n = ChordStaff.prog.length;
    let t = null;
    if (cur === "learn") t = ["Ready? Next, build a progression of your own.", "Go to Step 2 ↓", "build"];
    else if (cur === "build") t = n ? [`${n} chord${n > 1 ? "s" : ""} added. The songs that use ${n > 1 ? "this progression" : "it"} are in Step 3 below.`, "See the songs ↓", "explore"] : ["Click a note on the staff to add your first chord.", null, null];
    else if (cur === "explore") t = ["Want to try a different progression?", "↑ Back to the staff", "build"];
    const hide = !t || dismissed[cur + n];
    nudge.attr("hidden", hide ? true : null);
    if (hide) return;
    txt.text(t[0]); target = t[2]; go.style("display", t[1] ? null : "none").text(t[1] || "");
  }
  go.on("click", () => target && scrollTo(target));
  x.on("click", () => { dismissed[cur + ChordStaff.prog.length] = true; render(); });
  const seen = new Map();
  const io = new IntersectionObserver(es => {
    es.forEach(e => seen.set(e.target.id, e.intersectionRatio));
    const best = [...seen].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0 && best[0] !== cur) { cur = best[0]; render(); }
  }, { threshold: [0, .15, .3, .5, .7, 1] });
  document.querySelectorAll(".step").forEach(s => io.observe(s));
  window.addEventListener("progchange", render);
  setTimeout(render, 600);
})();
