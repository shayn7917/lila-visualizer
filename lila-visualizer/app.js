// ============================================================
// LILA BLACK Player Journey Visualizer
// ============================================================

const MAP_IMAGES = {
  AmbroseValley: "minimaps/AmbroseValley_Minimap.jpg",
  GrandRift: "minimaps/GrandRift_Minimap.jpg",
  Lockdown: "minimaps/Lockdown_Minimap.jpg",
};

const EVENT_STYLE = {
  BotKill: { color: "gold", shape: "star", size: 7 },
  Kill: { color: "gold", shape: "star", size: 9 },
  BotKilled: { color: "#ff4d4d", shape: "x", size: 6 },
  Killed: { color: "#ff4d4d", shape: "x", size: 8 },
  Loot: { color: "orange", shape: "circle", size: 3 },
  KilledByStorm: { color: "#b266ff", shape: "plus", size: 7 },
};

let matchIndex = [];
let currentMatch = null;
let mapImage = new Image();
let playing = false;
let playTimer = null;
let loadToken = 0;

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
const heatmapModes = document.getElementById("heatmapModes");

async function init() {
  try {
    const res = await fetch("data/match_index.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error("match_index.json is empty");
    matchIndex = data;

    const maps = [...new Set(matchIndex.map(m => m.map_id))].sort();
    mapSelect.innerHTML = maps.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

    mapSelect.addEventListener("change", populateDayDropdown);
    daySelect.addEventListener("change", populateMatchDropdown);
    matchSelect.addEventListener("change", () => loadMatch(matchSelect.value));
    timeSlider.addEventListener("input", () => { stopPlaying(); render(); });
    playBtn.addEventListener("click", togglePlay);
    heatmapToggle.addEventListener("change", render);
    document.querySelectorAll('input[name="heatmapMode"]').forEach(radio => radio.addEventListener("change", render));
    window.addEventListener("resize", resizeCanvas);

    populateDayDropdown();
    resizeCanvas();
  } catch (error) {
    showError(`Could not load the visualizer data: ${error.message}`);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function showError(message) {
  matchMeta.innerHTML = `<span class="error">${escapeHtml(message)}</span>`;
  matchSelect.innerHTML = `<option>Unavailable</option>`;
  stopPlaying();
}

function sortDays(days) {
  return days.sort((a, b) => {
    const na = parseInt(a.split("_")[1], 10);
    const nb = parseInt(b.split("_")[1], 10);
    return na - nb;
  });
}

function populateDayDropdown() {
  const selectedMap = mapSelect.value;
  const days = sortDays([...new Set(matchIndex.filter(m => m.map_id === selectedMap).map(m => m.day))]);
  daySelect.innerHTML = `<option value="__all__">All dates</option>` +
    days.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d.replace("_", " "))}</option>`).join("");
  populateMatchDropdown();
}

function populateMatchDropdown() {
  const selectedMap = mapSelect.value;
  const selectedDay = daySelect.value;
  const matches = matchIndex.filter(m => m.map_id === selectedMap && (selectedDay === "__all__" || m.day === selectedDay));
  matches.sort((a, b) => b.duration_sec - a.duration_sec);

  matchSelect.innerHTML = matches.length
    ? matches.map(m => `<option value="${escapeHtml(m.match_id)}">${escapeHtml(m.day.replace("_", " "))} — ${m.n_players}p (${m.n_humans}h) — ${m.duration_sec}s</option>`).join("")
    : `<option value="">No matches</option>`;

  if (matches.length) loadMatch(matches[0].match_id);
  else {
    currentMatch = null;
    matchMeta.textContent = "No matches for this filter.";
    render();
  }
}

async function loadMatch(matchId) {
  if (!matchId) return;
  stopPlaying();
  const token = ++loadToken;
  const safeName = String(matchId).replace(/[^a-zA-Z0-9_-]/g, "_");
  try {
    const res = await fetch(`data/matches/${encodeURIComponent(safeName)}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    if (token !== loadToken) return;
    if (!raw || !Array.isArray(raw.players) || !Array.isArray(raw.events) || !Array.isArray(raw.event_names)) {
      throw new Error("invalid match JSON schema");
    }

    currentMatch = {
      match_id: raw.match_id,
      map_id: raw.map_id,
      day: raw.day,
      duration_sec: Number(raw.duration_sec) || 0,
      events: raw.events.map(([p, e, t, px, py]) => ({
        user_id: raw.players[p]?.id,
        is_human: Boolean(raw.players[p]?.h),
        event: raw.event_names[e],
        t: Number(t),
        pixel_x: Number(px),
        pixel_y: Number(py),
      })).filter(e => e.user_id != null && e.event != null && Number.isFinite(e.pixel_x) && Number.isFinite(e.pixel_y)),
    };

    matchMeta.innerHTML = `Map: ${escapeHtml(currentMatch.map_id)}<br>Day: ${escapeHtml(currentMatch.day)}<br>Duration: ${formatTime(currentMatch.duration_sec)}`;
    timeSlider.max = currentMatch.duration_sec;
    timeSlider.value = 0;

    mapImage = new Image();
    mapImage.onload = () => { if (token === loadToken) { resizeCanvas(); render(); } };
    mapImage.onerror = () => { if (token === loadToken) showError(`Could not load minimap for ${currentMatch.map_id}.`); };
    const imagePath = MAP_IMAGES[currentMatch.map_id];
    if (!imagePath) throw new Error(`no minimap configured for ${currentMatch.map_id}`);
    mapImage.src = imagePath;
  } catch (error) {
    if (token === loadToken) showError(`Could not load match: ${error.message}`);
  }
}

function resizeCanvas() {
  const available = Math.max(260, Math.min(window.innerWidth - 300, 900));
  const cssSize = Math.min(700, available);
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  render();
}

function render() {
  if (!currentMatch || !mapImage.complete || !mapImage.naturalWidth) return;
  const t = Number(timeSlider.value);
  timeLabel.textContent = formatTime(t);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);

  if (heatmapToggle.checked) drawHeatmap();

  const byUser = {};
  for (const e of currentMatch.events) {
    if (!byUser[e.user_id]) byUser[e.user_id] = [];
    byUser[e.user_id].push(e);
  }

  for (const uid in byUser) {
    const events = byUser[uid].filter(e => e.t <= t);
    if (!events.length) continue;
    const isHuman = events[0].is_human;
    const posEvents = events.filter(e => e.event === "Position" || e.event === "BotPosition");

    if (posEvents.length > 1) {
      ctx.beginPath();
      ctx.moveTo(posEvents[0].pixel_x, posEvents[0].pixel_y);
      for (const e of posEvents.slice(1)) ctx.lineTo(e.pixel_x, e.pixel_y);
      ctx.strokeStyle = isHuman ? "rgba(255,77,77,0.9)" : "rgba(77,210,255,0.5)";
      ctx.lineWidth = isHuman ? 2.5 : 1;
      ctx.stroke();
    }

    if (posEvents.length) {
      const last = posEvents[posEvents.length - 1];
      ctx.beginPath();
      ctx.arc(last.pixel_x, last.pixel_y, isHuman ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isHuman ? "#ff4d4d" : "#4dd2ff";
      ctx.fill();
    }

    for (const e of events) {
      const style = EVENT_STYLE[e.event];
      if (style) drawMarker(e.pixel_x, e.pixel_y, style);
    }
  }
}

function drawMarker(x, y, style) {
  if (style.shape === "circle") {
    ctx.beginPath(); ctx.arc(x, y, style.size, 0, Math.PI * 2); ctx.fillStyle = style.color; ctx.fill(); return;
  }
  ctx.beginPath();
  if (style.shape === "x") {
    ctx.moveTo(x - style.size, y - style.size); ctx.lineTo(x + style.size, y + style.size);
    ctx.moveTo(x + style.size, y - style.size); ctx.lineTo(x - style.size, y + style.size);
  } else if (style.shape === "plus") {
    ctx.moveTo(x - style.size, y); ctx.lineTo(x + style.size, y);
    ctx.moveTo(x, y - style.size); ctx.lineTo(x, y + style.size);
  }
  if (style.shape !== "star") {
    ctx.strokeStyle = style.color; ctx.lineWidth = style.shape === "plus" ? 2.5 : 2; ctx.stroke(); return;
  }
  drawStar(x, y, style.size, style.color);
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
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

function drawHeatmap() {
  const mode = document.querySelector('input[name="heatmapMode"]:checked')?.value || "deaths";
  if (mode === "traffic") { drawTrafficHeatmap(); return; }
  const eventSet = mode === "kills" ? new Set(["Kill", "BotKill"]) : new Set(["Killed", "BotKilled", "KilledByStorm"]);
  const color = mode === "kills" ? "255,196,0" : "255,60,60";
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const e of currentMatch.events) {
    if (!eventSet.has(e.event) || e.t > Number(timeSlider.value)) continue;
    const gradient = ctx.createRadialGradient(e.pixel_x, e.pixel_y, 0, e.pixel_x, e.pixel_y, 40);
    gradient.addColorStop(0, `rgba(${color},0.35)`); gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(e.pixel_x, e.pixel_y, 40, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawTrafficHeatmap() {
  const GRID = 16, cellSize = canvas.width / GRID, counts = new Array(GRID * GRID).fill(0), t = Number(timeSlider.value);
  for (const e of currentMatch.events) {
    if ((e.event !== "Position" && e.event !== "BotPosition") || e.t > t) continue;
    const gx = Math.max(0, Math.min(Math.floor((e.pixel_x / canvas.width) * GRID), GRID - 1));
    const gy = Math.max(0, Math.min(Math.floor((e.pixel_y / canvas.height) * GRID), GRID - 1));
    counts[gy * GRID + gx]++;
  }
  const max = Math.max(...counts, 1);
  ctx.save();
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    const c = counts[gy * GRID + gx];
    if (!c) continue;
    ctx.fillStyle = `rgba(255,140,0,${(c / max * 0.55).toFixed(2)})`;
    ctx.fillRect(gx * cellSize, gy * cellSize, cellSize, cellSize);
  }
  ctx.restore();
}

function togglePlay() { playing ? stopPlaying() : startPlaying(); }
function startPlaying() {
  if (!currentMatch || Number(timeSlider.max) <= 0) return;
  playing = true; playBtn.textContent = "⏸ Pause";
  playTimer = setInterval(() => {
    let t = Number(timeSlider.value) + 1;
    if (t > Number(timeSlider.max)) { stopPlaying(); return; }
    timeSlider.value = t; render();
  }, 100);
}
function stopPlaying() {
  playing = false; playBtn.textContent = "▶ Play";
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
}
function formatTime(sec) {
  sec = Math.max(0, Number(sec) || 0);
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

if (heatmapModes) heatmapModes.setAttribute("aria-live", "polite");
init();
