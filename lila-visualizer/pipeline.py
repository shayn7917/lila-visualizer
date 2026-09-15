"""
LILA BLACK data pipeline
=========================
Turns raw .nakama-0 (parquet) files into clean, per-match JSON files
that the frontend can load directly.

Run from the repository root:
    python3 lila-visualizer/pipeline.py

By default raw data is expected at ./player_data and processed output is
written to ./lila-visualizer/data. Use --raw-dir / --output-dir to override.
"""

import argparse
import json
import os
import re
import uuid

import pandas as pd
import pyarrow.parquet as pq

DAY_FOLDERS = [
    "February_10", "February_11", "February_12", "February_13", "February_14"
]

MAP_CONFIG = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift": {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown": {"scale": 1000, "origin_x": -500, "origin_z": -500},
}

MINIMAP_SIZE = 1024


def is_human(user_id: str) -> bool:
    try:
        uuid.UUID(str(user_id))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def world_to_pixel(x: float, z: float, map_id: str):
    cfg = MAP_CONFIG[map_id]
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    return u * MINIMAP_SIZE, (1 - v) * MINIMAP_SIZE


def load_one_file(filepath: str, day: str):
    try:
        table = pq.read_table(filepath)
    except Exception as exc:
        print(f"  [SKIP] Could not read {filepath}: {exc}")
        return None

    df = table.to_pandas()
    if df.empty:
        return None

    df["event"] = df["event"].apply(
        lambda value: value.decode("utf-8") if isinstance(value, bytes) else str(value)
    )
    df["day"] = day
    df["is_human"] = df["user_id"].apply(is_human)
    # Source data is documented as ms but the raw stored integer is seconds.
    df["ts_seconds"] = df["ts"].astype("int64")

    pixel_xs, pixel_ys = [], []
    for row in df.itertuples(index=False):
        if row.map_id not in MAP_CONFIG:
            pixel_xs.append(None)
            pixel_ys.append(None)
            continue
        px, py = world_to_pixel(row.x, row.z, row.map_id)
        pixel_xs.append(px)
        pixel_ys.append(py)
    df["pixel_x"] = pixel_xs
    df["pixel_y"] = pixel_ys
    return df


def parse_args():
    parser = argparse.ArgumentParser(description="Build LILA BLACK processed replay data")
    parser.add_argument("--raw-dir", default="player_data", help="Raw player_data directory")
    parser.add_argument(
        "--output-dir",
        default=os.path.join("lila-visualizer", "data"),
        help="Output directory containing match_index.json and matches/",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    all_rows = []
    file_count = 0
    skipped = 0

    for day in DAY_FOLDERS:
        folder = os.path.join(args.raw_dir, day)
        if not os.path.isdir(folder):
            print(f"[WARN] Missing folder: {folder}")
            continue

        files = sorted(f for f in os.listdir(folder) if f.endswith(".nakama-0"))
        print(f"{day}: {len(files)} files")
        for fname in files:
            df = load_one_file(os.path.join(folder, fname), day)
            file_count += 1
            if df is None:
                skipped += 1
            else:
                all_rows.append(df)

    if not all_rows:
        raise SystemExit("No readable .nakama-0 files found. Check --raw-dir.")

    combined = pd.concat(all_rows, ignore_index=True)
    print(f"\nRead {file_count} files ({skipped} skipped/unreadable)")
    print(f"Total rows: {len(combined):,}")
    print(f"Unique matches: {combined['match_id'].nunique()}")

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
        .sort_values(["day", "map_id", "match_id"])
    )
    match_index.to_json(os.path.join(args.output_dir, "match_index.json"), orient="records")

    match_dir = os.path.join(args.output_dir, "matches")
    os.makedirs(match_dir, exist_ok=True)

    for match_id, group in combined.groupby("match_id"):
        group = group.sort_values("ts_seconds").copy()
        match_start = group["ts_seconds"].min()
        group["t"] = group["ts_seconds"] - match_start

        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", str(match_id))
        players = []
        player_idx = {}
        for uid, sub in group.groupby("user_id", sort=False):
            player_idx[uid] = len(players)
            players.append({"id": uid, "h": bool(sub["is_human"].iloc[0])})

        event_names = list(group["event"].unique())
        event_idx = {name: i for i, name in enumerate(event_names)}
        rows = []
        for row in group.itertuples(index=False):
            if row.pixel_x is None or row.pixel_y is None:
                continue
            rows.append([
                player_idx[row.user_id],
                event_idx[row.event],
                int(row.t),
                round(float(row.pixel_x), 1),
                round(float(row.pixel_y), 1),
            ])

        payload = {
            "match_id": str(match_id),
            "map_id": group["map_id"].iloc[0],
            "day": group["day"].iloc[0],
            "duration_sec": int(group["t"].max()),
            "players": players,
            "event_names": event_names,
            "schema": ["p", "e", "t", "px", "py"],
            "events": rows,
        }
        with open(os.path.join(match_dir, f"{safe_name}.json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"))

    print(f"Saved {len(match_index)} matches to {args.output_dir}/")


if __name__ == "__main__":
    main()
