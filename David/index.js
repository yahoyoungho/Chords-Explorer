import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// ---------- Variables y constantes ----------
const filter_container = d3.select(".filter-half");
const sel = filter_container
  .select("#second_filter")
  .selectAll("select")
  .data([null]) // un solo select
  .join("select")
  .attr("id", "chord-selector");

let main_chords = ["A", "B", "C", "D", "E", "F", "G"];
let present_chords = {
  A: ["", "A"],
  B: ["", "B"],
  C: ["", "C"],
  D: ["", "D"],
  E: ["", "E"],
  F: ["", "F"],
  G: ["", "G"],
};

let chord_selected = [];

const height = 400;

const svg = d3
  .select("#circles-scroll")
  .selectAll("svg")
  .data([null])
  .join("svg")
  .attr("height", height)
  .attr("viewBox", [-300, 0, 1000, height]);

async function init() {
  try {
    const data = await d3.csv("new_dataset.csv", d3.autoType);
    const raw_chords = data.map((d) => new Set(d.chords.split(" ")));
    let chords = raw_chords.map((d) => [...d].filter((d) => d.length > 1));
    console.log(
      "raw_chords",
      data.map((d) => d.chords.split(" ").filter((c) => c !== "")),
    );
    console.log("chord", chords);
    sort_chords(chords);
    return data;
  } catch (error) {
    console.error("Error al cargar el CSV:", error);
  }
}

function sort_chords(chords) {
  for (let i = 0; i < chords.length; i++) {
    for (let j = 0; j < chords[i].length; j++) {
      if (!present_chords[chords[i][j][0]].includes(chords[i][j]))
        present_chords[chords[i][j][0]].push(chords[i][j]);
    }
  }
  Object.entries(present_chords).forEach(([main_chord, chord]) => {
    present_chords[main_chord] = chord.sort();
  });
}

function render_filter(data) {
  filter_container
    .select("#main_filter")
    .selectAll("label")
    .data(data)
    .join("label")
    .attr("class", "tile")
    .append("label")
    .html(
      (d, i) => `
    <input type="radio" name="opcion" value="${d}"/>
    <span>${d}</span>`,
    );
}

function circles_needed(len) {
  let num_circles = [];
  let location = 345;
  let turn_flag = true;
  for (let i = 0; i < len; i++) {
    num_circles.push(location);
    if (location == 30) turn_flag = false;
    else if (location == 345) turn_flag = true;
    if (turn_flag) location -= 35;
    else location += 35;
  }
  return num_circles;
}

function render_circles(data) {
  let num_circles = circles_needed(data.length);
  const items = data.map((valor, i) => ({ valor, rango: num_circles[i] }));
  const chords = svg
    .selectAll("g.painted_chord")
    .data(items)
    .join((enter) => {
      const g = enter.append("g").attr("class", "painted_chord");
      g.append("circle").attr("r", 30).attr("fill", "#000000");
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", "#f2f2f2")
        .attr("font-size", 30);
      return g;
    })
    .attr("transform", (d, i) => `translate(${225 + i * 120}, ${d.rango})`);

  chords.select("text").text((d) => d.valor);
  const total_width = 10 + data.length * 120 + 60;
  const scale = document.getElementById("circles-scroll").clientHeight / height;
  svg
    .attr("viewBox", [0, 0, total_width, height])
    .attr("preserveAspectRatio", "xMinYMin meet") // empieza desde la izquierda
    .style("width", `${total_width * scale + 70}px`);
}

function get_chart_root(selector, chart_id, title="") {
  const parent = d3.select(selector);
  const root = parent
    .selectAll(`div.chart-${chart_id}`)
    .data([null])
    .join("div")
    .attr("class", `chart-${chart_id}`);
  root.selectAll("*").remove(); 
  if (title) root.append("h3").attr("class", "chart-title").text(title);
  return root;
}

function parse_chords(d) {
  return new Set((d.chords ?? "").split(" ").filter(Boolean));
}

function renderPieChart(data, selector = ".info-content") {
  const width = 290;
  const height = 200;
  const radius = 100;

  const counts = d3.rollup(
    data.filter((d) => d.main_genre != null),
    (v) => v.length,
    (d) => d.main_genre,
  );

  const pieData = [...counts].map(([genre, count]) => ({
    genre,
    count,
  }));

  const total = d3.sum(pieData, (d) => d.count);

  const pie = d3
    .pie()
    .value((d) => d.count)
    .sort(null);

  const arc = d3.arc().innerRadius(0).outerRadius(radius);

  const colors = d3
    .scaleOrdinal()
    .domain(pieData.map((d) => d.genre))
    .range(d3.schemeTableau10);

  const root = get_chart_root(selector, "pie", "Genres based on Chord Progressions");

  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);

  const chart = svg
    .append("g")
    .attr("transform", `translate(${radius + 10}, ${height / 2})`);

  const slices = pie(pieData);

  chart
    .selectAll("path")
    .data(slices)
    .join("path")
    .attr("d", arc)
    .attr("fill", (d) => colors(d.data.genre))
    .attr("stroke", "white")
    .attr("stroke-width", 1);

  chart
    .selectAll("text.percentage")
    .data(slices)
    .join("text")
    .attr("class", "percentage")
    .attr("transform", (d) => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("font-size", 9)
    .text((d) => {
      const percentage = (d.data.count / total) * 100;
      return percentage >= 3 ? `${percentage.toFixed(1)}%` : "";
    });

  const legend = svg
    .append("g")
    .attr("transform", `translate(${radius * 2 + 25}, 15)`);

  legend
    .selectAll("g")
    .data(pieData)
    .join("g")
    .attr("transform", (d, i) => `translate(0, ${i * 10})`)
    .each(function (d) {
      const item = d3.select(this);

      item
        .append("rect")
        .attr("width", 8)
        .attr("height", 8)
        .attr("fill", colors(d.genre));

      item
        .append("text")
        .attr("x", 11)
        .attr("y", 7)
        .attr("font-size", 11)
        .text(d.genre);
    });
}

function renderChordDiversity(data, selector = ".info-content", genre_key = "main_genre",) {
  const width = 690;
  const height = 350;
  const margin = { top: 8, right: 10, bottom: 55, left: 30 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const clean = data.filter((d) => d[genre_key] != null);

  // One box per genre, sorted by number of tracks
  const boxes = d3
    .groups(clean, (d) => d[genre_key])
    .map(([genre, rows]) => {
      const values = rows.map((d) => parse_chords(d).size).sort(d3.ascending);
      const q1 = d3.quantile(values, 0.25);
      const median = d3.quantile(values, 0.5);
      const q3 = d3.quantile(values, 0.75);
      const iqr = q3 - q1;
      const low_fence = q1 - 1.5 * iqr;
      const high_fence = q3 + 1.5 * iqr;
      return {
        genre,
        n: values.length,
        q1,
        median,
        q3,
        whisker_low: d3.min(values.filter((v) => v >= low_fence)),
        whisker_high: d3.max(values.filter((v) => v <= high_fence)),
        outliers: values.filter((v) => v < low_fence || v > high_fence),
      };
    })
    .sort((a, b) => d3.descending(a.n, b.n));

  const x = d3
    .scaleBand()
    .domain(boxes.map((b) => b.genre))
    .range([0, innerW])
    .padding(0.3);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(boxes, (b) => d3.max([b.whisker_high, ...b.outliers]))])
    .nice()
    .range([innerH, 0]);

  const color = "#636efa";

  const root = get_chart_root(selector, "diversity", "Chord diversity by main genre");
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Axes
  g.append("g")
    .attr("transform", `translate(0, ${innerH})`)
    .call(
      d3.axisBottom(x).tickFormat((genre) => {
        const b = boxes.find((box) => box.genre === genre);
        return `${genre} (n=${b.n.toLocaleString()})`;
      }),
    )
    .selectAll("text")
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end")
    .style("font-size", "7px");

  g.append("g")
    .call(d3.axisLeft(y).ticks(5))
    .selectAll("text")
    .style("font-size", "7px");

  const box = g
    .selectAll("g.box")
    .data(boxes)
    .join("g")
    .attr("class", "box")
    .attr("transform", (b) => `translate(${x(b.genre)}, 0)`);

  const mid = x.bandwidth() / 2;

  // Whiskers
  box
    .append("line")
    .attr("x1", mid)
    .attr("x2", mid)
    .attr("y1", (b) => y(b.whisker_low))
    .attr("y2", (b) => y(b.whisker_high))
    .attr("stroke", color);

  // Box (Q1 to Q3)
  box
    .append("rect")
    .attr("y", (b) => y(b.q3))
    .attr("width", x.bandwidth())
    .attr("height", (b) => Math.max(1, y(b.q1) - y(b.q3)))
    .attr("fill", color)
    .attr("fill-opacity", 0.5)
    .attr("stroke", color);

  // Median
  box
    .append("line")
    .attr("x1", 0)
    .attr("x2", x.bandwidth())
    .attr("y1", (b) => y(b.median))
    .attr("y2", (b) => y(b.median))
    .attr("stroke", color)
    .attr("stroke-width", 5);

  // Whisker caps
  box
    .selectAll("line.cap")
    .data((b) => [b.whisker_low, b.whisker_high])
    .join("line")
    .attr("class", "cap")
    .attr("x1", mid - x.bandwidth() / 4)
    .attr("x2", mid + x.bandwidth() / 4)
    .attr("y1", (v) => y(v))
    .attr("y2", (v) => y(v))
    .attr("stroke", color);

  // Outliers
  box
    .selectAll("circle")
    .data((b) => b.outliers)
    .join("circle")
    .attr("cx", mid)
    .attr("cy", (v) => y(v))
    .attr("r", 1.5)
    .attr("fill", color);

  // Y axis title
  svg
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 8)
    .attr("text-anchor", "middle")
    .attr("font-size", 8)
    .text("Distinct chord labels per track");
}

function renderViolin(raw_data, selector = ".info-content", genre_key = "main_genre", mode_key = "era", value_key = "popularity",) {
  const width = 690;
  const height = 260;
  const margin = { top: 10, right: 50, bottom: 40, left: 35 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const data = raw_data
    .filter((d) => d.release_date != null && d.popularity != null)
    .map((d) => ({
      ...d,
      era:
        new Date(d.release_date).getFullYear() < 2000 ? "before 2000" : "2000+",
    }));

  const clean = data.filter(
    (d) => d[genre_key] != null && d[mode_key] != null && d[value_key] != null,
  );

  const genres = [...new Set(clean.map((d) => d[genre_key]))];
  const modes = [...new Set(clean.map((d) => d[mode_key]))].sort();
  const colors = d3.scaleOrdinal().domain(modes).range(["#636efa", "#ef553b"]);

  // Gaussian kernel density estimate
  const gauss = (u) => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
  function kde(values, bandwidth, ticks) {
    return ticks.map((t) => [
      t,
      d3.mean(values, (v) => gauss((t - v) / bandwidth)) / bandwidth,
    ]);
  }

  // One violin per genre and mode
  const violins = [];
  for (const genre of genres) {
    for (const mode of modes) {
      const values = clean
        .filter((d) => d[genre_key] === genre && d[mode_key] === mode)
        .map((d) => d[value_key])
        .sort(d3.ascending);
      if (values.length < 2) continue;

      // Silverman's rule of thumb
      const bandwidth =
        1.06 * (d3.deviation(values) || 0.05) * values.length ** -0.2;
      const lo = values[0] - 3 * bandwidth;
      const hi = values[values.length - 1] + 3 * bandwidth;
      const ticks = d3.range(lo, hi, (hi - lo) / 60).concat(hi);

      violins.push({
        genre,
        mode,
        density: kde(values, bandwidth, ticks),
        q1: d3.quantile(values, 0.25),
        median: d3.quantile(values, 0.5),
        q3: d3.quantile(values, 0.75),
        lo,
        hi,
      });
    }
  }

  const x = d3.scaleBand().domain(genres).range([0, innerW]).padding(0.15);
  const x_mode = d3
    .scaleBand()
    .domain(modes)
    .range([0, x.bandwidth()])
    .padding(0.1);

  const y = d3
    .scaleLinear()
    .domain([d3.min(violins, (v) => v.lo), d3.max(violins, (v) => v.hi)])
    .nice()
    .range([innerH, 0]);

  // Same maximum half-width for every violin
  const half_width = d3.scaleLinear().range([0, x_mode.bandwidth() / 2]);

  const area = d3
    .area()
    .curve(d3.curveCatmullRom)
    .y((d) => y(d[0]));

  const root = get_chart_root(selector, "violin", "Popularity by genre and century");
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Horizontal grid lines
  g.append("g")
    .selectAll("line")
    .data(y.ticks(6))
    .join("line")
    .attr("x1", 0)
    .attr("x2", innerW)
    .attr("y1", (t) => y(t))
    .attr("y2", (t) => y(t))
    .attr("stroke", "#000")
    .attr("stroke-opacity", 0.1);

  const violin = g
    .selectAll("g.violin")
    .data(violins)
    .join("g")
    .attr("class", "violin")
    .attr(
      "transform",
      (v) =>
        `translate(${x(v.genre) + x_mode(v.mode) + x_mode.bandwidth() / 2}, 0)`,
    );

  // Density shape
  violin
    .append("path")
    .attr("fill", (v) => colors(v.mode))
    .attr("fill-opacity", 0.5)
    .attr("stroke", (v) => colors(v.mode))
    .attr("stroke-width", 1)
    .attr("d", (v) => {
      half_width.domain([0, d3.max(v.density, (p) => p[1])]);
      return area.x0((p) => -half_width(p[1])).x1((p) => half_width(p[1]))(
        v.density,
      );
    });

  // Inner box (Q1 to Q3)
  const box_w = x_mode.bandwidth() * 0.12;
  violin
    .append("rect")
    .attr("x", -box_w / 2)
    .attr("y", (v) => y(v.q3))
    .attr("width", box_w)
    .attr("height", (v) => Math.max(1, y(v.q1) - y(v.q3)))
    .attr("fill", (v) => colors(v.mode))
    .attr("fill-opacity", 0.6)
    .attr("stroke", (v) => colors(v.mode));

  // Median
  violin
    .append("line")
    .attr("x1", -box_w / 2)
    .attr("x2", box_w / 2)
    .attr("y1", (v) => y(v.median))
    .attr("y2", (v) => y(v.median))
    .attr("stroke", (v) => colors(v.mode))
    .attr("stroke-width", 1.5);

  // Axes
  g.append("g")
    .attr("transform", `translate(0, ${innerH})`)
    .call(d3.axisBottom(x).tickSize(0))
    .selectAll("text")
    .style("font-size", "7px");

  g.append("g")
    .call(d3.axisLeft(y).ticks(6))
    .selectAll("text")
    .style("font-size", "7px");

  // Axis titles
  svg
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 8)
    .attr("text-anchor", "middle")
    .attr("font-size", 8)
    .text(value_key);

  svg
    .append("text")
    .attr("x", margin.left + innerW / 2)
    .attr("y", height - 4)
    .attr("text-anchor", "middle")
    .attr("font-size", 8)
    .text(genre_key.replace("_", " "));

  // Legend
  const legend = svg
    .append("g")
    .attr(
      "transform",
      `translate(${width - margin.right + 10}, ${margin.top})`,
    );

  legend
    .selectAll("g")
    .data(modes)
    .join("g")
    .attr("transform", (m, i) => `translate(0, ${i * 12})`)
    .each(function (m) {
      const item = d3.select(this);
      item
        .append("rect")
        .attr("width", 7)
        .attr("height", 7)
        .attr("fill", colors(m))
        .attr("fill-opacity", 0.5)
        .attr("stroke", colors(m));
      item
        .append("text")
        .attr("x", 11)
        .attr("y", 6)
        .attr("font-size", 7)
        .text(m);
    });
}

render_filter(main_chords);

d3.select(".filter-half").on("change", (event) => {
  const value = event.target.value;
  sel
    .selectAll("option")
    .data(present_chords[value])
    .join("option")
    .attr("value", (d) => d)
    .text((d) => d);
});

d3.select("#chord-selector").on("change", (event) => {
  const value = event.target.value;
  if (value !== "") chord_selected.push(value);
  let filter_data = data.filter(
    (d) =>
      JSON.stringify(
        d.chords
          .split(" ")
          .filter((c) => c !== "")
          .slice(0, chord_selected.length),
      ) === JSON.stringify(chord_selected),
  );
  console.log("filter_data", filter_data);
  render_circles(chord_selected);
  renderPieChart(filter_data);
  renderChordDiversity(filter_data);
  renderViolin(filter_data);
  event.target.value = "";
});

const data = await init();
renderPieChart(data);
renderChordDiversity(data);
renderViolin(data);
const sf_area = document.getElementById("second_filter");
sf_area.insertAdjacentHTML(
  "beforeend",
  `
	<br><br><button id='clear_button'>Clear selection</button>
	`,
);
d3.select("#clear_button").on("click", (event) => {
  chord_selected = [];
  svg.selectAll("g").remove();
  renderPieChart(data);
  renderChordDiversity(data);
  renderViolin(data);
});
