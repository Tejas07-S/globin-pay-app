"""GlobalPay AI — Extras router.

Adds:
- Google Auth (stubbed — needs your own Google OAuth client, see TODO below)
- Stripe checkout (top-up + GlobalPay Plus subscription) — optional, disabled
  until STRIPE_API_KEY is set
- Family shared wallet
- Split bills
- Referral & cashback
- AML / sanctions screening (mocked)
- Admin panel endpoints
"""
from __future__ import annotations

import os
import uuid
import logging
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Literal, Dict, Any

import jwt
import stripe
from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel, Field, EmailStr
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
STRIPE_KEY = os.environ.get("STRIPE_API_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")
STRIPE_ENABLED = bool(STRIPE_KEY)
if STRIPE_ENABLED:
    stripe.api_key = STRIPE_KEY
else:
    logging.getLogger("gp.extras").warning(
        "STRIPE_API_KEY not set — top-up and GlobalPay Plus checkout endpoints "
        "are disabled (they'll return 501) until you add one to backend/.env."
    )

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET env var is required.")
JWT_ALGO = "HS256"
FOUNDER_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("FOUNDER_EMAILS", "").split(",")
    if e.strip()
}

logger = logging.getLogger("gp.extras")

# Public URL where the RN app is served (used for Stripe success/cancel redirects).
# Falls back to localhost for local dev so this module doesn't block startup —
# override with APP_URL in production.
PUBLIC_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("APP_URL")
    or os.environ.get("EXPO_PACKAGER_PROXY_URL")
    or "http://localhost:8000"
)


router = APIRouter(prefix="/api")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def utcnow_iso() -> str:
    return utcnow().isoformat()


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": utcnow() + timedelta(hours=24 * 7),
        "iat": utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


# --- DB dependency ---
def get_db(request: Request):
    return request.app.state.db


# --- Auth dependency (mirrors server.py's current_user) ---
async def _current_user(request: Request, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = request.app.state.db
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("frozen"):
        raise HTTPException(status_code=403, detail="Account frozen — contact support")
    return user


async def _require_admin(user=Depends(_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ============================================================
# GOOGLE AUTH
# ============================================================
# TODO: this is currently a stub. To enable real Google sign-in:
#   1. Create OAuth 2.0 credentials in your own Google Cloud Console project
#   2. On the frontend, use `expo-auth-session/providers/google` to get an
#      id_token from Google directly (no third-party proxy needed)
#   3. Here, verify that id_token server-side with `google-auth`
#      (google.oauth2.id_token.verify_oauth2_token) instead of trusting a
#      session_id from an external service
# Email/password auth (below, in server.py) works today independent of this.

class GoogleSessionIn(BaseModel):
    session_id: str  # temporary id from redirect (?session_id=...)


@router.post("/auth/google")
async def google_auth(data: GoogleSessionIn, request: Request):
    raise HTTPException(
        status_code=501,
        detail="Google sign-in isn't configured yet — use email & password, "
        "or see the TODO in extras.py to wire up your own Google OAuth client.",
    )


# ============================================================
# STRIPE — top-up + GlobalPay Plus subscription (test mode)
# ============================================================

class TopupIn(BaseModel):
    amount_usd: float = Field(gt=0)
    origin_url: Optional[str] = None  # RN can pass its Linking.createURL('') host


PLUS_PRICE_USD = 6.99


def _require_stripe():
    if not STRIPE_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Stripe isn't configured yet — add STRIPE_API_KEY to backend/.env "
            "to enable top-ups and GlobalPay Plus.",
        )


def _origin_from(request: Request, override: Optional[str]) -> str:
    if override:
        return override.rstrip("/")
    return PUBLIC_URL.rstrip("/")


async def _create_checkout_session(*, amount_usd: float, success_url: str, cancel_url: str, metadata: dict):
    """Wraps the (synchronous) official Stripe SDK in a thread so it doesn't
    block the event loop. Stripe Checkout wants the amount in cents."""
    import asyncio
    return await asyncio.to_thread(
        stripe.checkout.Session.create,
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "usd",
                "product_data": {"name": metadata.get("intent", "GlobalPay payment")},
                "unit_amount": int(round(amount_usd * 100)),
            },
            "quantity": 1,
        }],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
    )


@router.post("/stripe/topup")
async def stripe_topup(data: TopupIn, request: Request, user=Depends(_current_user)):
    _require_stripe()
    origin = _origin_from(request, data.origin_url)
    success_url = f"{origin}/pay/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/pay/cancel"

    session = await _create_checkout_session(
        amount_usd=float(data.amount_usd),
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "intent": "wallet_topup",
            "user_id": user["id"],
            "amount_usd": f"{data.amount_usd:.2f}",
        },
    )
    db = request.app.state.db
    await db.payment_sessions.insert_one({
        "session_id": session.id,
        "user_id": user["id"],
        "amount_usd": data.amount_usd,
        "intent": "wallet_topup",
        "payment_status": "unpaid",
        "credited": False,
        "created_at": utcnow_iso(),
    })
    return {"session_id": session.id, "url": session.url}


@router.post("/stripe/subscribe-plus")
async def stripe_subscribe_plus(request: Request, user=Depends(_current_user)):
    _require_stripe()
    # Treated as a one-time monthly "activation" charge (not a recurring Stripe
    # Subscription) — the webhook flips premium_active=true. Swap to
    # stripe.checkout.Session.create(mode="subscription", ...) with a real Price
    # object if/when you want actual recurring billing.
    origin = _origin_from(request, None)
    success_url = f"{origin}/pay/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/pay/cancel"

    session = await _create_checkout_session(
        amount_usd=PLUS_PRICE_USD,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"intent": "plus_upgrade", "user_id": user["id"]},
    )
    db = request.app.state.db
    await db.payment_sessions.insert_one({
        "session_id": session.id,
        "user_id": user["id"],
        "amount_usd": PLUS_PRICE_USD,
        "intent": "plus_upgrade",
        "payment_status": "unpaid",
        "credited": False,
        "created_at": utcnow_iso(),
    })
    return {"session_id": session.id, "url": session.url}


@router.get("/stripe/status/{session_id}")
async def stripe_status(session_id: str, request: Request, user=Depends(_current_user)):
    _require_stripe()
    db = request.app.state.db
    local = await db.payment_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not local:
        raise HTTPException(status_code=404, detail="Session not found")

    import asyncio
    session = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
    is_paid = session.payment_status == "paid" or session.status == "complete"
    if is_paid and not local.get("credited"):
        await _apply_payment(db, local)
        local = await db.payment_sessions.find_one({"session_id": session_id}, {"_id": 0})
    return {
        "session_id": session_id,
        "payment_status": session.payment_status,
        "status": session.status,
        "credited": bool(local.get("credited")),
        "amount_usd": local.get("amount_usd"),
        "intent": local.get("intent"),
    }


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    _require_stripe()
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        if STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
        else:
            # No webhook secret configured (fine for local dev) — parse without
            # signature verification. Set STRIPE_WEBHOOK_SECRET in production.
            import json as _json
            event = _json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid webhook payload")

    event_obj = event["data"]["object"] if isinstance(event, dict) else event.data.object
    session_id = event_obj.get("id") if isinstance(event_obj, dict) else getattr(event_obj, "id", None)

    db = request.app.state.db
    if not session_id:
        return {"received": True}
    local = await db.payment_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if local and not local.get("credited"):
        await _apply_payment(db, local)
    return {"received": True}


async def _apply_payment(db, local: Dict[str, Any]):
    intent = local.get("intent")
    user_id = local.get("user_id")
    amount = float(local.get("amount_usd") or 0)
    if intent == "wallet_topup":
        u = await db.users.find_one({"id": user_id}, {"_id": 0})
        if u:
            new_usd = round((u.get("balances", {}).get("USD", 0.0)) + amount, 2)
            await db.users.update_one({"id": user_id}, {"$set": {"balances.USD": new_usd}})
    elif intent == "plus_upgrade":
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"premium_active": True, "plus_since": utcnow_iso()}},
        )
    await db.payment_sessions.update_one(
        {"session_id": local["session_id"]},
        {"$set": {"credited": True, "credited_at": utcnow_iso(), "payment_status": "paid"}},
    )
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": user_id,
        "action": intent,
        "amount_usd": amount,
        "created_at": utcnow_iso(),
    })


# ============================================================
# FAMILY SHARED WALLET
# ============================================================

class FamilyCreateIn(BaseModel):
    name: str


class FamilyAddMemberIn(BaseModel):
    member_email: EmailStr
    allowance_usd: float = 0.0


class FamilyFundIn(BaseModel):
    amount_usd: float = Field(gt=0)


@router.post("/family")
async def family_create(data: FamilyCreateIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    existing = await db.families.find_one({"owner_id": user["id"]}, {"_id": 0})
    if existing:
        return existing
    fam = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "name": data.name,
        "members": [{"user_id": user["id"], "email": user["email"], "role": "owner", "allowance_usd": 0.0}],
        "balance_usd": 0.0,
        "created_at": utcnow_iso(),
    }
    await db.families.insert_one(fam)
    fam.pop("_id", None)
    return fam


@router.get("/family")
async def family_get(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    fam = await db.families.find_one(
        {"$or": [{"owner_id": user["id"]}, {"members.user_id": user["id"]}]},
        {"_id": 0},
    )
    return fam


@router.post("/family/add-member")
async def family_add_member(data: FamilyAddMemberIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    fam = await db.families.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Create a family first")
    # Look up user (optional)
    member = await db.users.find_one({"email": data.member_email.lower()}, {"_id": 0})
    entry = {
        "user_id": (member or {}).get("id"),
        "email": data.member_email.lower(),
        "role": "member",
        "allowance_usd": data.allowance_usd,
    }
    await db.families.update_one({"id": fam["id"]}, {"$push": {"members": entry}})
    fam2 = await db.families.find_one({"id": fam["id"]}, {"_id": 0})
    return fam2


@router.post("/family/fund")
async def family_fund(data: FamilyFundIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    fam = await db.families.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="No family")
    if user["balances"].get("USD", 0.0) < data.amount_usd:
        raise HTTPException(status_code=400, detail="Insufficient USD balance")
    await db.users.update_one(
        {"id": user["id"]},
        {"$inc": {"balances.USD": -data.amount_usd}},
    )
    await db.families.update_one(
        {"id": fam["id"]},
        {"$inc": {"balance_usd": data.amount_usd}},
    )
    fam2 = await db.families.find_one({"id": fam["id"]}, {"_id": 0})
    return fam2


# ============================================================
# SPLIT BILLS
# ============================================================

class SplitBillIn(BaseModel):
    title: str
    total: float = Field(gt=0)
    currency: str = "USD"
    participants: List[str]  # names or emails
    note: Optional[str] = None


@router.post("/splits")
async def split_create(data: SplitBillIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    n = max(1, len(data.participants))
    share = round(data.total / n, 2)
    parts = [{"name": p, "share": share, "paid": False} for p in data.participants]
    doc = {
        "id": str(uuid.uuid4()),
        "creator_id": user["id"],
        "title": data.title,
        "total": data.total,
        "currency": data.currency.upper(),
        "share_each": share,
        "note": data.note,
        "participants": parts,
        "created_at": utcnow_iso(),
    }
    await db.splits.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/splits")
async def split_list(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    cur = db.splits.find({"creator_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@router.post("/splits/{split_id}/mark")
async def split_mark(split_id: str, name: str, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    doc = await db.splits.find_one({"id": split_id, "creator_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    parts = doc["participants"]
    for p in parts:
        if p["name"] == name:
            p["paid"] = not p["paid"]
            break
    await db.splits.update_one({"id": split_id}, {"$set": {"participants": parts}})
    return {"id": split_id, "participants": parts}


# ============================================================
# REFERRAL & CASHBACK
# ============================================================

REFERRAL_REWARD_USD = 5.0
CASHBACK_PCT = 0.005  # 0.5% cashback on transfers, credited to cashback_usd


def _new_referral_code() -> str:
    return "GP-" + uuid.uuid4().hex[:6].upper()


class RedeemIn(BaseModel):
    code: str


@router.get("/referral/me")
async def referral_me(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    # Backfill code if missing
    if not user.get("referral_code"):
        code = _new_referral_code()
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
        user["referral_code"] = code
    invited = await db.referrals.count_documents({"referrer_id": user["id"]})
    return {
        "code": user["referral_code"],
        "invited_count": invited,
        "cashback_usd": round(float(user.get("cashback_usd") or 0.0), 2),
        "reward_per_invite_usd": REFERRAL_REWARD_USD,
    }


@router.post("/referral/redeem")
async def referral_redeem(data: RedeemIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    if user.get("referred_by"):
        raise HTTPException(status_code=400, detail="Already redeemed")
    if user.get("referral_code") == data.code:
        raise HTTPException(status_code=400, detail="Cannot use your own code")
    ref_user = await db.users.find_one({"referral_code": data.code}, {"_id": 0})
    if not ref_user:
        raise HTTPException(status_code=404, detail="Invalid code")
    # Credit both users
    await db.users.update_one({"id": user["id"]}, {"$set": {"referred_by": ref_user["id"]}, "$inc": {"balances.USD": REFERRAL_REWARD_USD}})
    await db.users.update_one({"id": ref_user["id"]}, {"$inc": {"balances.USD": REFERRAL_REWARD_USD}})
    await db.referrals.insert_one({
        "id": str(uuid.uuid4()),
        "referrer_id": ref_user["id"],
        "invited_id": user["id"],
        "code": data.code,
        "reward_usd": REFERRAL_REWARD_USD,
        "created_at": utcnow_iso(),
    })
    return {"ok": True, "credited_usd": REFERRAL_REWARD_USD}


# ============================================================
# AML / SANCTIONS (mocked)
# ============================================================

DENYLIST_COUNTRIES = {"IRAN", "NORTH KOREA", "SYRIA", "CUBA", "CRIMEA"}
SANCTIONS_NAMES = {"OSAMA", "PABLO ESCOBAR", "VIKTOR BOUT", "SEMEN MOGILEVICH"}
PEP_NAMES = {"VLADIMIR PUTIN", "KIM JONG UN", "XI JINPING"}


class ScreenIn(BaseModel):
    name: str
    country: str


@router.post("/aml/screen")
async def aml_screen(data: ScreenIn):
    """Return a risk score + flags for a name/country pair."""
    n = data.name.upper()
    c = data.country.upper()
    flags = []
    score = 5
    if c in DENYLIST_COUNTRIES:
        flags.append("SANCTIONED_COUNTRY")
        score = max(score, 95)
    for term in SANCTIONS_NAMES:
        if term in n:
            flags.append("SANCTIONS_LIST_MATCH")
            score = max(score, 98)
    for term in PEP_NAMES:
        if term in n:
            flags.append("PEP_MATCH")
            score = max(score, 75)
    # Simple velocity heuristic on names with many caps/digits
    if re.search(r"\d", data.name):
        flags.append("SUSPICIOUS_NAME_FORMAT")
        score = max(score, 40)
    decision = "block" if score >= 90 else "review" if score >= 50 else "allow"
    return {"score": score, "flags": flags, "decision": decision}


# ============================================================
# ADMIN
# ============================================================

@router.post("/admin/bootstrap")
async def admin_bootstrap(request: Request, user=Depends(_current_user)):
    """Grant the current user is_admin — only works if no admin exists yet."""
    db = request.app.state.db
    existing = await db.users.find_one({"is_admin": True})
    if existing:
        raise HTTPException(status_code=403, detail="Admin already exists")
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_admin": True}})
    return {"ok": True}


@router.get("/admin/overview")
async def admin_overview(request: Request, _=Depends(_require_admin)):
    db = request.app.state.db
    users_count = await db.users.count_documents({})
    kyc_pending = await db.users.count_documents({"kyc_status": "pending"})
    kyc_verified = await db.users.count_documents({"kyc_status": "verified"})
    tx_count = await db.transactions.count_documents({})
    plus_count = await db.users.count_documents({"premium_active": True})
    # Volume in USD (approx — from transactions.amount converted to USD using stored rate is complex; return counts)
    invoices_count = await db.invoices.count_documents({})
    payments = await db.payment_sessions.count_documents({"credited": True})
    return {
        "users_count": users_count,
        "kyc_pending": kyc_pending,
        "kyc_verified": kyc_verified,
        "transactions_count": tx_count,
        "plus_subscribers": plus_count,
        "invoices_count": invoices_count,
        "payments_settled": payments,
    }


@router.get("/admin/users")
async def admin_users(request: Request, _=Depends(_require_admin)):
    db = request.app.state.db
    cur = db.users.find(
        {},
        {"_id": 0, "password": 0}
    ).sort("created_at", -1).limit(200)
    return await cur.to_list(200)


@router.post("/admin/users/{user_id}/freeze")
async def admin_freeze(user_id: str, request: Request, admin=Depends(_require_admin)):
    db = request.app.state.db
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    frozen = not bool(u.get("frozen"))
    await db.users.update_one({"id": user_id}, {"$set": {"frozen": frozen}})
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": admin["id"],
        "action": "freeze" if frozen else "unfreeze",
        "target_user_id": user_id,
        "created_at": utcnow_iso(),
    })
    return {"user_id": user_id, "frozen": frozen}


@router.post("/admin/users/{user_id}/kyc/{decision}")
async def admin_kyc(user_id: str, decision: str, request: Request, admin=Depends(_require_admin)):
    if decision not in ("verified", "rejected"):
        raise HTTPException(status_code=400, detail="Bad decision")
    db = request.app.state.db
    await db.users.update_one({"id": user_id}, {"$set": {"kyc_status": decision}})
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": admin["id"],
        "action": f"kyc_{decision}",
        "target_user_id": user_id,
        "created_at": utcnow_iso(),
    })
    return {"user_id": user_id, "kyc_status": decision}


@router.get("/admin/transactions")
async def admin_transactions(request: Request, _=Depends(_require_admin)):
    db = request.app.state.db
    cur = db.transactions.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
    return await cur.to_list(200)


@router.get("/admin/audit-logs")
async def admin_audit(request: Request, _=Depends(_require_admin)):
    db = request.app.state.db
    cur = db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
    return await cur.to_list(200)


# Convenience route for the stripe success/cancel pages (JSON — the RN app polls status)
@router.get("/pay/success")
async def pay_success(session_id: Optional[str] = None):
    return {"ok": True, "session_id": session_id}


@router.get("/pay/cancel")
async def pay_cancel():
    return {"ok": False}
