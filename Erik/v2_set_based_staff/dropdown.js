import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const select = d3.select("#build_staff").selectAll("select").data([null]).join("select").attr("id", "chord-selector");

function fill() {
  const prog = ChordStaff.prog, last = prog[prog.length - 1];
  const list = last && window.CHORD_VARIANTS ? window.CHORD_VARIANTS[ChordStaff.idx(last)] : [];
  select.selectAll("option").data(["", ...list]).join("option")
    .attr("value", d => d)
    .text(d => d || "(any variant)");
  select.property("value", last?.variant ?? "").property("disabled", !last);
}

select.on("change", e => ChordStaff.setVariant(e.target.value));
window.addEventListener("progchange", fill);      // acorde nuevo, undo, reset, setProg y también setVariant
window.addEventListener("variantsready", fill);   // por si el CSV termina de cargar después