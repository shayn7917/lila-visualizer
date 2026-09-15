// ============================================================
// LILA BLACK Player Journey Visualizer
// ============================================================
// Mental model:
//   1. Load match_index.json -> populate the dropdowns
//   2. When a match is picked, load that match's JSON file
//   3. Draw the minimap image on the canvas
//   4. Draw player paths + events on top, filtered by the
//      current time slider position
//   5. "Play" just advances the slider on a timer
// ============================================================

// Minimaps are downscaled to 2048x2048 JPEG at build time (sources are up to
// 9000x9000 PNG, ~24MB total -> ~1.1MB). They render into a 1024 canvas, so
// 2048 leaves headroom without dominating load time.
const MAP_IMAGES = {
  AmbroseValley: "minimaps/AmbroseValley_Minimap.jpg",
  GrandRift: "minimaps/GrandRift_Minimap.jpg",
  Lockdown: "minimaps/Lockdown_Minimap.jpg",
};

const EVENT_STYLE = {
  BotKill:       { color: "gold",    shape: "star",   size: 7 },
  Kill:          { color: "gold",    shape: "star",   size: 9 },
  BotKilled:     { color: "#ff4d4d", shape: "x",       size: 6 },
  Killed:        { color: "#ff4d4d", shape: "x",       size: 8 },
  Loot:          { color: "orange",  shape: "circle",  size: 3 },
  KilledByStorm: { color: "#b266ff", shape: "plus",    size: 7 },
};

// ---- global state ----
let matchIndex = [];
let currentMatch = null;   // parsed JSON of the selected match
let mapImage = new Image();
let playing = false;
let playTimer = null;

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

const mapSelect = document.getElementById("mapSelect");
const daySelect = document.getElementById("daySelect");
const matchSelect = document.getElementById("matchSelect");
const matchMeta = document.getElementById("matchMeta");
const timeSlider = document.getElementById("timeSlider");
const timeLabel = document.getElementById("timeLabel");
const playBtn = document.getElementById("playBtn");
const heatmapToggle = document.getElementById("heatmapToggle");

// ---------------------------------------------------------------
// 1. BOOTSTRAP: load the match index, populate dropdowns
// ---------------------------------------------------------------
async function init() {
  const res = await fetch("data/match_index.json");
  matchIndex = await res.json();

  const maps = [...new Set(matchIndex.map(m => m.map_id))].sort();
  mapSelect.innerHTML = maps.map(m => `<option value="${m}">${m}</option>`).join("");

  mapSelect.addEventListener("change", populateDayDropdown);
  daySelect.addEventListener("change", populateMatchDropdown);
  matchSelect.addEventListener("change", () => loadMatch(matchSelect.value));
  timeSlider.addEventListener("input", () => {
    stopPlaying();
    render();
  });
  playBtn.addEventListener("click", togglePlay);
  heatmapToggle.addEventListener("change", render);
  for (const radio of document.querySelectorAll('input[name="heatmapMode"]')) {
    radio.addEventListener("change", render);
  }

  populateDayDropdown();
}

// Sorts February_10, February_11, ... correctly by their trailing number
function sortDays(days) {
  return days.sort((a, b) => {
    const na = parseInt(a.split("_")[1], 10);
    const nb = parseInt(b.split("_")[1], 10);
    return na - nb;
  });
}

function populateDayDropdown() {
  const selectedMap = mapSelect.value;
  const days = sortDays([
    ...new Set(matchIndex.filter(m => m.map_id === selectedMap).map(m => m.day)),
  ]);
  daySelect.innerHTML =
    `<option value="__all__">All dates</option>` +
    days.map(d => `<option value="${d}">${d.replace("_", " ")}</option>`).join("");
  populateMatchDropdown();
}

function populateMatchDropdown() {
  const selectedMap = mapSelect.value;
  const selectedDay = daySelect.value;

  const matches = matchIndex.filter(
    m => m.map_id === selectedMap && (selectedDay === "__all__" || m.day === selectedDay)
  );
  // longest matches first — they're the most interesting to look at
  matches.sort((a, b) => b.duration_sec - a.duration_sec);

  matchSelect.innerHTML = matches
    .map(m => `<option value="${m.match_id}">${m.day.replace("_", " ")} — ${m.n_players}p (${m.n_humans}h) — ${m.duration_sec}s</option>`)
    .join("");

  if (matches.length) {
    loadMatch(matches[0].match_id);
  } else {
    matchSelect.innerHTML = `<option>No matches</option>`;
  }
}

// ---------------------------------------------------------------
// 2. LOAD ONE MATCH
// ---------------------------------------------------------------
async function loadMatch(matchId) {
  stopPlaying();
  const safeName = matchId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const res = await fetch(`data/matches/${safeName}.json`);
  const raw = await res.json();

  // Rehydrate the compact wire format into plain objects.
  // Wire rows are [playerIndex, eventIndex, t, pixelX, pixelY].
  currentMatch = {
    match_id: raw.match_id,
    map_id: raw.map_id,
    day: raw.day,
    duration_sec: raw.duration_sec,
    events: raw.events.map(([p, e, t, px, py]) => ({
      user_id: raw.players[p].id,
      is_human: raw.players[p].h,
      event: raw.event_names[e],
      t: t,
      pixel_x: px,
      pixel_y: py,
    })),
  };

  matchMeta.innerHTML = `
    Map: ${currentMatch.map_id}<br>
    Day: ${currentMatch.day}<br>
    Duration: ${currentMatch.duration_sec}s
  `;

  mapImage = new Image();
  mapImage.src = MAP_IMAGES[currentMatch.map_id];
  mapImage.onload = () => {
    timeSlider.max = currentMatch.duration_sec;
    timeSlider.value = 0;
    render();
  };
}

// ---------------------------------------------------------------
// 3. DRAWING
// ---------------------------------------------------------------
function render() {
  if (!currentMatch || !mapImage.complete) return;

  const t = Number(timeSlider.value);
  timeLabel.textContent = formatTime(t);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);

  // group events by user so we can draw connected paths
  const byUser = {};
  for (const e of currentMatch.events) {
    if (!byUser[e.user_id]) byUser[e.user_id] = [];
    byUser[e.user_id].push(e);
  }

  if (heatmapToggle.checked) {
    drawHeatmap();
  }

  for (const uid in byUser) {
    const events = byUser[uid].filter(e => e.t <= t);
    if (!events.length) continue;

    const isHuman = events[0].is_human;
    const posEvents = events.filter(e => e.event === "Position" || e.event === "BotPosition");

    // draw the path walked so far
    if (posEvents.length > 1) {
      ctx.beginPath();
      ctx.moveTo(posEvents[0].pixel_x, posEvents[0].pixel_y);
      for (const e of posEvents.slice(1)) ctx.lineTo(e.pixel_x, e.pixel_y);
      ctx.strokeStyle = isHuman ? "rgba(255,77,77,0.9)" : "rgba(77,210,255,0.5)";
      ctx.lineWidth = isHuman ? 2.5 : 1;
      ctx.stroke();
    }

    // draw current position marker (last known position)
    if (posEvents.length) {
      const last = posEvents[posEvents.length - 1];
      ctx.beginPath();
      ctx.arc(last.pixel_x, last.pixel_y, isHuman ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isHuman ? "#ff4d4d" : "#4dd2ff";
      ctx.fill();
    }

    // draw discrete events (kills, loot, storm deaths)
    for (const e of events) {
      const style = EVENT_STYLE[e.event];
      if (style) drawMarker(e.pixel_x, e.pixel_y, style);
    }
  }
}

function drawMarker(x, y, style) {
  ctx.fillStyle = style.color;
  ctx.strokeStyle = "black";
  ctx.lineWidth = 0.5;

  if (style.shape === "circle") {
    ctx.beginPath();
    ctx.arc(x, y, style.size, 0, Math.PI * 2);
    ctx.fill();
  } else if (style.shape === "x") {
    ctx.beginPath();
    ctx.moveTo(x - style.size, y - style.size);
    ctx.lineTo(x + style.size, y + style.size);
    ctx.moveTo(x + style.size, y - style.size);
    ctx.lineTo(x - style.size, y + style.size);
    ctx.lineWidth = 2;
    ctx.strokeStyle = style.color;
    ctx.stroke();
  } else if (style.shape === "plus") {
    ctx.beginPath();
    ctx.moveTo(x - style.size, y);
    ctx.lineTo(x + style.size, y);
    ctx.moveTo(x, y - style.size);
    ctx.lineTo(x, y + style.size);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = style.color;
    ctx.stroke();
  } else if (style.shape === "star") {
    drawStar(x, y, style.size, style.color);
  }
}

function drawStar(cx, cy, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r / 2.4;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawHeatmap() {
  const mode = document.querySelector('input[name="heatmapMode"]:checked').value;

  if (mode === "traffic") {
    drawTrafficHeatmap();
    return;
  }

  // deaths / kills: sparse discrete events, so per-point soft glows work well
  const eventSet =
    mode === "kills"
      ? new Set(["Kill", "BotKill"])
      : new Set(["Killed", "BotKilled", "KilledByStorm"]);
  const color = mode === "kills" ? "255,196,0" : "255,60,60";

  const points = currentMatch.events.filter(e => eventSet.has(e.event));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const e of points) {
    const gradient = ctx.createRadialGradient(e.pixel_x, e.pixel_y, 0, e.pixel_x, e.pixel_y, 40);
    gradient.addColorStop(0, `rgba(${color},0.35)`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(e.pixel_x, e.pixel_y, 40, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Traffic is thousands of Position pings per match — painting a soft glow per
// point would just saturate the whole map. Instead we bin into a coarse grid
// and shade each cell by relative density, like the analysis in analysis.py.
function drawTrafficHeatmap() {
  const GRID = 16;
  const cellSize = canvas.width / GRID;
  const counts = new Array(GRID * GRID).fill(0);

  for (const e of currentMatch.events) {
    if (e.event !== "Position" && e.event !== "BotPosition") continue;
    const gx = Math.min(Math.floor((e.pixel_x / canvas.width) * GRID), GRID - 1);
    const gy = Math.min(Math.floor((e.pixel_y / canvas.height) * GRID), GRID - 1);
    if (gx < 0 || gy < 0) continue;
    counts[gy * GRID + gx]++;
  }

  const max = Math.max(...counts, 1);
  ctx.save();
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const c = counts[gy * GRID + gx];
      if (!c) continue;
      const intensity = c / max; // 0..1 relative to hottest cell in this match
      ctx.fillStyle = `rgba(255,140,0,${(intensity * 0.55).toFixed(2)})`;
      ctx.fillRect(gx * cellSize, gy * cellSize, cellSize, cellSize);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------
// 4. TIMELINE PLAYBACK
// ---------------------------------------------------------------
function togglePlay() {
  playing ? stopPlaying() : startPlaying();
}

function startPlaying() {
  if (!currentMatch) return;
  playing = true;
  playBtn.textContent = "⏸ Pause";
  playTimer = setInterval(() => {
    let t = Number(timeSlider.value) + 1;
    if (t > Number(timeSlider.max)) t = 0; // loop
    timeSlider.value = t;
    render();
  }, 100); // 1 sim-second per 100ms = 10x real time
}

function stopPlaying() {
  playing = false;
  playBtn.textContent = "▶ Play";
  clearInterval(playTimer);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

init();
