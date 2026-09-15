"""
Reproduces every figure quoted in INSIGHTS.md.

Usage:
    python3 analysis.py            # expects ./data/ next to this file

Reads the processed output of pipeline.py (data/match_index.json and
data/matches/*.json) rather than the raw .nakama-0 files, so it runs in
a couple of seconds.
"""

import json
import os
import statistics
from collections import Counter, defaultdict

DATA_DIR = "data"
MATCH_DIR = os.path.join(DATA_DIR, "matches")

DEATH_EVENTS = {"Killed", "BotKilled", "KilledByStorm"}
KILL_EVENTS = {"Kill", "BotKill"}
DAY_ORDER = [
    "February_10", "February_11", "February_12", "February_13", "February_14"
]
GRID = 8
MINIMAP_SIZE = 1024


def load_matches():
    """Yield each processed match, rehydrating the compact event rows."""
    for fname in sorted(os.listdir(MATCH_DIR)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(MATCH_DIR, fname)) as f:
            yield json.load(f)


def header(text):
    print("\n" + "=" * 60)
    print(text)
    print("=" * 60)


def main():
    matches = list(load_matches())
    index = json.load(open(os.path.join(DATA_DIR, "match_index.json")))

    # ---------------------------------------------------------------
    # Finding 1: population & PvP
    # ---------------------------------------------------------------
    header("FINDING 1 — Population and PvP")

    humans_per_match = Counter(m["n_humans"] for m in index)
    print(f"Total matches: {len(index)}")
    for k in sorted(humans_per_match):
        print(f"  matches with {k} human(s): {humans_per_match[k]}")

    event_totals = Counter()
    for m in matches:
        names = m["event_names"]
        for _, e, _, _, _ in m["events"]:
            event_totals[names[e]] += 1

    print("\nEvent totals across dataset:")
    for name, count in event_totals.most_common():
        print(f"  {name:<16} {count:>7,}")

    pvp = event_totals.get("Kill", 0)
    by_bot = event_totals.get("BotKilled", 0)
    if pvp:
        print(f"\nHuman killed by bot vs by player: {by_bot} / {pvp} = {by_bot/pvp:.0f}x")

    # ---------------------------------------------------------------
    # Finding 2: spatial concentration
    # ---------------------------------------------------------------
    header("FINDING 2 — Map space utilisation")

    traffic = defaultdict(Counter)
    loot_cells = defaultdict(Counter)
    kill_cells = defaultdict(Counter)

    for m in matches:
        names = m["event_names"]
        humans = {i for i, p in enumerate(m["players"]) if p["h"]}
        for p, e, _, px, py in m["events"]:
            if p not in humans:
                continue
            if not (0 <= px < MINIMAP_SIZE and 0 <= py < MINIMAP_SIZE):
                continue
            cell = (int(px / MINIMAP_SIZE * GRID), int(py / MINIMAP_SIZE * GRID))
            ev = names[e]
            if ev == "Position":
                traffic[m["map_id"]][cell] += 1
            elif ev == "Loot":
                loot_cells[m["map_id"]][cell] += 1
            elif ev in KILL_EVENTS:
                kill_cells[m["map_id"]][cell] += 1

    total_cells = GRID * GRID
    for map_id in sorted(traffic):
        counts = traffic[map_id]
        total = sum(counts.values())
        ranked = counts.most_common()
        print(f"\n{map_id}")
        print(f"  cells with any human traffic: {len(counts)}/{total_cells} "
              f"({100*len(counts)/total_cells:.0f}%)")
        for n in (4, 8, 16):
            share = sum(v for _, v in ranked[:n])
            print(f"  top {n:>2} cells ({100*n/total_cells:>2.0f}% of grid): "
                  f"{100*share/total:.1f}% of traffic")
        print(f"  hottest traffic cells: {ranked[:4]}")
        print(f"  hottest loot cells:    {loot_cells[map_id].most_common(4)}")
        print(f"  hottest kill cells:    {kill_cells[map_id].most_common(4)}")

    # ---------------------------------------------------------------
    # Finding 3: retention and session quality
    # ---------------------------------------------------------------
    header("FINDING 3 — Retention and session quality")

    player_days = defaultdict(set)
    player_match_count = Counter()
    for m in matches:
        for p in m["players"]:
            if p["h"]:
                player_days[p["id"]].add(m["day"])
                player_match_count[p["id"]] += 1

    print(f"Unique human players: {len(player_days)}")

    days_active = Counter(len(v) for v in player_days.values())
    print("\nPlayers by number of distinct days active:")
    for k in sorted(days_active):
        print(f"  {k} day(s): {days_active[k]} "
              f"({100*days_active[k]/len(player_days):.1f}%)")

    dau = Counter()
    for days in player_days.values():
        for d in days:
            dau[d] += 1
    print("\nDaily active humans:")
    for d in DAY_ORDER:
        print(f"  {d}: {dau[d]}")

    cohort = {p for p, ds in player_days.items() if DAY_ORDER[0] in ds}
    print(f"\nFeb 10 cohort: {len(cohort)} players")
    for d in DAY_ORDER[1:]:
        retained = sum(1 for p in cohort if d in player_days[p])
        print(f"  returned on {d}: {retained} ({100*retained/len(cohort):.1f}%)")

    print(f"\nPlayers who played exactly one match ever: "
          f"{sum(1 for v in player_match_count.values() if v == 1)}")

    # session quality
    survival, loot_counts, kill_counts = [], [], []
    deaths_by_type = Counter()

    for m in matches:
        names = m["event_names"]
        humans = {i for i, p in enumerate(m["players"]) if p["h"]}
        if not humans:
            continue
        last_t, loot, kills = 0, 0, 0
        for p, e, t, _, _ in m["events"]:
            if p not in humans:
                continue
            last_t = max(last_t, t)
            ev = names[e]
            if ev == "Loot":
                loot += 1
            elif ev in KILL_EVENTS:
                kills += 1
            elif ev in DEATH_EVENTS:
                deaths_by_type[ev] += 1
        survival.append(last_t)
        loot_counts.append(loot)
        kill_counts.append(kills)

    survival.sort()
    n = len(survival)
    print(f"\nHuman sessions analysed: {n}")
    print(f"  median session: {statistics.median(survival):.0f}s  "
          f"mean: {statistics.mean(survival):.0f}s")
    print(f"  p10: {survival[n//10]}s  p25: {survival[n//4]}s  "
          f"p75: {survival[3*n//4]}s  max: {survival[-1]}s")
    for threshold in (30, 60):
        short = sum(1 for s in survival if s < threshold)
        print(f"  sessions under {threshold}s: {short} ({100*short/n:.1f}%)")

    print(f"\n  median loot per match: {statistics.median(loot_counts):.0f}")
    print(f"  median kills per match: {statistics.median(kill_counts):.0f}")
    print(f"  matches with zero loot: {sum(1 for x in loot_counts if x == 0)}")
    print(f"  matches with zero kills: {sum(1 for x in kill_counts if x == 0)}")

    total_deaths = sum(deaths_by_type.values())
    print(f"\n  human deaths by cause: {dict(deaths_by_type)}")
    print(f"  total human deaths: {total_deaths}")
    print(f"  matches ending without a human death (extracted/survived): "
          f"{n - total_deaths} ({100*(n-total_deaths)/n:.0f}%)")


if __name__ == "__main__":
    main()
