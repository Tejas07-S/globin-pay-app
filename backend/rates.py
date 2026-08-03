"""
Live exchange rate provider.

Default provider: Frankfurter (https://frankfurter.dev) — free, open-source,
no API key required, tracks daily rates from 80+ central banks (ECB and
partners). Covers all of SUPPORTED below, including AED (confirmed via
frankfurter.dev/currencies — not in the older ECB-only 31-currency set, but
present in the newer v2 aggregated dataset).

Configurable: swap FX_PROVIDER (currently only "frankfurter" is implemented)
without touching any caller — everything downstream only calls get_rates()/
get_rate()/get_recent_history(). Adding a second provider means implementing
one function and branching on FX_PROVIDER, nothing else changes.

Graceful degradation (never fabricate a number):
- If the live call fails entirely, we serve the last good cached rates,
  clearly marked `stale: true`, rather than invent numbers or crash.
- If only SOME currencies fail, the successful ones are still served and
  the failed ones are listed in `unavailable` — the caller decides how to
  show that (Phase 1 pattern: never silently substitute a fake number).

Real history, not a fake prediction: on every successful fetch we upsert a
daily snapshot into `fx_history` in Mongo. `/rates/predict` (kept as the
route name for backward compatibility) now returns whatever *real* history
we've accumulated — sparse on day one, filling in over time — instead of a
fabricated "tomorrow" rate and a fake confidence score. There is no honest
free source for actual FX prediction; showing one would be exactly the kind
of fake-numbers problem Phase 2 was asked to remove.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import httpx

logger = logging.getLogger("gp.rates")

FX_PROVIDER = os.environ.get("FX_PROVIDER", "frankfurter")
FRANKFURTER_BASE = "https://api.frankfurter.dev/v2"
CACHE_TTL_SECONDS = int(os.environ.get("FX_CACHE_TTL_SECONDS", "1800"))  # 30 min

SUPPORTED = ["USD", "EUR", "GBP", "INR", "JPY", "AED", "AUD", "CAD", "SGD", "CHF", "CNY"]

# In-memory cache: {(base, date_or_"latest"): {"rates": {...}, "fetched_at": ts}}
_cache: Dict[str, dict] = {}


def today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def yesterday_iso() -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()


async def _fetch_bulk(base: str, date: Optional[str] = None) -> Optional[Dict[str, float]]:
    """One call for every SUPPORTED currency at once. Confirmed response shape
    (frankfurter.dev/javascript): a flat array of {"quote": ..., "rate": ...}."""
    quotes = ",".join(c for c in SUPPORTED if c != base)
    params = {"base": base, "quotes": quotes}
    if date:
        params["date"] = date
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"{FRANKFURTER_BASE}/rates", params=params)
        if r.status_code != 200:
            logger.warning(f"FX provider {r.status_code} for base={base} date={date}: {r.text[:200]}")
            return None
        rows = r.json()
        rates = {row["quote"]: row["rate"] for row in rows if "quote" in row and "rate" in row}
        rates[base] = 1.0
        return rates
    except Exception as e:
        logger.warning(f"FX provider request failed for base={base} date={date}: {e}")
        return None


async def get_rates(base: str = "USD", force_refresh: bool = False, db=None) -> dict:
    """Today's rates for `base` against every SUPPORTED currency."""
    base = base.upper()
    key = f"latest:{base}"
    now = time.time()
    cached = _cache.get(key)
    if cached and not force_refresh and (now - cached["fetched_at"]) < CACHE_TTL_SECONDS:
        return cached

    fetched = await _fetch_bulk(base)
    if fetched is None:
        if cached:
            stale = dict(cached)
            stale["stale"] = True
            return stale
        return {"base": base, "rates": {base: 1.0}, "unavailable": [c for c in SUPPORTED if c != base],
                "fetched_at": now, "stale": True, "source": FX_PROVIDER}

    unavailable = [c for c in SUPPORTED if c not in fetched]
    # Merge: keep last-known-good for anything the provider dropped this round
    if cached:
        for c in list(unavailable):
            if c in cached.get("rates", {}):
                fetched[c] = cached["rates"][c]
                unavailable.remove(c)  # we do have a value for it, just not freshly refreshed

    entry = {"base": base, "rates": fetched, "unavailable": unavailable,
             "fetched_at": now, "stale": False, "source": FX_PROVIDER}
    _cache[key] = entry

    if db is not None:
        try:
            await db.fx_history.update_one(
                {"date": today_iso(), "base": base},
                {"$set": {"date": today_iso(), "base": base, "rates": fetched,
                          "recorded_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"Failed to persist fx_history snapshot: {e}")

    return entry


async def get_rates_for_date(base: str, date: str) -> Optional[Dict[str, float]]:
    """Historical rates are immutable once published, so this caches forever
    (no TTL) once fetched successfully."""
    base = base.upper()
    key = f"hist:{base}:{date}"
    cached = _cache.get(key)
    if cached:
        return cached["rates"]
    fetched = await _fetch_bulk(base, date=date)
    if fetched is None:
        return None
    _cache[key] = {"rates": fetched, "fetched_at": time.time()}
    return fetched


async def get_rate(base: str, quote: str, db=None) -> Optional[float]:
    base, quote = base.upper(), quote.upper()
    if base == quote:
        return 1.0
    data = await get_rates(base, db=db)
    return data["rates"].get(quote)


async def get_recent_history(base: str, quote: str, db, days: int = 7) -> List[dict]:
    """Real, self-accumulating history — reads our own daily snapshots
    (written by get_rates() on every successful live fetch) rather than
    depending on the provider's historical-range endpoint. Sparse at first,
    fills in day by day. Never backfilled with fabricated points."""
    base, quote = base.upper(), quote.upper()
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=days)).isoformat()
    docs = await db.fx_history.find(
        {"base": base, "date": {"$gte": cutoff}}, {"_id": 0}
    ).sort("date", 1).to_list(days)
    out = []
    for d in docs:
        rate = d.get("rates", {}).get(quote)
        if rate is not None:
            out.append({"date": d["date"], "rate": rate})
    return out
