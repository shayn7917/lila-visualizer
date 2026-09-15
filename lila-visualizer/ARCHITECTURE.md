# Architecture — LILA BLACK Player Journey Visualizer

## Stack and why

**Data:** Python 3 + pandas + pyarrow. **UI:** static HTML/CSS + vanilla JavaScript + Canvas 2D. **Hosting:** any static host (Vercel/Netlify/etc.).

I chose a static frontend because the assignment dataset is fixed/read-only: Parquet is transformed once into browser-ready JSON, so there is no need for a runtime API, database, or backend. Canvas is used because replay continuously redraws many path segments and event markers; it avoids creating thousands of DOM/SVG nodes.

## Data flow

```text
player_data/*/*.nakama-0 (Parquet)
        |
        | pipeline.py
        | decode events -> detect humans/bots -> normalize time
        | world x/z -> minimap pixels -> compact event arrays
        v
lila-visualizer/data/
  match_index.json
  matches/<match>.json
        |
        | app.js fetches index once, then one match on demand
        v
Browser
  filters -> replay state -> Canvas
  paths + actor markers + events + heatmaps
```

The shipped app therefore starts without Python or Parquet support; `pipeline.py` remains the reproducible raw-data ingestion step.

## Coordinate mapping — the critical part

The game uses **x/z for the horizontal ground plane** (`y` is elevation). Each map has its own scale and world-space origin, and the output minimap is 1024×1024:

| Map | scale | origin_x | origin_z |
|---|---:|---:|---:|
| AmbroseValley | 900 | -370 | -473 |
| GrandRift | 581 | -290 | -290 |
| Lockdown | 1000 | -500 | -500 |

```text
u = (x - origin_x) / scale
v = (z - origin_z) / scale
pixel_x = u * 1024
pixel_y = (1 - v) * 1024
```

The vertical flip is required because world `z` increases upward while Canvas/image `y` increases downward. The projection is performed in `pipeline.py`, so the browser receives pixel coordinates directly. Unknown maps are skipped rather than using an incorrect transform.

## Data nuances / assumptions

- **Human vs bot:** UUID-shaped `user_id` = human; non-UUID ID = bot, following the supplied data convention.
- **Events:** Parquet event values can be bytes, so they are decoded to UTF-8 before matching event names.
- **Timestamps:** the stored integer behaves as seconds despite the source description saying milliseconds; using seconds produces realistic match dates/durations. Each match is normalized to elapsed `t` from its first observed event.
- **Match duration:** duration is the span of observed telemetry, not necessarily the true lobby duration.
- **Sessions:** the supplied files represent player sessions; the processed dataset contains 796 match IDs, but many matches have only one recorded human perspective. This is why the analysis explicitly treats PvP and retention findings with telemetry caveats.

## Major trade-offs

| Decision | Chosen | Alternative | Reason |
|---|---|---|---|
| Runtime | Preprocessed JSON | Parse Parquet in browser | Smaller/faster and browser-compatible. |
| Frontend | Vanilla JS + Canvas | React + SVG | No build step; efficient repeated redraws. |
| Backend | None | Flask/Node API | Dataset is read-only; static hosting is enough. |
| Replay format | `[p,e,t,px,py]` indexes | Repeated strings/objects | Compact payload while retaining a per-match schema. |
| Heatmaps | Client-side per match | Server/pre-rendered | Filters, actor visibility and replay time stay in sync. |

## Validation

The processed dataset contains **796 matches across 3 maps and 5 days**. The pipeline and analysis scripts were syntax-checked and the processed match index was checked against the individual match JSON files. A minimap sanity plot is included in the repository to validate the coordinate projection visually.

## Run locally

```bash
python3 -m http.server 8000 --directory lila-visualizer
# open http://localhost:8000
```

Raw-data regeneration: `python3 lila-visualizer/pipeline.py`.
Analysis reproduction: `python3 lila-visualizer/analysis.py`.
