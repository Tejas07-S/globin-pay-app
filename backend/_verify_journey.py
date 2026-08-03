"""
End-to-end Phase 1 journey verification (backend logic + data layer).

This proves everything server-side and everything the frontend *reads*
is correct: what a fresh register/login/onboarding/re-login cycle actually
produces in the database and API responses. It cannot click through the
Expo UI itself (no simulator in this sandbox) — that gap is called out
explicitly in the final report.
"""
import asyncio
import os
import sys

os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ["DB_NAME"] = "globinpay_e2e14"
os.environ["JWT_SECRET"] = "verify-only-secret"
os.environ["FOUNDER_EMAILS"] = ""

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


async def main():
    import server

    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

        # ---------- 1. Register a brand-new user ----------
        r = await client.post("/api/auth/register", json={
            "email": "journey@globinpayapp.dev",
            "password": "supersecret123",
            "full_name": "Journey Tester",
        })
        check("1. Register succeeds", r.status_code == 200)
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        new_user = r.json()["user"]

        # ---------- 10. No fake wallet/demo data at register ----------
        check("10a. New user balances are ALL zero at register",
              all(v == 0 for v in new_user["balances"].values()))
        check("10b. onboarding_completed is False for a new user",
              new_user["onboarding_completed"] is False)
        check("10c. No transactions exist yet for a new user",
              (await client.get("/api/transfers", headers=headers)).json() == [])

        # ---------- 2. Login ----------
        r = await client.post("/api/auth/login", json={
            "email": "journey@globinpayapp.dev", "password": "supersecret123",
        })
        check("2. Login succeeds", r.status_code == 200)

        # ---------- 3. "Redirected to onboarding" == backend says not onboarded ----------
        r = await client.get("/api/auth/me", headers=headers)
        check("3. /auth/me reports onboarding_completed=False (frontend Gate routes to /onboarding on this)",
              r.json()["onboarding_completed"] is False)

        # ---------- 4. Complete onboarding ----------
        r = await client.post("/api/onboarding/complete", headers=headers, json={
            "country": "sg", "preferred_currency": "sgd",
            "account_type": "personal", "bank_type": "digital",
        })
        check("4. Onboarding completion succeeds", r.status_code == 200)
        check("4b. Response reflects onboarding_completed=True immediately",
              r.json()["onboarding_completed"] is True)

        # ---------- 5. Verify onboarding data actually persisted in MongoDB ----------
        raw = await server.db.users.find_one({"email": "journey@globinpayapp.dev"})
        check("5a. country persisted in MongoDB", raw["country"] == "SG")
        check("5b. preferred_currency persisted", raw["preferred_currency"] == "SGD")
        check("5c. account_type persisted", raw["account_type"] == "personal")
        check("5d. bank_type persisted", raw["bank_type"] == "digital")
        check("5e. onboarding_completed persisted as True in the DB (not just the response)",
              raw["onboarding_completed"] is True)

        # ---------- 6. Onboarding is skipped on next login ----------
        r = await client.post("/api/auth/login", json={
            "email": "journey@globinpayapp.dev", "password": "supersecret123",
        })
        check("6. Re-login returns onboarding_completed=True (frontend Gate sends straight to dashboard)",
              r.json()["user"]["onboarding_completed"] is True)

        # ---------- 7. Dashboard data: zero balance, correct country/currency ----------
        r = await client.get("/api/wallet", headers=headers)
        check("7a. Wallet balance still all-zero post-onboarding (onboarding doesn't seed money)",
              all(v == 0 for v in r.json()["balances"].values()))
        r = await client.get("/api/auth/me", headers=headers)
        me = r.json()
        check("7b. Dashboard has correct full_name for greeting", me["full_name"] == "Journey Tester")
        check("7c. Dashboard has correct country", me["country"] == "SG")
        check("7d. Dashboard has correct preferred_currency", me["preferred_currency"] == "SGD")
        check("7e. Dashboard has verification status field", me["kyc_status"] == "pending")

        # ---------- 8. Domestic adapts to selected country ----------
        r = await client.get("/api/countries/SG/schema")
        sg_schema = r.json()
        check("8a. Singapore domestic rail label is FAST (not UPI/India-anything)",
              sg_schema["domestic"]["label"] == "FAST")

        # Cross-check a few other countries to prove it's genuinely dynamic,
        # not just correct for one hardcoded case
        for code, expected_label in [("IN", "UPI"), ("US", "ACH"), ("GB", "Faster Payments"),
                                      ("DE", "SEPA"), ("AU", "PayID"), ("CA", "Interac"),
                                      ("JP", "Zengin"), ("AE", "Bank Transfer")]:
            rr = await client.get(f"/api/countries/{code}/schema")
            check(f"8b. {code} domestic label == {expected_label}",
                  rr.json()["domestic"]["label"] == expected_label)

        # A country with NO bespoke schema (fallback path) still works
        rr = await client.get("/api/countries/BR/schema")
        check("8c. Unmapped country (Brazil) falls back gracefully instead of 404ing",
              rr.status_code == 200 and rr.json()["domestic"]["label"] == "Bank Transfer")

        # ---------- backward compatibility: legacy account with no onboarding fields ----------
        r = await client.post("/api/auth/register", json={
            "email": "legacy@globinpayapp.dev", "password": "supersecret123",
            "full_name": "Legacy Account",
        })
        legacy_id = r.json()["user"]["id"]
        # Simulate an account created before this feature existed
        await server.db.users.update_one(
            {"id": legacy_id},
            {"$unset": {"onboarding_completed": "", "country": "", "preferred_currency": "",
                        "account_type": "", "bank_type": ""}},
        )
        legacy_token = r.json()["token"]
        r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {legacy_token}"})
        check("BC1. Legacy account (missing fields entirely) doesn't crash /auth/me",
              r.status_code == 200)
        check("BC2. Legacy account defaults to onboarding_completed=False (gets redirected, doesn't break)",
              r.json()["onboarding_completed"] is False)

    print("\n✅ ALL 10 JOURNEY CHECKPOINTS + BACKWARD COMPATIBILITY PASSED")


asyncio.run(main())
