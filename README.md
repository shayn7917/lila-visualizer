# LILA BLACK — Player Journey Visualizer

An interactive replay tool for LILA BLACK session telemetry. Pick a map, date, and match, then scrub through the match to see player movement, loot, kills, and deaths over the in-game minimap.

**Live demo:** https://lila-visualizer-gamma.vercel.app

## Features

- **Match browser** — filter 796 processed matches by map and date
- **Timeline scrubbing** — jump to any point in a match or play a 10× replay
- **Path rendering** — humans in red, bots in cyan, drawn progressively with time
- **Event markers** — kills, deaths, loot pickups, and storm deaths
- **Heatmaps** — death zones, kill zones, and movement traffic density
- **Responsive canvas** — minimap scales to the available viewport

## Feature walkthrough

1. Pick a **Map**.
2. Pick a **Date**, or leave **All dates** selected.
3. Pick a **Match**. The longest matches are listed first.
4. Scrub the **timeline** or press **Play**. Paths and events only appear once their timestamp is reached.
5. Read the paths: **red = human**, **cyan = bot**.
6. Read event markers from the legend.
7. Enable **Show heatmap** and choose Death zones, Kill zones, or Traffic density.
8. For cross-match analysis, run `python3 lila-visualizer/analysis.py` from the repository root.

## Quick start

The application uses `fetch()`, so serve it over HTTP rather than opening the HTML file directly.

From the repository root:

```bash
python3 -m http.server 8000 --directory lila-visualizer
```

Then open http://localhost:8000.

## Regenerating the data

The processed dataset is committed under `lila-visualizer/data/`. Raw data is optional unless you want to rebuild it.

Place the unzipped `player_data/` folder at the repository root, then run:

```bash
pip install pyarrow pandas
python3 lila-visualizer/pipeline.py
```

The pipeline reads the `.nakama-0` files and writes `lila-visualizer/data/match_index.json` plus `lila-visualizer/data/matches/*.json`.

You can override the paths when needed:

```bash
python3 lila-visualizer/pipeline.py --raw-dir /path/to/player_data --output-dir /path/to/output
```

## Reproducing the analysis

```bash
python3 lila-visualizer/analysis.py
```

`INSIGHTS.md` documents the findings and caveats behind the analysis.

## Deploying

The actual static site is the `lila-visualizer/` directory. Configure your static host's output/root directory to that folder.

For Vercel, from the repository root:

```bash
npx vercel --prod lila-visualizer
```

For a local production-style smoke test:

```bash
python3 -m http.server 8000 --directory lila-visualizer
```

## Project layout

```text
README.md                    project documentation
lila-visualizer/
  index.html                 markup and controls
  app.js                     data loading, canvas rendering, timeline
  style.css                  layout and responsive styling
  pipeline.py                raw Parquet -> processed JSON
  analysis.py                reproduces the figures in INSIGHTS.md
  data/                      committed processed output
  minimaps/                  minimap images
  ARCHITECTURE.md            stack, data flow, coordinate mapping, tradeoffs
  INSIGHTS.md                findings from the dataset
```

## Documentation

- [ARCHITECTURE.md](lila-visualizer/ARCHITECTURE.md) — implementation, coordinate projection, data issues, and tradeoffs
- [INSIGHTS.md](lila-visualizer/INSIGHTS.md) — findings from the telemetry dataset
