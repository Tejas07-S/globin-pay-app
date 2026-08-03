"""
Verification-only harness (NOT part of the delivered app).

Since this sandbox has no network access to install real MongoDB, this
monkey-patches motor's client with mongomock-motor (an in-memory async mock)
so we can boot the *actual* server.py/extras*.py code unmodified and hit the
real FastAPI routes in-process. This proves the Emergent removal didn't break
routing/auth/serialization — it does not prove real MongoDB wire behavior,
which is a much lower-risk surface (motor/pymongo are mature, well-tested).
"""
import asyncio
import os
import sys

# --- env must be set before importing server.py ---
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ["DB_NAME"] = "globinpay_verify11"
os.environ["JWT_SECRET"] = "verify-only-secret-do-not-use-in-prod"
os.environ["FOUNDER_EMAILS"] = ""
# Deliberately NOT setting STRIPE_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
# to prove the app boots fine without them (today's milestone requirement).

# --- monkey-patch motor before server.py imports it ---
import motor.motor_asyncio
from mongomock_motor import AsyncMongoMockClient
motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient

sys.path.insert(0, os.path.dirname(__file__))

import httpx

async def main():
    import server  # noqa: this is the real, unmodified backend/server.py

    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        print("=== POST /api/auth/register ===")
        r = await client.post("/api/auth/register", json={
            "email": "founder@globinpayapp.dev",
            "password": "supersecret123",
            "full_name": "Test Founder",
        })
        print(r.status_code, r.json() if r.status_code < 500 else r.text)
        assert r.status_code == 200, "register failed"
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        print("\n=== POST /api/auth/login ===")
        r = await client.post("/api/auth/login", json={
            "email": "founder@globinpayapp.dev",
            "password": "supersecret123",
        })
        print(r.status_code, r.json())
        assert r.status_code == 200, "login failed"

        print("\n=== GET /api/auth/me ===")
        r = await client.get("/api/auth/me", headers=headers)
        print(r.status_code, r.json())
        assert r.status_code == 200, "me failed"

        print("\n=== GET /api/wallet (should be all zero — no seeded demo money) ===")
        r = await client.get("/api/wallet", headers=headers)
        print(r.status_code, r.json())
        assert r.status_code == 200, "wallet failed"
        assert all(v == 0 for v in r.json()["balances"].values()), "wallet should start at zero!"

        print("\n=== GET /api/auth/me — onboarding_completed should default False ===")
        r = await client.get("/api/auth/me", headers=headers)
        print(r.status_code, r.json())
        assert r.json()["onboarding_completed"] is False

        print("\n=== GET /api/countries/IN/schema (bespoke) ===")
        r = await client.get("/api/countries/IN/schema")
        print(r.status_code, r.json())
        assert r.status_code == 200 and r.json()["domestic"]["label"] == "UPI"

        print("\n=== GET /api/countries/DE/schema (bespoke, SEPA) ===")
        r = await client.get("/api/countries/DE/schema")
        print(r.status_code, r.json()["domestic"])
        assert r.json()["domestic"]["label"] == "SEPA"

        print("\n=== GET /api/countries/BR/schema (fallback — not in COUNTRY_SCHEMAS) ===")
        r = await client.get("/api/countries/BR/schema")
        print(r.status_code, r.json())
        assert r.status_code == 200, "fallback schema should not 404"
        assert r.json()["domestic"]["label"] == "Bank Transfer"

        print("\n=== GET /api/countries/ZZ/schema (truly unknown code) ===")
        r = await client.get("/api/countries/ZZ/schema")
        print(r.status_code, r.json())
        assert r.status_code == 404

        print("\n=== POST /api/onboarding/complete ===")
        r = await client.post("/api/onboarding/complete", headers=headers, json={
            "country": "de", "preferred_currency": "eur",
            "account_type": "personal", "bank_type": "checking",
        })
        print(r.status_code, r.json())
        assert r.status_code == 200
        assert r.json()["onboarding_completed"] is True
        assert r.json()["country"] == "DE"
        assert r.json()["preferred_currency"] == "EUR"

        print("\n=== GET /api/auth/me — onboarding_completed now True, persisted ===")
        r = await client.get("/api/auth/me", headers=headers)
        print(r.status_code, r.json())
        assert r.json()["onboarding_completed"] is True

        print("\n=== POST /api/onboarding/complete with bogus country (should 400) ===")
        r = await client.post("/api/onboarding/complete", headers=headers, json={
            "country": "ZZ", "preferred_currency": "USD",
            "account_type": "personal", "bank_type": "checking",
        })
        print(r.status_code, r.json())
        assert r.status_code == 400

        print("\n=== Simulate a pre-existing account (no onboarding fields in DB at all) ===")
        legacy_user = await server.db.users.find_one({"email": "founder@globinpayapp.dev"})
        await server.db.users.update_one(
            {"id": legacy_user["id"]},
            {"$unset": {"onboarding_completed": "", "country": "", "preferred_currency": "",
                        "account_type": "", "bank_type": ""}},
        )
        r = await client.get("/api/auth/me", headers=headers)
        print(r.status_code, r.json())
        assert r.json()["onboarding_completed"] is False, "legacy account should default to NOT onboarded"

        print("\n=== GET /api/rates ===")
        r = await client.get("/api/rates")
        print(r.status_code, str(r.json())[:200], "...")
        assert r.status_code == 200, "rates failed"

        print("\n=== GET /api/analytics ===")
        r = await client.get("/api/analytics", headers=headers)
        print(r.status_code, str(r.json())[:200], "...")
        assert r.status_code == 200, "analytics failed"

        print("\n=== POST /api/ai/chat (no key configured — should degrade gracefully) ===")
        r = await client.post("/api/ai/chat", headers=headers, json={
            "session_id": "verify-session", "message": "hello"
        })
        print(r.status_code, r.json())
        assert r.status_code == 200, "ai chat failed"

        print("\n=== POST /api/stripe/topup (no Stripe key — should 501, not crash) ===")
        r = await client.post("/api/stripe/topup", headers=headers, json={"amount_usd": 10})
        print(r.status_code, r.json())
        assert r.status_code == 501, "expected graceful 501 without Stripe key"

        print("\n=== POST /api/auth/google (stubbed — should 501, not call Emergent) ===")
        r = await client.post("/api/auth/google", json={"session_id": "fake"})
        print(r.status_code, r.json())
        assert r.status_code == 501, "expected graceful 501 stub"

    print("\n✅ ALL CHECKS PASSED — today's milestone endpoints work with zero Emergent dependency.")

asyncio.run(main())
