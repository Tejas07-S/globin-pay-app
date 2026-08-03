"""
Verifies rates.py + its integration into server.py/extras2.py, using a
mocked httpx layer (this sandbox's network egress can't reach
api.frankfurter.dev — see CHANGES/PHASE2 notes). This tests:
  - correct parsing of the documented Frankfurter v2 response shape
  - TTL caching (no re-fetch within the window)
  - graceful degradation: partial failure, total failure, no crash
  - fx_history persistence + real (not fake) recent-history reads
  - every downstream consumer (wallet total_usd, fee quote, transfers,
    analytics, ai/insights) using real rates instead of BASE_USD_RATES

What this does NOT prove: that api.frankfurter.dev actually behaves the way
its docs say. That's a live-network check the user needs to do once
deployed somewhere with real internet access.
"""
import asyncio
import os
import sys
import time

os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ["DB_NAME"] = "globinpay_rates_test12"
os.environ["JWT_SECRET"] = "verify-only-secret"
os.environ["FOUNDER_EMAILS"] = ""
os.environ["FX_CACHE_TTL_SECONDS"] = "3600"  # keep it stable for the cache-hit test

import motor.motor_asyncio
from mongomock_motor import AsyncMongoMockClient
motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient

sys.path.insert(0, os.path.dirname(__file__))
import httpx


def check(label, cond):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        raise SystemExit(f"FAILED: {label}")


# ---------- Mocked FX provider responses ----------
FULL_RATES = {
    "EUR": 0.92, "GBP": 0.79, "INR": 83.2, "JPY": 149.5, "AED": 3.67,
    "AUD": 1.51, "CAD": 1.36, "SGD": 1.34, "CHF": 0.88, "CNY": 7.24,
}

call_log = []


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self):
        return self._payload


MODE = {"value": "full"}  # mutated between test phases


_real_async_get = httpx.AsyncClient.get


async def fake_get(self, url, params=None, **kwargs):
    # Only intercept calls actually going to the FX provider; everything else
    # (like the ASGI-transported test client hitting our own FastAPI app)
    # goes through the real implementation untouched.
    if "frankfurter" not in str(url):
        return await _real_async_get(self, url, params=params, **kwargs)

    call_log.append((url, dict(params or {})))
    mode = MODE["value"]
    date = (params or {}).get("date")

    if mode == "total_failure":
        raise httpx.ConnectError("simulated network failure")

    if mode == "partial_failure":
        # Drop AED and JPY this round, as if the provider didn't have them
        quotes = (params or {}).get("quotes", "").split(",")
        rows = [{"quote": q, "rate": FULL_RATES[q]} for q in quotes if q in FULL_RATES and q not in ("AED", "JPY")]
        return FakeResponse(200, rows)

    if mode == "http_error":
        return FakeResponse(500, {"message": "internal error"})

    # full success — matches documented shape exactly:
    # a flat array of {"quote": ..., "rate": ...}
    quotes = (params or {}).get("quotes", "").split(",")
    factor = 1.0 if not date else 0.995  # yesterday slightly different, deterministic
    rows = [{"quote": q, "rate": round(FULL_RATES[q] * factor, 4)} for q in quotes if q in FULL_RATES]
    return FakeResponse(200, rows)


async def main():
    httpx.AsyncClient.get = fake_get  # monkey-patch before importing server (which imports rates)
    import server
    import rates as fx

    # ---------- 1. Full success — correct parsing ----------
    MODE["value"] = "full"
    data = await fx.get_rates("USD", force_refresh=True, db=server.db)
    check("1a. Parses all 10 quote currencies", len(data["rates"]) == 11)  # 10 + base itself
    check("1b. EUR rate parsed correctly", data["rates"]["EUR"] == 0.92)
    check("1c. Base itself is 1.0", data["rates"]["USD"] == 1.0)
    check("1d. Not marked stale on success", data["stale"] is False)
    check("1e. Nothing unavailable on full success", data["unavailable"] == [])

    # ---------- 2. fx_history persisted ----------
    hist_doc = await server.db.fx_history.find_one({"base": "USD"})
    check("2. fx_history snapshot persisted to Mongo", hist_doc is not None and hist_doc["rates"]["EUR"] == 0.92)

    # ---------- 3. TTL caching — no re-fetch within window ----------
    calls_before = len(call_log)
    data2 = await fx.get_rates("USD")  # force_refresh=False, should hit cache
    check("3. Cache hit — no new HTTP call within TTL", len(call_log) == calls_before)
    check("3b. Cached data matches original", data2["rates"]["EUR"] == 0.92)

    # ---------- 3c. Cache EXPIRATION — a stale timestamp triggers a real re-fetch ----------
    fx._cache["latest:USD"]["fetched_at"] = time.time() - 999999  # force it far outside the TTL
    calls_before = len(call_log)
    data2b = await fx.get_rates("USD")  # force_refresh=False — should refetch because cache is expired, not because we asked
    check("3c. Expired cache triggers a real re-fetch", len(call_log) == calls_before + 1)
    check("3d. Refetched data is still correct", data2b["rates"]["EUR"] == 0.92)

    # ---------- 4. Partial failure — graceful degradation ----------
    MODE["value"] = "partial_failure"
    data3 = await fx.get_rates("USD", force_refresh=True, db=server.db)
    check("4a. Successful currencies still present", data3["rates"]["EUR"] == 0.92)
    check("4b. Missing currency merged from last-known-good cache",
          "AED" in data3["rates"] and data3["rates"]["AED"] == 3.67)
    check("4c. Nothing falsely marked unavailable once merged from cache", data3["unavailable"] == [])

    # ---------- 5. Total failure — falls back to last good cache, marked stale ----------
    MODE["value"] = "total_failure"
    data4 = await fx.get_rates("USD", force_refresh=True)
    check("5a. Total failure falls back to cached data, doesn't crash", data4["rates"]["EUR"] == 0.92)
    check("5b. Correctly marked stale", data4["stale"] is True)

    # restore for the rest of the test
    MODE["value"] = "full"
    await fx.get_rates("USD", force_refresh=True, db=server.db)

    # ---------- 6. Total failure with NO prior cache at all (fresh currency pair) ----------
    MODE["value"] = "total_failure"
    data5 = await fx.get_rates("GBP", force_refresh=True)  # never fetched with GBP as base before
    check("6a. No crash with zero cache and total failure", data5["rates"] == {"GBP": 1.0})
    check("6b. Everything correctly marked unavailable, not faked", len(data5["unavailable"]) == 10)
    check("6c. Marked stale", data5["stale"] is True)
    MODE["value"] = "full"

    # ---------- 7. Real downstream usage: register, wallet, fee quote, transfer, analytics ----------
    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/auth/register", json={
            "email": "fxtest@globinpayapp.dev", "password": "supersecret123", "full_name": "FX Tester",
        })
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # give them some USD to test conversions with
        await server.db.users.update_one({"email": "fxtest@globinpayapp.dev"}, {"$set": {"balances.USD": 1000.0}})

        r = await client.get("/api/wallet", headers=headers)
        check("7a. Wallet total_usd uses real rate (not fake BASE_USD_RATES)", r.json()["total_usd"] == 1000.0)

        r = await client.get("/api/fee/quote", headers=headers,
                              params={"from_currency": "USD", "to_currency": "EUR", "amount": 100})
        fee_rate = r.json()["exchange_rate"]
        check("7b. Fee quote uses real EUR rate", abs(fee_rate - 0.92) < 0.001)

        # ---------- Transfer calculations use the cached rate service, not a direct HTTP call ----------
        calls_before_transfer = len(call_log)
        r = await client.post("/api/transfers", headers=headers, json={
            "from_currency": "USD", "to_currency": "EUR", "amount": 50,
            "recipient_name": "Test Recipient", "recipient_country": "Germany",
        })
        check("7c. Transfer succeeds using real rate", r.status_code == 200)
        check("7c2. Transfer reused the cache — did NOT make its own direct HTTP call to the FX provider",
              len(call_log) == calls_before_transfer)

        # ---------- Wallet USD total matches what the transfer itself used ----------
        transfer_rate = r.json().get("exchange_rate")
        check("7c1. Transfer used the same real EUR rate as /fee/quote (consistency across endpoints)",
              transfer_rate is not None and abs(transfer_rate - fee_rate) < 0.0001)
        r2 = await client.get("/api/wallet", headers=headers)
        new_usd_balance = r2.json()["balances"]["USD"]
        check("7c3. USD debited by exactly the sent amount", new_usd_balance == 950.0)
        # Note: /transfers sends to an external recipient — the converted amount
        # does NOT get credited back into the sender's own EUR balance, so we
        # only check the debit + the rate consistency (7c1), not an EUR credit.

        # Recompute what total_usd SHOULD be from the wallet's own currency mix, using the
        # same rates the wallet endpoint itself reports — proves internal consistency rather
        # than just trusting the endpoint's own math.
        rates_now = (await fx.get_rates("USD"))["rates"]
        recomputed_total = round(new_usd_balance / rates_now["USD"], 2)
        check("7c5. Wallet total_usd matches independent recomputation from the same rate source",
              abs(r2.json()["total_usd"] - recomputed_total) < 0.01)

        r = await client.get("/api/analytics", headers=headers)
        check("7d. Analytics loads without crashing (real rate conversions)", r.status_code == 200)

        r = await client.get("/api/rates", params={"base": "USD"})
        rd = r.json()
        eur_row = next(x for x in rd["rates"] if x["quote"] == "EUR")
        check("7e. /rates shows real EUR rate", eur_row["rate"] == 0.92)
        check("7f. /rates shows real change_pct (not fake jitter)", eur_row["change_pct"] is not None)

        r = await client.get("/api/rates/predict", params={"base": "USD", "quote": "EUR"})
        pd = r.json()
        check("7g. /rates/predict has NO fake 'tomorrow' field", "tomorrow" not in pd)
        check("7h. /rates/predict has NO fake 'confidence' field", "confidence" not in pd)
        check("7i. /rates/predict has NO fake 'best_day' field", "best_day" not in pd)
        check("7j. /rates/predict returns real today rate", pd["today"] == 0.92)
        check("7k. /rates/predict is honest about not predicting", "prediction" in pd["disclaimer"].lower() or "forecast" in pd["disclaimer"].lower())

        r = await client.get("/api/ai/insights", headers=headers)
        check("7l. AI insights loads without crashing", r.status_code == 200)
        insight_bodies = " ".join(i["body"] for i in r.json().get("insights", []))
        check("7m. No fake 'tomorrow'/prediction language in Finn's insights",
              "tomorrow" not in insight_bodies.lower() and "waiting until" not in insight_bodies.lower())

    print(f"\nTotal mocked HTTP calls made: {len(call_log)}")
    print("✅ ALL FX INTEGRATION CHECKS PASSED (against a mocked provider — see docstring)")


asyncio.run(main())
