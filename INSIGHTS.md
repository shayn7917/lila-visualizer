# Insights

Three findings from the 1,243 session files (89,104 events, 796 matches, 245 unique human players, Feb 10–14). Every number below is reproducible by running `python3 analysis.py` against the processed dataset.

---

## Insight 1: The extraction shooter is, in practice, a single-player PvE game

**What caught my eye**
The mode is designed around player-vs-player extraction tension, but in the telemetry that tension barely exists — almost all combat is against bots, not other players.

**The evidence**
| Measure | Value |
|---|---|
| Matches with exactly 1 human | 779 / 796 (97.9%) |
| Human-vs-human kills (`Kill`) across the whole dataset | **3** |
| Humans killed by bots (`BotKilled`) | 403 |
| Bots killed by humans (`BotKill`) | 2,415 |

A human is **134× more likely to be killed by a bot than by another player** (403 vs 3). Of 445 total human deaths, PvP accounts for 0.7%.

**Actionable items and affected metrics**
- **Metric affected: PvP encounter rate / player density per match.** If low population is a matchmaking issue, the actionable fix is lowering lobby-fill thresholds or cross-server pooling to guarantee more concurrent humans per match.
- **Metric affected: session telemetry completeness.** If opponents are present but not logged, the fix is a telemetry/instrumentation audit, not a game-design change — this needs to be ruled out before touching matchmaking.
- **Metric affected: bot AI tuning priority.** Since bots currently carry the entire threat budget, bot difficulty/behavior tuning has outsized impact on player experience right now and should be prioritized accordingly until PvP density improves.

**Why a Level Designer should care**
Every spatial design decision that assumes player density — extraction-point camping, contested loot rooms, chokepoints meant to force PvP — is currently being tested against bots only. Map areas designed for player-vs-player tension may be reading as "working" in playtests when they're really just working against bots. This changes what "this POI is too hot" or "this route is too safe" actually means until the population question is resolved.

---

## Insight 2: Roughly 80% of play happens in 25% of the map

**What caught my eye**
Player movement is heavily concentrated in a small, contiguous portion of each map, with large sections almost never visited.

**The evidence**
Dividing each minimap into an 8×8 grid and counting human `Position` pings per cell:

| Map | Cells with any traffic | Top 25% of cells hold | Cells never visited |
|---|---|---|---|
| AmbroseValley | 39 / 64 (61%) | 80.5% of traffic | 25 |
| Lockdown | 29 / 64 (45%) | 89.0% of traffic | 35 |
| GrandRift | 36 / 64 (56%) | 78.5% of traffic | 28 |

On all three maps, the **top 4 cells alone (6% of map area) absorb 31–35% of all movement**. On AmbroseValley the hottest cells form a contiguous block through the map's center, and they are simultaneously the top loot cells and the top kill cells — traffic, reward, and combat are all stacked in the same place.

**Actionable items and affected metrics**
- **Metric affected: loot pickup rate in outer map regions.** Redistribute a portion of loot spawns from the hot central cluster toward the underused outer thirds to pull traffic outward and test whether pickup rate there increases.
- **Metric affected: average match travel distance / map usage %.** Add a secondary objective or POI in the least-visited quadrant per map and measure whether "cells with any traffic" rises in the next data pull.
- **Metric affected: art/streaming budget efficiency.** For any region that stays cold after the above changes, that's a candidate to deprioritize in future art passes — it's shipped, textured, and lit, but not earning its cost in playtime.

**Why a Level Designer should care**
This is the most directly actionable finding for a designer: it identifies exactly which grid cells on which maps are underused, not just "the map feels big." It's a concrete before/after target — rerun `analysis.py` after any change and compare the utilization table.

**Caveat:** some zero-traffic cells are unplayable border/water space (visible on the Lockdown minimap), so the raw percentages understate true utilization of playable area. The concentration ratio (top-N cells vs total) is the more reliable number, not the raw "45% used."

---

## Insight 3: A severe day-one retention cliff — that isn't caused by bad first sessions

**What caught my eye**
Players churn hard after one session, but their first session isn't a bad one — they survive, loot, and fight normally. Something is failing to bring them back, not driving them away mid-match.

**The evidence**
Of 245 unique human players:

| Days played | Players |
|---|---|
| 1 day only | **206 (84.1%)** |
| 2+ days | 39 (15.9%) |

Feb 10 cohort (98 players) return rate: 15.3% on day 2, 12.2% on day 3, 4.1% on day 4, 2.0% on day 5. Daily active humans fall 98 → 80 → 59 → 47 → 12 across the five days.

Session quality, however, looks healthy:
- Median human session: **369 seconds (~6 minutes)**; only 1.3% of sessions end under 60 seconds
- Median loot pickups per match: **14**; only 7% of matches end with zero loot
- Median bot kills per match: **2**
- **43% of matches end with the human surviving** (no recorded death)

**Actionable items and affected metrics**
- **Metric affected: Day-2 retention rate (currently 15.3%).** Since exits aren't driven by difficulty, the fix isn't easing early combat — it's adding a reason to return: daily login rewards, a persistent progression track, or session-end summaries that tease "what's next."
- **Metric affected: one-and-done player rate (currently 43%, 106/245).** A short post-match hook (unlockable cosmetic, next-tier loot preview) targeted specifically at first-time players could be A/B tested against this cohort.
- **Metric affected: session-to-session variety.** If every 6-minute session feels interchangeable, introducing map/objective rotation or escalating stakes across a player's sessions is the next thing to test.

**Why a Level Designer should care**
This rules out the easy, wrong fix. A designer's instinct on seeing bad retention is often "the mode is too hard" — nerf early threats, ease onboarding. The data says that's not the problem: sessions are going fine by every measure available (survival, loot, kills). Spending design effort on making first matches easier would not move this metric; the lever is elsewhere (meta-progression, reasons to return), and that's a different team's fix as much as a level designer's.

**Caveat:** 5 days is a short observation window. If this is internal playtest data rather than live players, "retention" may partly reflect playtest scheduling rather than genuine player churn — worth confirming the data's source before acting on it at scale.

---

## Notes on confidence

- Insights 1 and 3 rest on large, unambiguous counts; the uncertainty is in *interpretation* (population vs. telemetry gap; playtest vs. live data), and I've flagged the competing explanations rather than picking one.
- Insight 2's grid resolution (8×8) was chosen to be coarse enough to be robust to any residual coordinate-mapping error. The concentration pattern holds at 6×6 and 12×12 as well.
- GrandRift has only 59 matches and 30 human deaths, so its per-cell numbers are the weakest of the three maps and any GrandRift-specific action should be treated as lower-confidence.
