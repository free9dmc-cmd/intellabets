#!/usr/bin/env python3
"""Grade settled bets and report profit, ROI, win rate and closing line value.

Usage:
    python grade_bets.py bets.csv
    python grade_bets.py bets.json --format json

Deliberate choices, because each is a way this calculation is commonly wrong:

  * ROI is computed over SETTLED stake only. Pending bets are money still in
    play, not a denominator.
  * Pushes and voids return the stake and count in neither column of the win
    rate. Counting them as losses understates it; as wins, it is false.
  * Profit on a win is stake * (odds - 1), not stake * odds. The stake was
    already yours.
  * CLV is skipped for any bet whose closing price is not present. A missing
    closing line produces no CLV rather than a zero that drags the average.
"""

import argparse
import csv
import json
import sys
from collections import defaultdict

SETTLED = {"won", "lost", "push", "void"}
COUNTED_IN_WIN_RATE = {"won", "lost"}


def load(path):
    """Read bet records from CSV or JSON. JSON may be a list or {"bets": [...]}."""
    if path.lower().endswith(".json"):
        with open(path) as fh:
            data = json.load(fh)
        return data["bets"] if isinstance(data, dict) else data
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def num(record, field):
    """Parse a numeric field, returning None when absent or unparseable.

    Returning None rather than 0.0 matters: a missing closing price must not
    become a real-looking CLV of -100%.
    """
    raw = record.get(field)
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def profit_of(status, stake, odds):
    if status == "won":
        return stake * (odds - 1)
    if status == "lost":
        return -stake
    return 0.0  # push and void both return the stake


def grade(records):
    rows, skipped = [], []

    for i, rec in enumerate(records):
        status = str(rec.get("status", "")).strip().lower()
        stake = num(rec, "stake")
        odds = num(rec, "odds_decimal")

        if status not in SETTLED:
            continue  # pending, or an unrecognised status
        if stake is None or odds is None or stake <= 0 or odds <= 1:
            skipped.append((i, "missing or invalid stake/odds"))
            continue

        closing = num(rec, "closing_odds")
        clv = (odds / closing - 1) * 100 if closing and closing > 1 else None

        rows.append({
            "status": status,
            "stake": stake,
            "odds": odds,
            "profit": profit_of(status, stake, odds),
            "clv": clv,
            "sport": rec.get("sport") or "unknown",
            "market_type": rec.get("market_type") or "unknown",
            "book": rec.get("book") or "unknown",
        })

    return rows, skipped


def summarise(rows):
    staked = sum(r["stake"] for r in rows)
    profit = sum(r["profit"] for r in rows)
    wins = sum(1 for r in rows if r["status"] == "won")
    losses = sum(1 for r in rows if r["status"] == "lost")
    decided = wins + losses

    clvs = [r["clv"] for r in rows if r["clv"] is not None]

    return {
        "settled_bets": len(rows),
        "total_staked": round(staked, 2),
        "net_profit": round(profit, 2),
        "roi_percent": round(profit / staked * 100, 2) if staked else 0.0,
        "wins": wins,
        "losses": losses,
        "pushes": sum(1 for r in rows if r["status"] == "push"),
        "voids": sum(1 for r in rows if r["status"] == "void"),
        # Pushes and voids are excluded from the denominator entirely.
        "win_rate_percent": round(wins / decided * 100, 2) if decided else None,
        "bets_with_clv": len(clvs),
        "avg_clv_percent": round(sum(clvs) / len(clvs), 2) if clvs else None,
        "positive_clv_percent": (
            round(sum(1 for c in clvs if c > 0) / len(clvs) * 100, 2) if clvs else None
        ),
    }


def breakdown(rows, key):
    groups = defaultdict(list)
    for r in rows:
        groups[r[key]].append(r)
    out = {}
    for name, group in sorted(groups.items()):
        staked = sum(r["stake"] for r in group)
        profit = sum(r["profit"] for r in group)
        out[name] = {
            "bets": len(group),
            "staked": round(staked, 2),
            "profit": round(profit, 2),
            "roi_percent": round(profit / staked * 100, 2) if staked else 0.0,
        }
    return out


def note_on_sample(n):
    if n == 0:
        return "No settled bets. Nothing can be concluded."
    if n < 30:
        return (f"{n} settled bets is far too small to mean anything. "
                "Treat every figure here as noise.")
    if n < 100:
        return (f"{n} settled bets is a small sample. ROI here is dominated by "
                "variance, not skill. CLV is the more reliable signal.")
    return (f"{n} settled bets. Still read ROI alongside average CLV -- CLV "
            "separates skill from variance far sooner than ROI does.")


def render_text(summary, by_sport, by_market, by_book, skipped):
    L = []
    add = L.append
    add("=" * 56)
    add("BET PERFORMANCE")
    add("=" * 56)
    add(f"  Settled bets    {summary['settled_bets']}")
    add(f"  Total staked    {summary['total_staked']:,.2f}")
    add(f"  Net profit      {summary['net_profit']:,.2f}")
    add(f"  ROI             {summary['roi_percent']}%   <- on settled stake only")
    add("")
    wr = summary["win_rate_percent"]
    add(f"  W-L-P-V         {summary['wins']}-{summary['losses']}"
        f"-{summary['pushes']}-{summary['voids']}")
    add(f"  Win rate        {wr if wr is not None else 'n/a'}%"
        "   <- pushes and voids excluded")
    add("")
    if summary["avg_clv_percent"] is not None:
        add(f"  Average CLV     {summary['avg_clv_percent']}%  "
            f"(over {summary['bets_with_clv']} bets with a closing price)")
        add(f"  Positive CLV    {summary['positive_clv_percent']}% of those bets")
        if (summary["avg_clv_percent"] < -5
                and (summary["positive_clv_percent"] or 0) > 35):
            add("")
            add("  ! A deeply negative average CLV next to a near-even positive")
            add("    rate means a few records are badly wrong, not that every")
            add("    pick is bad. Check for closing prices captured after")
            add("    kickoff -- those are in-play prices and are meaningless.")
    else:
        add("  CLV             no closing prices supplied")
    add("")
    add(f"  {note_on_sample(summary['settled_bets'])}")

    for title, data in (("BY SPORT", by_sport), ("BY MARKET", by_market),
                        ("BY BOOK", by_book)):
        if len(data) > 1:
            add("")
            add(title)
            for name, s in sorted(data.items(), key=lambda kv: -kv[1]["profit"]):
                add(f"  {name:<18} {s['bets']:>4} bets   "
                    f"profit {s['profit']:>10,.2f}   ROI {s['roi_percent']:>7}%")

    if skipped:
        add("")
        add(f"SKIPPED {len(skipped)} record(s):")
        for idx, why in skipped[:10]:
            add(f"  row {idx}: {why}")
        if len(skipped) > 10:
            add(f"  ... and {len(skipped) - 10} more")

    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description="Grade settled bets.")
    ap.add_argument("path", help="CSV or JSON file of bet records")
    ap.add_argument("--format", choices=["text", "json"], default="text")
    args = ap.parse_args()

    try:
        records = load(args.path)
    except (OSError, json.JSONDecodeError, KeyError) as err:
        print(f"Could not read {args.path}: {err}", file=sys.stderr)
        return 1

    rows, skipped = grade(records)
    summary = summarise(rows)
    by_sport = breakdown(rows, "sport")
    by_market = breakdown(rows, "market_type")
    by_book = breakdown(rows, "book")

    if args.format == "json":
        print(json.dumps({
            "summary": summary,
            "by_sport": by_sport,
            "by_market_type": by_market,
            "by_book": by_book,
            "skipped": [{"row": i, "reason": w} for i, w in skipped],
            "sample_note": note_on_sample(summary["settled_bets"]),
        }, indent=2))
    else:
        print(render_text(summary, by_sport, by_market, by_book, skipped))

    return 0


if __name__ == "__main__":
    sys.exit(main())
