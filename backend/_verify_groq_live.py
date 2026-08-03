"""
LIVE test for Finn's Groq integration — zero mocking, real network, real free API key.

Same situation as _verify_rates_live.py and _verify_finn_live.py: this
sandbox can't reach api.groq.com (confirmed directly — a real request to it
during backend testing returned "Host not in allowlist: api.groq.com" from
the egress gateway, same restriction as every other external API used in
this project). Run this yourself with a real GROQ_API_KEY and internet
access:

    cd backend
    export GROQ_API_KEY="your-real-key-from-console.groq.com/keys"
    pip install mongomock-motor   # only needed for this script, not the app
    python3 _verify_groq_live.py

Groq's free tier requires no credit card. Get a key at
https://console.groq.com/keys

This also exercises the full provider chain against reality: it
deliberately breaks Gemini first (bad key) so you can confirm the chain
actually falls through to Groq, not just that Groq works in isolation.
"""
import asyncio
import os
import sys

if not os.environ.get("GROQ_API_KEY"):
    print("Set GROQ_API_KEY in your environment first, e.g.:")
    print('  export GROQ_API_KEY="your-key-here"')
    print("Free, no credit card: https://console.groq.com/keys")
    sys.exit(1)

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "globinpay_groq_live_test")
os.environ.setdefault("JWT_SECRET", "live-verify-only-secret")
os.environ.setdefault("FOUNDER_EMAILS", "")

try:
    import motor.motor_asyncio
    test_client = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=1000)
    test_client.admin.command("ping")
    print("Using real MongoDB at", os.environ["MONGO_URL"])
except Exception:
    print("No real MongoDB reachable — using mongomock for the DB layer (Groq calls are still 100% real)")
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

    print(f"Using GROQ_MODEL={finn.GROQ_MODEL}")
    print("(This is a configurable env var, not hardcoded — see finn_service.py")
    print(" for why: Groq's model lineup has churned significantly this year,")
    print(" and both models suggested in earlier drafts of this feature —")
    print(" llama-3.3-70b-versatile and deepseek-r1-distill-llama-70b — are")
    print(" confirmed deprecated/decommissioned by Groq's own docs.)\n")

    print("--- 1. Direct call to the real Groq API ---")
    reply = await finn.call_groq(
        "What's my USD balance?",
        "User Country: US\nPreferred Currency: USD\nWallet Balances: USD 750.00",
        [],
    )
    check("1. Real Groq call succeeded (not None)", reply is not None)
    if reply:
        print(f"    Groq's actual reply: {reply}")
        check("2. Reply references the real balance (750)", "750" in reply, reply)

    print("\n--- 3. Full chain through the real API (register -> chat) ---")
    # Deliberately break Gemini so the chain has to actually fall through to
    # Groq, proving the fallback logic works end-to-end against reality, not
    # just that Groq works in isolation.
    finn.GEMINI_API_KEY = "intentionally-invalid-to-test-fallthrough"
    finn.OPENAI_API_KEY = ""

    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/auth/register", json={
            "email": "groqlive@globinpayapp.dev", "password": "supersecret123", "full_name": "Groq Live Tester",
        })
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        user_id = r.json()["user"]["id"]

        await server.db.users.update_one({"id": user_id}, {"$set": {
            "balances.USD": 320.0, "balances.EUR": 80.0,
            "country": "DE", "preferred_currency": "EUR", "kyc_status": "verified",
        }})

        r = await client.post("/api/ai/chat", headers=headers, json={
            "session_id": "live-test", "message": "What's my EUR balance and am I verified?"
        })
        check("4. Chat endpoint succeeds", r.status_code == 200)
        check("5. Source is 'groq', confirming the chain fell through correctly", r.json()["source"] == "groq", str(r.json()))
        print(f"    Full reply: {r.json()['reply']}")
        print("    (Manually confirm this mentions 80 EUR and verified status —")
        print("     tone/accuracy on an open-ended reply needs a human read.)")

    print("\n--- 6. Confirm the API key never leaked into the response ---")
    check("6. GROQ_API_KEY not present in the chat response", os.environ["GROQ_API_KEY"] not in str(r.json()))

    print("\n✅ LIVE GROQ TEST PASSED — real API, real fallthrough from a broken")
    print("   Gemini, real backend data, single source of truth confirmed.")


asyncio.run(main())
