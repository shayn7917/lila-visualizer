"""
LILA BLACK data pipeline
=========================
Turns 1,243 raw .nakama-0 (parquet) files into clean, per-match JSON files
that a frontend can load directly.

Run: python3 pipeline.py
"""

import os
import re
import json
import uuid
import pyarrow.parquet as pq
import pandas as pd

# ---------------------------------------------------------------
# 1. CONFIG — values copied straight from the README
# ---------------------------------------------------------------

RAW_DATA_DIR = "player_data"
OUTPUT_DIR = "processed"

DAY_FOLDERS = [
    "February_10", "February_11", "February_12", "February_13", "February_14"
]

# map_id -> (scale, origin_x, origin_z)
MAP_CONFIG = {
    "AmbroseValley": {"scale": 900,  "origin_x": -370, "origin_z": -473},
    "GrandRift":     {"scale": 581,  "origin_x": -290, "origin_z": -290},
    "Lockdown":      {"scale": 1000, "origin_x": -500, "origin_z": -500},
}

MINIMAP_SIZE = 1024  # pixels, all minimaps are 1024x1024


# ---------------------------------------------------------------
# 2. HELPERS
# ---------------------------------------------------------------

def is_human(user_id: str) -> bool:
    """UUID = human, plain number = bot. We check for UUID shape."""
    try:
        uuid.UUID(user_id)
        return True
    except (ValueError, AttributeError):
        return False


def world_to_pixel(x: float, z: float, map_id: str):
    """Apply the README's world -> minimap pixel formula."""
    cfg = MAP_CONFIG[map_id]
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    pixel_x = u * MINIMAP_SIZE
    pixel_y = (1 - v) * MINIMAP_SIZE
    return pixel_x, pixel_y


def load_one_file(filepath: str, day: str):
    """Read a single .nakama-0 file and return a clean DataFrame, or None if unreadable."""
    try:
        table = pq.read_table(filepath)
    except Exception as e:
        print(f"  [SKIP] Could not read {filepath}: {e}")
        return None

    df = table.to_pandas()
    if df.empty:
        return None

    # decode event column: b'Position' -> 'Position'
    df["event"] = df["event"].apply(
        lambda v: v.decode("utf-8") if isinstance(v, bytes) else v
    )

    df["day"] = day
    df["is_human"] = df["user_id"].apply(is_human)

    # --- TIMESTAMP FIX ---
    # The README labels `ts` as milliseconds, but pyarrow decodes it into a
    # datetime64[ms] column meaning it treats the raw integer AS milliseconds
    # since epoch. Converting that raw integer back to a date lands in 1970 —
    # clearly wrong. Testing the same raw integer as SECONDS since epoch lands
    # on the correct real-world date (matches the day folder, e.g. Feb 10 2026).
    # So the true unit of the raw stored integer is SECONDS, not ms.
    # We recover the raw integer and treat it as seconds elapsed.
    df["ts_seconds"] = df["ts"].astype("int64")  # this is the raw stored integer

    # apply coordinate mapping row-by-row (vectorized per map group, faster)
    pixel_xs, pixel_ys = [], []
    for _, row in df.iterrows():
        map_id = row["map_id"]
        if map_id not in MAP_CONFIG:
            pixel_xs.append(None)
            pixel_ys.append(None)
            continue
        px, py = world_to_pixel(row["x"], row["z"], map_id)
        pixel_xs.append(px)
        pixel_ys.append(py)
    df["pixel_x"] = pixel_xs
    df["pixel_y"] = pixel_ys

    return df


# ---------------------------------------------------------------
# 3. MAIN PIPELINE
# ---------------------------------------------------------------

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_rows = []
    file_count = 0
    skipped = 0

    for day in DAY_FOLDERS:
        folder = os.path.join(RAW_DATA_DIR, day)
        if not os.path.isdir(folder):
            print(f"[WARN] Missing folder: {folder}")
            continue

        files = [f for f in os.listdir(folder) if f.endswith(".nakama-0")]
        print(f"{day}: {len(files)} files")

        for fname in files:
            filepath = os.path.join(folder, fname)
            df = load_one_file(filepath, day)
            file_count += 1
            if df is None:
                skipped += 1
                continue
            all_rows.append(df)

    print(f"\nRead {file_count} files ({skipped} skipped/unreadable)")

    combined = pd.concat(all_rows, ignore_index=True)
    print(f"Total rows: {len(combined):,}")
    print(f"Unique matches: {combined['match_id'].nunique()}")
    print(f"Unique players/bots: {combined['user_id'].nunique()}")
    print(f"Human rows: {combined['is_human'].sum():,}  |  Bot rows: {(~combined['is_human']).sum():,}")
    print(f"Event breakdown:\n{combined['event'].value_counts()}")

    # -----------------------------------------------------------
    # 4. Save a match index (lightweight, for the "pick a match" UI)
    # -----------------------------------------------------------
    match_index = (
        combined.groupby("match_id")
        .agg(
            map_id=("map_id", "first"),
            day=("day", "first"),
            n_players=("user_id", "nunique"),
            n_humans=("user_id", lambda s: s[combined.loc[s.index, "is_human"]].nunique()),
            duration_sec=("ts_seconds", lambda s: int(s.max() - s.min())),
        )
        .reset_index()
    )
    match_index.to_json(os.path.join(OUTPUT_DIR, "match_index.json"), orient="records")
    print(f"\nSaved match_index.json ({len(match_index)} matches)")

    # -----------------------------------------------------------
    # 5. Save one JSON file per match (the actual replay data)
    # -----------------------------------------------------------
    match_dir = os.path.join(OUTPUT_DIR, "matches")
    os.makedirs(match_dir, exist_ok=True)

    # COMPACT FORMAT
    # The naive format (full UUID + 10-decimal floats + unused x/y/z on every
    # row) produced ~20MB of JSON. Since this is a static-hosted app, payload
    # size directly affects load time. We compact by:
    #   - dropping x/y/z (the frontend only needs pixel coords)
    #   - rounding pixel coords to 1 decimal (sub-pixel precision is invisible)
    #   - interning user_ids into a per-match lookup table (p0, p1, ...)
    #   - interning event names into a lookup table
    #   - emitting events as positional arrays instead of key/value objects
    # The frontend rehydrates this into objects on load.

    for match_id, group in combined.groupby("match_id"):
        group = group.sort_values("ts_seconds").copy()
        # t = seconds elapsed since the start of THIS match (0-based), for playback
        match_start = group["ts_seconds"].min()
        group["t"] = group["ts_seconds"] - match_start

        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", match_id)
        out_path = os.path.join(match_dir, f"{safe_name}.json")

        # build per-match player table
        players = []
        player_idx = {}
        for uid, sub in group.groupby("user_id", sort=False):
            player_idx[uid] = len(players)
            players.append({"id": uid, "h": bool(sub["is_human"].iloc[0])})

        # build per-match event-name table
        event_names = list(group["event"].unique())
        event_idx = {name: i for i, name in enumerate(event_names)}

        # events as [player_index, event_index, t, pixel_x, pixel_y]
        rows = []
        for r in group.itertuples(index=False):
            if r.pixel_x is None or r.pixel_y is None:
                continue
            rows.append([
                player_idx[r.user_id],
                event_idx[r.event],
                int(r.t),
                round(float(r.pixel_x), 1),
                round(float(r.pixel_y), 1),
            ])

        payload = {
            "match_id": match_id,
            "map_id": group["map_id"].iloc[0],
            "day": group["day"].iloc[0],
            "duration_sec": int(group["t"].max()),
            "players": players,
            "event_names": event_names,
            "schema": ["p", "e", "t", "px", "py"],
            "events": rows,
        }
        with open(out_path, "w") as f:
            json.dump(payload, f, separators=(",", ":"))

    print(f"Saved {combined['match_id'].nunique()} per-match JSON files to {match_dir}/")


if __name__ == "__main__":
    main()
