# LILA BLACK — Player Journey Visualizer

Interactive replay and spatial-analysis dashboard for LILA BLACK session telemetry.

The app lets you browse **796 processed matches across 3 maps and 5 days**, replay player movement on the in-game minimap, inspect combat/loot/death events, and explore per-match spatial heatmaps.

## Run it

From the repository root:

```bash
python3 -m http.server 8000 --directory lila-visualizer
```

Open <http://localhost:8000>.

Do not open the HTML file directly: the app loads JSON with `fetch()`, so it needs an HTTP server.

## Dashboard features

- **Map / date / match browser** with match durations and actor counts
- **Interactive replay timeline** with pause, keyboard seeking, and 0.5×–20× playback speed
- **Human vs bot visibility filter**
- **Human and bot path rendering** with current-position markers
- **Kill, death, loot, and storm event toggles**
- **Death, kill, and traffic heatmaps** that respect the current replay timestamp and actor filter
- **Per-match telemetry summary** with actors, event totals, duration, and metadata
- **Responsive layout** for desktop and smaller screens
- **Fullscreen map mode**
- **Shareable match links** using the `?match=<id>` URL parameter
- **Center-on-human** replay helper

### Keyboard controls

- `Space` — play / pause
- `←` / `→` — seek 5 seconds
- `F` — fullscreen map

## Regenerate processed data

The repository includes the processed dataset under `lila-visualizer/data/`. Raw data is only required when you want to rebuild it.

Put the unzipped `player_data/` directory at the repository root, then run:

```bash
pip install pyarrow pandas
python3 lila-visualizer/pipeline.py
```

By default the pipeline reads `./player_data` and writes to `./lila-visualizer/data`.

Custom paths are supported:

```bash
python3 lila-visualizer/pipeline.py \
  --raw-dir /path/to/player_data \
  --output-dir /path/to/output
```

## Reproduce the analysis

```bash
python3 lila-visualizer/analysis.py
```

Or specify another processed-data directory:

```bash
python3 lila-visualizer/analysis.py --data-dir /path/to/data
```

`lila-visualizer/INSIGHTS.md` contains the findings, caveats, and recommended actions.

## Deploy

The web application is the `lila-visualizer/` directory and is completely static—there is no build step, backend, database, or environment-variable requirement.

For Vercel, configure the project root/output as `lila-visualizer`.

For a simple static host, publish `lila-visualizer/` as the site directory.

## Project layout

```text
README.md
lila-visualizer/
  index.html                 dashboard markup
  app.js                     data loading, replay, Canvas rendering
  style.css                  responsive dashboard styling
  data/
    match_index.json         match browser index
    matches/*.json           compact per-match replay data
  minimaps/                  minimap image assets
  pipeline.py                raw Parquet -> processed JSON
  analysis.py                reproduces telemetry findings
  ARCHITECTURE.md            technical design and data assumptions
  INSIGHTS.md                analysis findings and caveats
```

## Data model

The committed replay files use the compact wire format `[p, e, t, px, py]`, where `p` is a player-table index, `e` is an event-name index, `t` is elapsed match time in seconds, and `px` / `py` are minimap pixel coordinates.

The pipeline normalizes timestamps to each match's own start time and projects world `x/z` coordinates into 1024×1024 minimap space.

## Documentation

- [Architecture](lila-visualizer/ARCHITECTURE.md)
- [Insights](lila-visualizer/INSIGHTS.md)
