# Architecture

## Stack

**Offline:** Python 3 + pyarrow + pandas (`pipeline.py`, `analysis.py`)
**Runtime:** static HTML + vanilla JS + Canvas 2D. No framework, no build step, no backend.

The dataset is fixed and read-only — 1,243 files that will never change at runtime. Anything a server would do here (parse, join, transform) can be done once, ahead of time, and shipped as static JSON. That removes the server, the database, the API layer, cold starts, and hosting cost from the project entirely, and makes the deploy a folder upload.

Canvas over SVG/DOM because a single match renders up to ~1,000 path segments plus event markers, redrawn on every timeline tick. That's fine for immediate-mode Canvas and would mean thousands of DOM nodes churning in SVG.

## Data flow

```
player_data/*/*.nakama-0   (1,243 Parquet files, 89,104 rows)
        |
        |  pipeline.py  — read, decode, tag, project, compact
        v
data/match_index.json      (796 matches: map, day, player counts, duration)
data/matches/<id>.json     (one file per match, compact event rows)
        |
        |  fetch() on demand, one match at a time
        v
app.js  — rehydrate -> draw minimap -> overlay paths/events -> timeline
```

The index is loaded once on page load to populate filters. Match files are fetched only when selected, so the browser never holds more than one match in memory.

## Coordinate mapping

Game world coordinates are projected onto the 1024-space minimap using the per-map `scale` and `origin` from the data README:

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale
pixel_x = u * 1024
pixel_y = (1 - v) * 1024
```

Two details that matter:

- **The ground plane is `x`/`z`, not `x`/`y`.** `y` is elevation and is discarded for a top-down view.
- **The `v` axis is flipped.** World `z` increases northward; canvas `y` increases downward. Hence `(1 - v)`.

This is computed once in `pipeline.py`, not in the browser — the shipped JSON already contains pixel coordinates.

**Validation:** rather than trust the formula, I plotted a full match over the AmbroseValley minimap and checked that paths follow roads, enter buildings, and stay inside the playable boundary. A wrong axis or sign would have produced paths across open water or mirrored off-map. (`sanity_check_plot.png`.)

The minimap source images are not 1024px (4320², 9000², 2160×2158). They're square, so scaling them into a 1024 canvas is uniform and the projection holds. GrandRift is 2px off square — a sub-pixel error, ignored.

## Two data issues found and handled

**1. `event` is stored as bytes, not strings.** Values arrive as `b'Position'`. Decoded to UTF-8 during load; comparing against `"Position"` without decoding silently matches nothing.

**2. The `ts` column's unit is mislabelled.** The README documents `ts` as milliseconds, and the Parquet schema types it `datetime64[ms]`, so pyarrow reads the raw integer as ms-since-epoch — which decodes to January 1970 and makes every match appear to last under one second. Treating the same integer as **seconds** since epoch yields 2026-02-10, matching the `February_10` folder it came from. The raw integer is therefore in seconds, and is used as such.

This mattered: the first pass silently produced a "maximum match duration" of 890 **milliseconds**. The bug was only visible because the number was implausible against the README's "matches last several minutes." Timestamps are now normalised to seconds elapsed since each match's own start (`t`), which is what the playback timeline needs anyway.

## Wire format

The naive per-match JSON (full UUID, event name, and 10-decimal `x/y/z/pixel_x/pixel_y` on every row) came to 20 MB. Compacted to 3.8 MB — an 81% reduction — by:

- dropping `x`, `y`, `z` (the client only needs pixel coordinates)
- rounding pixel coordinates to 1 decimal (sub-pixel precision is invisible at 700px display size)
- interning `user_id` and event names into per-match lookup tables
- emitting each event as a positional array `[player, event, t, px, py]` instead of a keyed object

`app.js` rehydrates this into plain objects on load. The tradeoff is that the on-disk format is no longer self-describing, so each file carries a `schema` field and the rehydration lives in one place.

## Assumptions

- **Human vs bot** is determined by whether `user_id` parses as a UUID; plain integers are bots. This follows the README and holds across all 1,243 files.
- **Match duration** is the span of observed events, not true match length. A player who disconnects early shortens the recorded match.
- **Each file is one player's session.** 743 of 796 matches contain a single actor, so most "matches" are one perspective rather than a full lobby reconstruction.
- **Short matches are kept, not filtered.** The shortest is 13s. They're real sessions and dropping them would bias session-length statistics, which finding #3 depends on.
- **Out-of-bounds points are kept** but excluded from grid analysis. None were observed on inspection.

## Major tradeoffs

| Decision | Considered | Chose | Why |
|---|---|---|---|
| Backend | A small API server (Node/Flask) serving matches on demand | No backend — precompute static JSON | Dataset is fixed and read-only; nothing to compute at request time. Removes hosting cost, cold starts, and an entire layer of things to deploy. |
| Frontend framework | React | Plain HTML/JS/Canvas | Single view, four controls — a framework's benefit (component reuse, state management) doesn't pay for its setup cost at this scope. Also removes the build step, so `git clone` + a static server is the entire dev environment. |
| Rendering surface | SVG/DOM | Canvas 2D | A 15-player match redraws ~1,000 path segments per timeline tick. SVG would mean thousands of live DOM nodes; Canvas repaints in one pass. |
| Cross-match views | Aggregate heatmap across all matches on a map, in the UI | Per-match only in the UI; aggregates via `analysis.py` | Keeps the client simple and memory flat (one match loaded at a time). Aggregate questions are answered by a script instead — the tradeoff is no live aggregate view in the browser today. |
| Data payload | Ship raw parsed fields (full UUIDs, 10-decimal floats, unused x/y/z) | Compact positional-array format with lookup tables | Cut payload from 20MB to 3.8MB (81%). Cost: the wire format isn't self-describing, so rehydration logic lives in one place in `app.js` and must stay in sync with `pipeline.py`. |
| Minimap assets | Ship source images (up to 9000×9000, ~24MB total) | Downscale to 2048×2048 JPEG (~1.1MB total) | Displayed at 700px, so source resolution was pure waste. 95% size reduction, no visible quality loss. |

## Notes on the biggest tradeoff

**No live cross-match aggregation** is the one a Level Designer will hit first: the in-app heatmaps (deaths, kills, traffic) are scoped to whichever single match is selected, not "all matches on this map." Getting a map-wide answer today means running `analysis.py`, which prints exactly that breakdown per map. Precomputing an all-matches heatmap layer at build time (one static overlay image per map, generated alongside the JSON) is the first thing I'd add with more time — it's a data-pipeline change, not a redesign.

## Running it

```bash
# regenerate processed data from the raw dataset
python3 pipeline.py          # expects player_data/ alongside it

# reproduce every figure in INSIGHTS.md
python3 analysis.py

# serve the app (file:// will not work — fetch() requires http)
python3 -m http.server 8000
```

## Known limitations

- No aggregate cross-match view in the UI.
- The heatmap is per-match, so it's sparse on matches with few deaths.
- No per-player isolation — all actors in a match draw at once, which is busy on 15-player matches.
- The three maps carry very different sample sizes (AmbroseValley 566 matches, GrandRift 59), so GrandRift's spatial statistics are the least reliable.

## Asset optimisation

Source minimaps totalled ~24 MB (4320², 2160², and a 9000² image). They're downscaled once to 2048² JPEG at quality 85, giving ~1.1 MB total — a 95% reduction — with no visible loss at the 700px display size. 2048 leaves headroom for zooming later.
