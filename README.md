# LILA BLACK — Player Journey Visualizer

An interactive replay tool for LILA BLACK session telemetry. Pick a map, date, and match, then scrub through the match to see where players moved, what they looted, who they killed, and where they died — drawn over the in-game minimap.

**Live demo:** _(add your deployed URL here)_

![Visualizer](C:\Users\ShayaSingha\Pictures\Screenshots\Screenshot 2026-09-15 230709.png)

## Features

- **Match browser** — filter 796 matches by map and date
- **Timeline scrubbing** — drag to any point in the match, or hit play for a 10× replay
- **Path rendering** — human paths in red, bots in cyan, drawn progressively as time advances
- **Event markers** — bot kills, deaths, loot pickups, and storm deaths
- **Death heatmap** — toggleable density overlay showing where players die

## Feature walkthrough

1. **Pick a map** from the top dropdown — filters everything below to that map.
2. **Pick a date** (or leave "All dates") — narrows the match list further.
3. **Pick a match** — loads that session and draws it on the minimap. The panel below shows map, day, and duration.
4. **Scrub the timeline** — drag the slider to jump to any point in the match, or hit **Play** to watch it unfold at 10× speed. Paths draw progressively as time advances; nothing appears before it happened.
5. **Read the paths** — red is the human player, cyan is bots. A colored dot marks each actor's current position at the selected time.
6. **Spot events** — gold stars are kills, red X's are deaths, orange dots are loot pickups, purple crosses are storm deaths. The legend in the sidebar is the key.
7. **Toggle the heatmap** — check "Show heatmap" and pick a mode:
   - **Death zones** — where humans died, this match
   - **Kill zones** — where humans got kills, this match
   - **Traffic density** — an 8×8 grid shaded by how much human movement passed through each cell, this match
8. **Cross-match patterns** — the in-app heatmaps are per-match by design (see ARCHITECTURE.md). For map-wide patterns across all matches — which is what `INSIGHTS.md` is built on — run `python3 analysis.py`.

## Quick start

`fetch()` does not work over `file://`, so the app must be served over HTTP:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Regenerating the data

The repo ships with processed data in `data/`, so this is only needed if the raw dataset changes. Place the unzipped `player_data/` folder alongside `pipeline.py`:

```bash
pip install pyarrow pandas
python3 pipeline.py
```

This reads all 1,243 `.nakama-0` files and writes `data/match_index.json` plus `data/matches/*.json`.

To reproduce every figure quoted in `INSIGHTS.md`:

```bash
python3 analysis.py
```

## Deploying

Everything is static, so any static host works. With the Vercel CLI:

```bash
npx vercel --prod
```

Or drag the folder onto <https://app.netlify.com/drop>. No build command, no environment variables; the output directory is the repo root.

## Project layout

```
index.html          markup and controls
app.js              data loading, canvas rendering, timeline
style.css           layout
pipeline.py         raw Parquet -> processed JSON
analysis.py         reproduces the figures in INSIGHTS.md
data/               processed output (committed)
minimaps/           downscaled minimap images
ARCHITECTURE.md     stack, data flow, coordinate mapping, tradeoffs
INSIGHTS.md         three findings from the dataset
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — how it's built and why, including the coordinate projection and two data bugs found in the raw dataset
- [INSIGHTS.md](INSIGHTS.md) — what the data says about population, map usage, and retention
