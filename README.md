# LILA BLACK — Player Journey Visualizer

Interactive replay and spatial-analysis dashboard for LILA BLACK session telemetry, built for the **LILA Games Product Engineer written test**.

The assignment asks for a browser tool that turns raw telemetry into something a Level Designer can use: correct minimap journeys, human/bot distinction, event markers, map/date/match filters, playback, and kill/death/traffic heatmaps. fileciteturn38file0L41-L54

This repository contains the source code, processed dataset, analysis, architecture document, and deployment configuration in one place, as requested by the submission instructions. fileciteturn38file0L91-L98

## What is included

- **796 processed matches** across **3 maps** and **5 days**
- Interactive minimap replay with human/bot paths
- Kill, death, loot, and storm-death markers
- Map → date → match filtering
- Playback timeline with 0.5×–20× speed
- Traffic, kill-zone, and death-zone heatmaps
- Per-match telemetry summary
- Responsive dark dashboard and fullscreen map mode
- Shareable `?match=<id>` links
- Reproducible Parquet → JSON pipeline
- `ARCHITECTURE.md` covering stack, data flow, coordinate mapping, assumptions, and trade-offs
- `INSIGHTS.md` containing three evidence-backed game findings

## Run locally

From the repository root:

```bash
python3 -m http.server 8000 --directory lila-visualizer
```

Open `http://localhost:8000`.

**Do not open `lila-visualizer/index.html` directly.** The browser uses `fetch()` to load the processed JSON, so an HTTP server is required.

## Walkthrough

1. **Choose a map** — the match browser updates to the selected map.
2. **Choose a date and match** — the dashboard loads only that match's JSON, keeping runtime memory small.
3. **Read the summary** — duration, actor counts, and event totals give immediate context.
4. **Toggle Humans / Bots / All** — compare player movement with AI movement without changing the underlying data.
5. **Toggle events** — isolate kills, deaths, loot, or storm deaths on the minimap.
6. **Use the heatmap controls** — switch between death zones, kill zones, and traffic density; the view follows the current actor/time filters.
7. **Press Play** — watch the match unfold. Drag the timeline or use `←` / `→` to seek.
8. **Use Center on Human** — quickly bring the recorded human activity into focus.
9. **Use Fullscreen** — turn the map into the primary analysis surface for a larger-screen review.

### Keyboard controls

- `Space` — play / pause
- `←` / `→` — seek 5 seconds
- `F` — fullscreen map

## Regenerate processed data

The repository includes the processed dataset under `lila-visualizer/data/`. Raw data is only required when rebuilding it.

Place the unzipped `player_data/` directory at the repository root, then run:

```bash
pip install pyarrow pandas
python3 lila-visualizer/pipeline.py
```

Default paths:

- Input: `./player_data`
- Output: `./lila-visualizer/data`

Custom paths:

```bash
python3 lila-visualizer/pipeline.py \
  --raw-dir /path/to/player_data \
  --output-dir /path/to/output
```

## Reproduce the analysis

```bash
python3 lila-visualizer/analysis.py
```

Or:

```bash
python3 lila-visualizer/analysis.py --data-dir /path/to/data
```

The resulting figures are documented in `lila-visualizer/INSIGHTS.md`.

## Deployment

The application is fully static: no backend, database, build step, or environment variables are required.

### Vercel

Import this repository into Vercel **from the repository root**. The included `vercel.json` routes the root URL to `lila-visualizer/index.html` and serves the static assets from that directory. No framework preset or build command is needed.

### Other static hosts

Publish the `lila-visualizer/` directory as the site directory. The important requirement for evaluation is a public URL where the dashboard opens without requiring the evaluator to run Python.

> **Submission requirement:** the assignment explicitly requires a working deployed URL in addition to the GitHub repository. Add the final deployment URL to this section before submitting. fileciteturn38file0L91-L98

## Project layout

```text
README.md
vercel.json
index.html                    root entrypoint
lila-visualizer/
  index.html                   dashboard markup
  app.js                       data loading, replay, Canvas rendering
  style.css                    responsive dashboard styling
  data/
    match_index.json           match browser index
    matches/*.json             compact per-match replay data
  minimaps/                    minimap image assets
  pipeline.py                 raw Parquet -> processed JSON
  analysis.py                 reproduces telemetry findings
  ARCHITECTURE.md             one-page technical design
  INSIGHTS.md                 three evidence-backed findings
```

## Data model

Committed replay files use the compact wire format `[p, e, t, px, py]`:

- `p` = player-table index
- `e` = event-name index
- `t` = elapsed match time in seconds
- `px`, `py` = minimap pixel coordinates

The pipeline normalizes time per match and projects game-world `x/z` coordinates into 1024×1024 minimap space before the browser receives the data.

## Assignment coverage

| Requirement | Implementation |
|---|---|
| Load/parse Parquet | `pipeline.py` using pyarrow/pandas |
| Correct minimap journeys | Per-map world → pixel transforms |
| Human vs bot | UUID-based player classification |
| Kills/deaths/loot/storm | Distinct event markers + filters |
| Map/date/match filters | Dashboard selectors |
| Timeline/playback | Canvas replay + seek + speed |
| Kill/death/traffic heatmaps | Client-side filtered overlays |
| Hosted/shareable tool | Static deployment configuration; final public URL must be added before submission |
| Architecture document | `lila-visualizer/ARCHITECTURE.md` |
| Three insights | `lila-visualizer/INSIGHTS.md` |

The assignment's own checklist calls out these same product behaviors plus the architecture coordinate-mapping explanation and three supported insights. fileciteturn38file0L119-L130

## Documentation

- [Architecture](lila-visualizer/ARCHITECTURE.md)
- [Insights](lila-visualizer/INSIGHTS.md)
