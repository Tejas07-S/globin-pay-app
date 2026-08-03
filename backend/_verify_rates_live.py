"""
LIVE integration test — zero mocking, hits the real internet.

This sandbox cannot reach api.frankfurter.dev (confirmed directly:
`curl` returns "Host not in allowlist: api.frankfurter.dev" from the
egress gateway — not a guess, a checked fact). Everything in
_verify_rates.py was verified against a mock built to match Frankfurter's
*documented* response shapes exactly. This script is what actually proves
the live provider behaves the way its docs say — run this yourself in an
environment with real internet access (your laptop, a CI runner, etc).

    cd backend
    pip install mongomock-motor   # only needed for this script, not the app
    python3 _verify_rates_live.py

Exits non-zero and prints exactly what failed if the live provider's
contract doesn't match what rates.py expects — in which case the fix is
isolated to rates.py's _fetch_bulk() function, nothing else.
"""
import asyncio
import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "globinpay_live_test")
os.environ.setdefault("JWT_SECRET", "live-verify-only-secret")
os.environ.setdefault("FOUNDER_EMAILS", "")

# Use a real Mongo if MONGO_URL points to one; otherwise fall back to a mock
# so this script still runs standalone. Either way, the FX calls below are
# 100% real network — that's the entire point of this script.
try:
    import motor.motor_asyncio
    test_client = motor.motor_asyncio.AsyncIOMotorClient(
        os.environ["MONGO_URL"], serverSelectionTimeoutMS=1000
    )
    test_client.admin.command("ping")
    print("Using real MongoDB at", os.environ["MONGO_URL"])
except Exception:
    print("No real MongoDB reachable — falling back to mongomock for the DB layer only")
    print("(the FX calls themselves are still 100% real network)")
    import motor.motor_asyncio
    from mongomock_motor import AsyncMongoMockClient
    motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient

sys.path.insert(0, os.path.dirname(__file__))
import httpx


def check(label, cond, extra=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}" + (f" — {extra}" if extra and not cond else ""))
    if not cond:
        raise SystemExit(f"FAILED: {label} {extra}")


async def main():
    import rates as fx
    import server

    print("\n--- 1. rates.py against the REAL Frankfurter API ---")
    data = await fx.get_rates("USD", force_refresh=True, db=server.db)
    check("1a. Live call succeeded (not stale/fallback)", data["stale"] is False, str(data))
    check("1b. All 11 SUPPORTED currencies present (incl. AED)",
          set(fx.SUPPORTED) <= set(data["rates"].keys()),
          f"got: {sorted(data['rates'].keys())}")
    check("1c. AED specifically present (the currency I had to verify wasn't in the older ECB-only set)",
          "AED" in data["rates"], str(data["unavailable"]))
    check("1d. No currencies unexpectedly unavailable", data["unavailable"] == [], str(data["unavailable"]))
    print(f"    Live USD rates: {data['rates']}")

    print("\n--- 2. Yesterday's rate (historical date lookup) ---")
    yday = await fx.get_rates_for_date("USD", fx.yesterday_iso())
    check("2a. Historical date lookup succeeded", yday is not None)
    check("2b. Historical data has real currencies", yday and "EUR" in yday, str(yday))

    print("\n--- 3. fx_history persistence with real data ---")
    hist = await server.db.fx_history.find_one({"base": "USD"})
    check("3. Today's real snapshot persisted", hist is not None and hist["rates"]["EUR"] == data["rates"]["EUR"])

    print("\n--- 4. Same source across every consumer, with REAL rates ---")
    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/auth/register", json={
            "email": "livetest@globinpayapp.dev", "password": "supersecret123", "full_name": "Live Tester",
        })
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        await server.db.users.update_one({"email": "livetest@globinpayapp.dev"}, {"$set": {"balances.USD": 1000.0}})

        r = await client.get("/api/rates", params={"base": "USD"})
        rates_eur = next(x for x in r.json()["rates"] if x["quote"] == "EUR")["rate"]

        r = await client.get("/api/fee/quote", headers=headers,
                              params={"from_currency": "USD", "to_currency": "EUR", "amount": 100})
        feequote_eur = r.json()["exchange_rate"]

        r = await client.post("/api/transfers", headers=headers, json={
            "from_currency": "USD", "to_currency": "EUR", "amount": 10,
            "recipient_name": "Live Test Recipient", "recipient_country": "Germany",
        })
        transfer_eur = r.json()["exchange_rate"]

        r = await client.get("/api/wallet", headers=headers)
        wallet_total = r.json()["total_usd"]

        check("4a. /rates, /fee/quote, /transfers all report the identical live EUR rate",
              rates_eur == feequote_eur == transfer_eur,
              f"rates={rates_eur} fee_quote={feequote_eur} transfer={transfer_eur}")
        check("4b. Wallet USD total is correct against the same live rate (990 USD left after a 10 USD send)",
              wallet_total == 990.0, str(wallet_total))

    print("\n✅ LIVE INTEGRATION TEST PASSED — real Frankfurter data, single consistent source across every endpoint.")
    print("\nNOTE: this only proves the BACKEND. The frontend (rates.tsx) calls these same endpoints and")
    print("renders whatever they return — there's no separate frontend rate source to verify, by construction")
    print("(see PHASE2_FEATURE1_RATES.md — 'single source of truth' section). A real click-through in Expo")
    print("is still worth doing since I can't render/screenshot the app from here.")


asyncio.run(main())
