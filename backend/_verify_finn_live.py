"""
LIVE test for Finn's Gemini integration — zero mocking, real network, real API key.

Same story as _verify_rates_live.py: this sandbox can't reach
generativelanguage.googleapis.com (same egress allowlist restriction).
Run this yourself with a real GEMINI_API_KEY and internet access:

    cd backend
    export GEMINI_API_KEY="your-real-key-from-aistudio.google.com/apikey"
    pip install mongomock-motor   # only needed for this script, not the app
    python3 _verify_finn_live.py
"""
import asyncio
import os
import sys

if not os.environ.get("GEMINI_API_KEY"):
    print("Set GEMINI_API_KEY in your environment first, e.g.:")
    print('  export GEMINI_API_KEY="your-key-here"')
    sys.exit(1)

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "globinpay_finn_live_test")
os.environ.setdefault("JWT_SECRET", "live-verify-only-secret")
os.environ.setdefault("FOUNDER_EMAILS", "")

try:
    import motor.motor_asyncio
    test_client = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=1000)
    test_client.admin.command("ping")
    print("Using real MongoDB at", os.environ["MONGO_URL"])
except Exception:
    print("No real MongoDB reachable — using mongomock for the DB layer (Gemini calls are still 100% real)")
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
    import server
    import finn_service as finn

    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/auth/register", json={
            "email": "geminilive@globinpayapp.dev", "password": "supersecret123", "full_name": "Gemini Live Tester",
        })
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        user_id = r.json()["user"]["id"]

        await server.db.users.update_one({"id": user_id}, {"$set": {
            "balances.USD": 750.0, "balances.EUR": 200.0,
            "country": "US", "preferred_currency": "USD", "kyc_status": "pending",
        }})

        print("\n--- Direct call to the real Gemini API ---")
        ctx = await finn.build_context(server.db, await server.db.users.find_one({"id": user_id}, {"_id": 0}))
        block = finn.format_context_block(ctx)
        reply = await finn.call_gemini("What's my USD balance?", block, [])
        check("1. Real Gemini call succeeded (not None)", reply is not None)
        if reply:
            print(f"    Gemini's actual reply: {reply}")
            check("2. Reply references the real balance (750)", "750" in reply, reply)

        print("\n--- Through the full API (registration -> chat) ---")
        r = await client.post("/api/ai/chat", headers=headers, json={
            "session_id": "live-test", "message": "How much money do I have in my wallet?"
        })
        check("3. Chat endpoint succeeds", r.status_code == 200)
        check("4. Source is 'gemini', confirming the real provider was used", r.json()["source"] == "gemini", str(r.json()))
        print(f"    Full reply: {r.json()['reply']}")

        print("\n--- Confirm Gemini did NOT invent a KYC status it wasn't told ---")
        r2 = await client.post("/api/ai/chat", headers=headers, json={
            "session_id": "live-test", "message": "Am I verified yet?"
        })
        print(f"    Reply: {r2.json()['reply']}")
        print("    (Manually confirm this says 'pending'/'not verified', matching the real kyc_status set above —")
        print("     this is the one check that needs a human eye on tone/accuracy, not just an assertion.)")

    print("\n✅ LIVE GEMINI TEST PASSED — real API, real backend data, single source of truth confirmed.")


asyncio.run(main())
