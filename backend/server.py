"""GLOBiN Pay backend — FastAPI + MongoDB.

Provides JWT auth, multi-currency wallet, transfers, invoices, KYC (mocked),
live FX rates, smart fee calculator, analytics, and an AI Financial Assistant
(pluggable — OpenAI or Anthropic, configured via your own API key in .env).
"""
from __future__ import annotations

import os
import uuid
import logging
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Literal, Dict, Any

import jwt
import bcrypt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

import rates as fx  # live exchange rates — see rates.py


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from extras import router as extras_router, _new_referral_code, CASHBACK_PCT
from extras2 import router as extras2_router
from extras3 import router as extras3_router, _bump_recipient
from routes_payment_methods import router as payment_methods_router

# --- Config ---
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET env var is required (no insecure default in prod).")
JWT_ALGO = "HS256"
JWT_EXPIRY_HOURS = 24 * 7
# Note: GEMINI_API_KEY / OPENAI_API_KEY / GROQ_API_KEY / ANTHROPIC_API_KEY are
# read directly
# by finn_service.py, which is the single source of truth for AI provider
# config — no need to duplicate the env reads here.
FOUNDER_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("FOUNDER_EMAILS", "").split(",")
    if e.strip()
}
PUBLIC_APP_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("APP_URL")
    or os.environ.get("EXPO_PACKAGER_PROXY_URL")
    or "http://localhost:3000"
)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="GLOBiN Pay")
app.state.db = db
api = APIRouter(prefix="/api")


# --- Utilities ---
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def utcnow_iso() -> str:
    return utcnow().isoformat()


def _daily_seed() -> int:
    """Stable per-day seed for anything that wants deterministic 'random'
    output (e.g. the illustrative analytics chart buckets below) — nothing
    to do with exchange rates, which are real/live as of Phase 2."""
    return utcnow().date().toordinal()


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("frozen"):
        raise HTTPException(status_code=403, detail="Account frozen — contact support")
    # Founder auto-promotion — ensures the app owner always has founder access.
    if (user.get("email", "").lower() in FOUNDER_EMAILS) and not user.get("is_admin"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"is_admin": True}})
        user["is_admin"] = True
    return with_user_defaults(user)


# --- Models ---
SUPPORTED = fx.SUPPORTED  # single source of truth — see rates.py


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class OnboardingIn(BaseModel):
    country: str  # ISO alpha-2, e.g. "US", "IN"
    preferred_currency: str
    account_type: Literal["personal", "business", "student"]
    bank_type: Literal["checking", "savings", "business", "digital"]


# Fields added after some accounts already existed — never assume they're present.
# Every place that returns a user document to the client should pass it through
# this first so old accounts don't break the frontend (no DB migration needed).
_USER_DEFAULTS = {
    "country": None,
    "preferred_currency": None,
    "account_type": None,
    "bank_type": None,
    "onboarding_completed": False,
}


def with_user_defaults(user: dict) -> dict:
    for key, default in _USER_DEFAULTS.items():
        user.setdefault(key, default)
    return user


class TransferIn(BaseModel):
    from_currency: str
    to_currency: str
    amount: float = Field(gt=0)
    recipient_name: str
    recipient_country: str
    note: Optional[str] = None


class InvoiceIn(BaseModel):
    client_name: str
    client_email: EmailStr
    amount: float = Field(gt=0)
    currency: str
    description: str
    due_days: int = 14


class KYCIn(BaseModel):
    doc_type: Literal["passport", "national_id", "driving_license", "aadhaar"]
    doc_number: str
    country: str
    date_of_birth: str
    address: str


class ChatIn(BaseModel):
    session_id: str
    message: str



# --- Auth routes ---
@api.post("/auth/register")
async def register(data: RegisterIn):
    if await db.users.find_one({"email": data.email.lower()}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    initial_balances = {c: 0.0 for c in SUPPORTED}
    user = {
        "id": user_id,
        "email": data.email.lower(),
        "full_name": data.full_name,
        "password": hash_pw(data.password),
        "kyc_status": "pending",
        "is_admin": data.email.lower() in FOUNDER_EMAILS,
        "premium_active": False,
        "frozen": False,
        "referral_code": _new_referral_code(),
        "referred_by": None,
        "cashback_usd": 0.0,
        "auth_provider": "password",
        "balances": initial_balances,
        "created_at": utcnow_iso(),
        **_USER_DEFAULTS,  # country/preferred_currency/account_type/bank_type/onboarding_completed
    }
    await db.users.insert_one(user)
    token = make_token(user_id)
    user.pop("password")
    user.pop("_id", None)
    return {"token": token, "user": user}


@api.post("/auth/login")
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not verify_pw(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Founder auto-promotion on login
    if (user["email"] in FOUNDER_EMAILS) and not user.get("is_admin"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"is_admin": True}})
        user["is_admin"] = True
    token = make_token(user["id"])
    user.pop("password", None)
    user.pop("_id", None)
    return {"token": token, "user": with_user_defaults(user)}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


@api.post("/onboarding/complete")
async def complete_onboarding(data: OnboardingIn, user=Depends(current_user)):
    from countries import COUNTRIES  # single source of truth, shared with /api/countries
    code = data.country.upper()
    if code not in {c["code"] for c in COUNTRIES}:
        raise HTTPException(status_code=400, detail="Unknown country code")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "country": code,
            "preferred_currency": data.preferred_currency.upper(),
            "account_type": data.account_type,
            "bank_type": data.bank_type,
            "onboarding_completed": True,
            "onboarding_completed_at": utcnow_iso(),
        }},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return with_user_defaults(updated)


# --- Wallet ---
@api.get("/wallet")
async def wallet(user=Depends(current_user)):
    balances = user.get("balances", {})
    usd_rates = (await fx.get_rates("USD", db=db))["rates"]
    total_usd = 0.0
    for cur, amt in balances.items():
        if amt:
            rate = usd_rates.get(cur)
            if rate:  # skip currencies the provider can't price right now rather than guessing
                total_usd += amt / rate
    return {"balances": balances, "total_usd": round(total_usd, 2)}


# --- FX rates (live — see rates.py) ---
@api.get("/rates")
async def rates(base: str = "USD"):
    base = base.upper()
    if base not in SUPPORTED:
        raise HTTPException(status_code=400, detail="Unsupported base")

    today = await fx.get_rates(base, db=db)
    yesterday_rates = await fx.get_rates_for_date(base, fx.yesterday_iso()) or {}

    out = []
    for q in SUPPORTED:
        if q == base:
            continue
        today_rate = today["rates"].get(q)
        if today_rate is None:
            out.append({"pair": f"{base}/{q}", "quote": q, "available": False})
            continue
        yday_rate = yesterday_rates.get(q)
        change_pct = round((today_rate - yday_rate) / yday_rate * 100, 2) if yday_rate else None
        out.append({
            "pair": f"{base}/{q}", "quote": q, "available": True,
            "rate": round(today_rate, 4), "change_pct": change_pct,
        })
    return {
        "base": base, "rates": out,
        "source": today["source"], "stale": today["stale"], "fetched_at": today["fetched_at"],
    }


@api.get("/rates/predict")
async def predict(base: str = "USD", quote: str = "EUR"):
    """Kept as /rates/predict for backward compatibility with the frontend
    route, but this is no longer a fabricated prediction — there's no honest
    free source for real FX forecasting. Returns real today/yesterday rates
    plus whatever real historical trend we've actually recorded so far
    (fills in day by day; sparse at first, never backfilled with fake data)."""
    base, quote = base.upper(), quote.upper()
    if base not in SUPPORTED or quote not in SUPPORTED:
        raise HTTPException(status_code=400, detail="Unsupported currency")

    today_data = await fx.get_rates(base, db=db)
    today_rate = today_data["rates"].get(quote)
    yesterday_rates = await fx.get_rates_for_date(base, fx.yesterday_iso()) or {}
    yday_rate = yesterday_rates.get(quote)
    history = await fx.get_recent_history(base, quote, db, days=7)

    if today_rate is None:
        return {
            "pair": f"{base}/{quote}", "available": False,
            "message": "Rate temporarily unavailable from the live provider.",
            "stale": today_data["stale"],
        }

    return {
        "pair": f"{base}/{quote}", "available": True,
        "today": round(today_rate, 4),
        "yesterday": round(yday_rate, 4) if yday_rate else None,
        "change_pct": round((today_rate - yday_rate) / yday_rate * 100, 2) if yday_rate else None,
        "history": history,  # real recorded points only — may be short at first
        "source": today_data["source"],
        "stale": today_data["stale"],
        "disclaimer": "Live market rate, not a prediction. GLOBiN Pay doesn't forecast future rates.",
    }


# --- Fee model — see fees.py (the ONE place this formula lives; extras3.py
# imports the same functions rather than recomputing the constants). ---
from fees import calc_transfer_fee, calc_paypal_comparison_fee, calc_savings_vs_paypal


# --- Smart fee calculator ---
@api.get("/fee/quote")
async def quote(from_currency: str, to_currency: str, amount: float):
    from_currency, to_currency = from_currency.upper(), to_currency.upper()
    if from_currency not in SUPPORTED or to_currency not in SUPPORTED:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    rate = await fx.get_rate(from_currency, to_currency, db=db)
    if rate is None:
        raise HTTPException(status_code=503, detail="Exchange rate temporarily unavailable — try again shortly.")
    fee = calc_transfer_fee(amount)
    receiving = round((amount - fee) * rate, 2)
    return {
        "amount_sent": amount,
        "from_currency": from_currency,
        "to_currency": to_currency,
        "exchange_rate": round(rate, 4),
        "transfer_fee": fee,
        "receiving_amount": receiving,
        "taxes": 0.0,
        "hidden_fees": 0.0,
        "estimated_delivery": "Minutes to 1 hour",
        "savings_vs_paypal": calc_savings_vs_paypal(amount, fee),
    }



# --- Transfers ---
@api.post("/transfers")
async def create_transfer(data: TransferIn, user=Depends(current_user)):
    fc, tc = data.from_currency.upper(), data.to_currency.upper()
    if fc not in SUPPORTED or tc not in SUPPORTED:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    bal = user["balances"].get(fc, 0.0)
    if bal < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient funds")
    rate = await fx.get_rate(fc, tc, db=db)
    if rate is None:
        raise HTTPException(status_code=503, detail="Exchange rate temporarily unavailable — try again shortly.")
    fee = calc_transfer_fee(data.amount)
    receiving = round((data.amount - fee) * rate, 2)
    # Update balances (mocked settlement)
    new_from = round(bal - data.amount, 2)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {f"balances.{fc}": new_from}},
    )
    # AML screening (mocked)
    from extras import DENYLIST_COUNTRIES, SANCTIONS_NAMES, PEP_NAMES
    n = data.recipient_name.upper()
    c = data.recipient_country.upper()
    aml_flags: List[str] = []
    aml_score = 5
    if c in DENYLIST_COUNTRIES:
        aml_flags.append("SANCTIONED_COUNTRY"); aml_score = 98
    for term in SANCTIONS_NAMES:
        if term in n:
            aml_flags.append("SANCTIONS_LIST_MATCH"); aml_score = max(aml_score, 98)
    for term in PEP_NAMES:
        if term in n:
            aml_flags.append("PEP_MATCH"); aml_score = max(aml_score, 75)
    if aml_score >= 90:
        # Refund the debit and block
        await db.users.update_one({"id": user["id"]}, {"$set": {f"balances.{fc}": bal}})
        raise HTTPException(
            status_code=403,
            detail=f"Transfer blocked by AML: {', '.join(aml_flags)}",
        )

    # Cashback (USD equivalent, 0.5%)
    fc_to_usd = await fx.get_rate(fc, "USD", db=db)
    cashback = round(data.amount * (fc_to_usd or 1) * CASHBACK_PCT, 2)
    if cashback > 0:
        await db.users.update_one({"id": user["id"]}, {"$inc": {"cashback_usd": cashback}})

    tx = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "transfer_out",
        "from_currency": fc,
        "to_currency": tc,
        "amount": data.amount,
        "receiving_amount": receiving,
        "exchange_rate": rate,
        "fee": fee,
        "recipient_name": data.recipient_name,
        "recipient_country": data.recipient_country,
        "note": data.note,
        "status": "completed",
        "aml_score": aml_score,
        "aml_flags": aml_flags,
        "cashback_usd": cashback,
        "created_at": utcnow_iso(),
    }
    await db.transactions.insert_one(tx)
    tx.pop("_id", None)
    # Auto-add / bump recipient
    await _bump_recipient(db, user["id"], data.recipient_name, data.recipient_country)
    return tx


@api.get("/transfers")
async def list_transfers(user=Depends(current_user)):
    cur = db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


# --- Invoices ---
@api.post("/invoices")
async def create_invoice(data: InvoiceIn, user=Depends(current_user)):
    inv = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "client_name": data.client_name,
        "client_email": data.client_email,
        "amount": data.amount,
        "currency": data.currency.upper(),
        "description": data.description,
        "status": "pending",
        "due_date": (utcnow() + timedelta(days=data.due_days)).isoformat(),
        "created_at": utcnow_iso(),
        "payment_link": f"{PUBLIC_APP_URL.rstrip('/')}/pay/{uuid.uuid4().hex[:12]}",
    }
    await db.invoices.insert_one(inv)
    inv.pop("_id", None)
    return inv


@api.get("/invoices")
async def list_invoices(user=Depends(current_user)):
    cur = db.invoices.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@api.post("/invoices/{invoice_id}/mark-paid")
async def mark_paid(invoice_id: str, user=Depends(current_user)):
    inv = await db.invoices.find_one({"id": invoice_id, "user_id": user["id"]}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"status": "paid"}})
    # Credit user balance
    cur = inv["currency"]
    new_bal = round(user["balances"].get(cur, 0.0) + inv["amount"], 2)
    await db.users.update_one({"id": user["id"]}, {"$set": {f"balances.{cur}": new_bal}})
    return {"ok": True}


# --- KYC (mocked) ---
@api.post("/kyc")
async def submit_kyc(data: KYCIn, user=Depends(current_user)):
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "doc_type": data.doc_type,
        "doc_number": data.doc_number,
        "country": data.country,
        "date_of_birth": data.date_of_birth,
        "address": data.address,
        "status": "verified",  # mocked auto-verify
        "created_at": utcnow_iso(),
    }
    await db.kyc.insert_one(rec)
    await db.users.update_one({"id": user["id"]}, {"$set": {"kyc_status": "verified"}})
    rec.pop("_id", None)
    return rec


# --- Analytics ---
@api.get("/analytics")
async def analytics(user=Depends(current_user)):
    txs = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    invs = await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    usd_rates = (await fx.get_rates("USD", db=db))["rates"]

    def to_usd(amount: float, currency: str) -> float:
        rate = usd_rates.get(currency)
        return amount / rate if rate else 0.0  # skip pricing we genuinely don't have, don't guess

    # Sent (transfers) as spending in USD
    spending_usd = 0.0
    for t in txs:
        spending_usd += to_usd(t["amount"], t["from_currency"])
    income_usd = 0.0
    for i in invs:
        if i["status"] == "paid":
            income_usd += to_usd(i["amount"], i["currency"])
    # 6-month buckets (mocked distribution using seed for stability)
    rnd = random.Random(_daily_seed())
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    spending_series = [round(rnd.uniform(200, 900), 2) for _ in months]
    income_series = [round(rnd.uniform(400, 1600), 2) for _ in months]
    # Currency allocation
    balances = user.get("balances", {})
    allocation = []
    total_usd = 0.0
    for c, a in balances.items():
        usd_val = to_usd(a, c)
        total_usd += usd_val
        if a > 0:
            allocation.append({"currency": c, "usd_value": round(usd_val, 2)})
    for a in allocation:
        a["pct"] = round(a["usd_value"] / total_usd * 100, 1) if total_usd else 0
    allocation.sort(key=lambda x: -x["usd_value"])
    # Categories (mocked)
    categories = [
        {"name": "Transfers", "usd": round(spending_usd, 2), "color": "#10B981"},
        {"name": "Subscriptions", "usd": round(rnd.uniform(30, 120), 2), "color": "#F59E0B"},
        {"name": "Food & Dining", "usd": round(rnd.uniform(80, 250), 2), "color": "#3B82F6"},
        {"name": "Shopping", "usd": round(rnd.uniform(50, 300), 2), "color": "#EF4444"},
        {"name": "Travel", "usd": round(rnd.uniform(0, 400), 2), "color": "#A855F7"},
    ]
    # Financial health score
    score = min(98, 60 + int(income_usd / 200) - int(spending_usd / 300))
    score = max(20, score)
    return {
        "net_worth_usd": round(total_usd, 2),
        "spending_usd": round(spending_usd, 2),
        "income_usd": round(income_usd, 2),
        "months": months,
        "spending_series": spending_series,
        "income_series": income_series,
        "allocation": allocation,
        "categories": categories,
        "financial_health_score": score,
    }


# --- AI Assistant (Finn) — see finn_service.py for the actual implementation ---
import finn_service

# Conversation memory is intentionally bounded, not permanent: each session
# keeps only its most recent exchanges. Older messages are pruned after every
# turn rather than accumulating forever in Mongo. The context actually sent
# to Gemini/fallback is trimmed further still (see finn_service.call_gemini,
# history[-10:]) — this constant only bounds what's *stored* for the
# "scroll back up" UX, which is a materially larger window than what's
# actually sent to the model on each turn.
CHAT_HISTORY_KEEP = 40  # ~20 back-and-forth exchanges


async def _prune_chat_history(session_id: str, user_id: str):
    keep_ids = await db.chat_messages.find(
        {"session_id": session_id, "user_id": user_id}, {"_id": 1}
    ).sort("created_at", -1).limit(CHAT_HISTORY_KEEP).to_list(None)
    if len(keep_ids) < CHAT_HISTORY_KEEP:
        return  # nothing to prune yet
    cutoff_id = keep_ids[-1]["_id"]
    # Delete anything older than the Nth-most-recent message we're keeping
    await db.chat_messages.delete_many({
        "session_id": session_id, "user_id": user_id, "_id": {"$lt": cutoff_id},
    })


@api.post("/ai/chat")
async def ai_chat(data: ChatIn, user=Depends(current_user)):
    # Persist user message
    await db.chat_messages.insert_one({
        "session_id": data.session_id,
        "user_id": user["id"],
        "role": "user",
        "content": data.message,
        "created_at": utcnow_iso(),
    })

    try:
        prior = await db.chat_messages.find(
            {"session_id": data.session_id, "user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", 1).limit(50).to_list(None)
        history = [{"role": m["role"], "content": m["content"]} for m in prior if m["role"] in ("user", "assistant")]
        # Drop the message we just inserted — it's passed separately as `message`
        history = history[:-1] if history and history[-1]["content"] == data.message else history
        result = await finn_service.get_finn_reply(db, user, data.message, history)
        reply = result["reply"]
        source = result["source"]
    except Exception as e:
        logging.exception("AI chat error")
        reply = "Something went wrong on my end — try asking again in a moment."
        source = "error"

    await db.chat_messages.insert_one({
        "session_id": data.session_id, "user_id": user["id"],
        "role": "assistant", "content": reply, "source": source, "created_at": utcnow_iso()
    })
    await _prune_chat_history(data.session_id, user["id"])
    return {"reply": reply, "source": source}


@api.get("/ai/history")
async def ai_history(session_id: str, user=Depends(current_user)):
    cur = db.chat_messages.find(
        {"session_id": session_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", 1).limit(CHAT_HISTORY_KEEP)
    return await cur.to_list(None)


@api.get("/ai/suggestions")
async def ai_suggestions(user=Depends(current_user)):
    ctx = await finn_service.build_context(db, user)
    return {"suggestions": finn_service.get_suggested_questions(ctx)}


@api.get("/")
async def root():
    return {"app": "GlobalPay AI", "status": "ok"}


app.include_router(api)
app.include_router(extras_router)
app.include_router(extras2_router)
app.include_router(extras3_router)
app.include_router(payment_methods_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=True)
