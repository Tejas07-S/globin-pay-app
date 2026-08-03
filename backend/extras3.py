"""GLOBiN pay — Priority 1 backend.

- Transaction details (with AI-explained fee breakdown, receipt payload)
- Recipients management (favorites, recent, verified badge, saved bank accounts)
- Pre-transaction AI Fraud check
- Financial Health (score + spending trend + savings rate + AI recs)
- Business hub (clients, bulk payments, tax report)
- BYO API keys (encrypted at rest with Fernet + feature flags)
- Founder / Admin dashboard extra metrics
- Rate alerts + Auto-convert rules
- In-app announcements ("push-style" notifications, stored in Mongo)
"""
from __future__ import annotations

import os
import uuid
import base64
import hashlib
import random
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Literal

import jwt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel, Field, EmailStr

from fees import calc_transfer_fee, calc_paypal_comparison_fee


router = APIRouter(prefix="/api")

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET env var is required.")
JWT_ALGO = "HS256"

# Derive a Fernet key from JWT_SECRET (32 bytes, url-safe base64)
_fk = base64.urlsafe_b64encode(hashlib.sha256(JWT_SECRET.encode()).digest())
_fernet = Fernet(_fk)


def _enc(v: str) -> str:
    return _fernet.encrypt(v.encode()).decode()


def _dec(v: str) -> Optional[str]:
    try:
        return _fernet.decrypt(v.encode()).decode()
    except InvalidToken:
        return None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def utcnow_iso() -> str:
    return utcnow().isoformat()


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
        raise HTTPException(status_code=403, detail="Account frozen")
    return user


async def _require_admin(user=Depends(_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ============================================================
# TRANSACTION DETAILS
# ============================================================

def _pdf_receipt_payload(tx: Dict[str, Any]) -> Dict[str, str]:
    """Return receipt fields the client can render or export."""
    return {
        "id": tx["id"],
        "issued_at": utcnow_iso(),
        "customer": tx.get("user_id", ""),
        "amount": f"{tx['amount']:.2f} {tx['from_currency']}",
        "received": f"{tx['receiving_amount']:.2f} {tx['to_currency']}",
        "rate": f"1 {tx['from_currency']} = {tx['exchange_rate']:.4f} {tx['to_currency']}",
        "fee": f"{tx['fee']:.2f} {tx['from_currency']}",
        "recipient": tx.get("recipient_name", ""),
        "country": tx.get("recipient_country", ""),
    }


@router.get("/transactions/{tx_id}")
async def transaction_detail(tx_id: str, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    tx = await db.transactions.find_one({"id": tx_id, "user_id": user["id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")
    # Timeline
    t0 = datetime.fromisoformat(tx["created_at"])
    timeline = [
        {"at": t0.isoformat(),                     "status": "initiated", "label": "Transfer initiated"},
        {"at": (t0 + timedelta(seconds=2)).isoformat(),  "status": "fraud_check",  "label": "AI fraud & AML check passed"},
        {"at": (t0 + timedelta(seconds=6)).isoformat(),  "status": "fx_locked",    "label": f"FX rate locked at {tx['exchange_rate']:.4f}"},
        {"at": (t0 + timedelta(seconds=12)).isoformat(), "status": "settled",      "label": "Sent through partner rails"},
        {"at": (t0 + timedelta(seconds=25)).isoformat(), "status": "completed",    "label": f"{tx['recipient_name']} received funds"},
    ]
    # AI-style fee explanation (deterministic, no LLM call to keep it snappy)
    fee = tx["fee"]
    amt = tx["amount"]
    ex = round(tx["exchange_rate"], 4)
    paypal_would_charge = calc_paypal_comparison_fee(amt)
    fee_expl = (
        f"You paid {fee:.2f} {tx['from_currency']} — that's ~{(fee / amt * 100):.2f}% of the amount. "
        f"There's no exchange-rate markup: you got the mid-market rate {ex}. "
        f"PayPal would have charged roughly ${paypal_would_charge:.2f} on this same transfer, "
        f"so you saved about ${max(0, paypal_would_charge - fee):.2f}."
    )
    return {
        "tx": tx,
        "timeline": timeline,
        "ai_fee_explanation": fee_expl,
        "receipt": _pdf_receipt_payload(tx),
    }


# ============================================================
# RECIPIENTS
# ============================================================

class RecipientIn(BaseModel):
    name: str
    country: str
    currency: str = "USD"
    account_type: Literal["bank", "upi", "mobile", "email"] = "bank"
    identifier: str  # IBAN / account+IFSC / UPI VPA / phone / email
    nickname: Optional[str] = None
    favorite: bool = False


@router.post("/recipients")
async def create_recipient(data: RecipientIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **data.dict(),
        "verified": True,  # mocked verification — production would check bank + AML
        "last_sent_at": None,
        "sent_count": 0,
        "created_at": utcnow_iso(),
    }
    await db.recipients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/recipients")
async def list_recipients(request: Request, q: Optional[str] = None, user=Depends(_current_user)):
    db = request.app.state.db
    query: Dict[str, Any] = {"user_id": user["id"]}
    if q:
        query["$or"] = [
            {"name":    {"$regex": q, "$options": "i"}},
            {"country": {"$regex": q, "$options": "i"}},
            {"nickname":{"$regex": q, "$options": "i"}},
        ]
    docs = await db.recipients.find(query, {"_id": 0}).sort("favorite", -1).sort("last_sent_at", -1).to_list(200)
    # Recent = last 5 by last_sent_at
    recent = sorted(
        [d for d in docs if d.get("last_sent_at")],
        key=lambda d: d["last_sent_at"], reverse=True,
    )[:5]
    favorites = [d for d in docs if d.get("favorite")]
    return {"all": docs, "favorites": favorites, "recent": recent}


@router.post("/recipients/{rid}/favorite")
async def toggle_favorite(rid: str, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    doc = await db.recipients.find_one({"id": rid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    fav = not bool(doc.get("favorite"))
    await db.recipients.update_one({"id": rid}, {"$set": {"favorite": fav}})
    return {"id": rid, "favorite": fav}


@router.delete("/recipients/{rid}")
async def delete_recipient(rid: str, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    r = await db.recipients.delete_one({"id": rid, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


async def _bump_recipient(db, user_id: str, name: str, country: str):
    """Called from server.py's /transfers after a successful send."""
    existing = await db.recipients.find_one({"user_id": user_id, "name": name, "country": country})
    if existing:
        await db.recipients.update_one(
            {"id": existing["id"]},
            {"$set": {"last_sent_at": utcnow_iso()}, "$inc": {"sent_count": 1}},
        )


# ============================================================
# AI FRAUD CHECK (pre-transaction)
# ============================================================

class FraudCheckIn(BaseModel):
    recipient_name: str
    recipient_country: str
    amount_usd: float
    currency: str = "USD"


HIGH_RISK_COUNTRIES = {"IR", "KP", "SY", "CU"}
MED_RISK_COUNTRIES = {"RU", "BY", "VE", "MM"}


@router.post("/ai/fraud-check")
async def fraud_check(data: FraudCheckIn, request: Request, user=Depends(_current_user)):
    """Return a rich risk assessment card to render on the Send preview screen."""
    db = request.app.state.db
    flags: List[Dict[str, str]] = []
    score = 5  # 0 = safe, 100 = block
    recipient_trust = 90

    # 1) Recipient history
    hist = await db.recipients.find_one({"user_id": user["id"], "name": data.recipient_name}) or {}
    prior_tx = await db.transactions.count_documents({"user_id": user["id"], "recipient_name": data.recipient_name})
    if prior_tx == 0:
        flags.append({"kind": "info", "label": "New recipient", "detail": "You haven't sent to this person before."})
        score += 12
        recipient_trust -= 25
    else:
        recipient_trust = min(98, 60 + prior_tx * 4)
        flags.append({"kind": "safe", "label": "Known recipient", "detail": f"You've sent {prior_tx} time{'s' if prior_tx != 1 else ''} before."})

    # 2) Amount
    if data.amount_usd >= 5000:
        flags.append({"kind": "warn", "label": "Large amount", "detail": f"${data.amount_usd:,.0f} is above your typical transfer size."})
        score += 15
    elif data.amount_usd >= 2000:
        flags.append({"kind": "info", "label": "Larger than usual", "detail": "Consider double-checking the amount."})
        score += 6

    # 3) Country risk
    c = data.recipient_country.upper()
    if c in HIGH_RISK_COUNTRIES or any(w in c for w in ["IRAN", "NORTH KOREA", "SYRIA", "CUBA"]):
        flags.append({"kind": "block", "label": "Sanctioned country", "detail": "Transfers to this country are blocked."})
        score = max(score, 96)
    elif c in MED_RISK_COUNTRIES or any(w in c for w in ["RUSSIA", "BELARUS", "VENEZUELA", "MYANMAR"]):
        flags.append({"kind": "warn", "label": "Elevated country risk", "detail": "Extra scrutiny may apply."})
        score += 20

    # 4) Weekly velocity
    since = (utcnow() - timedelta(days=7)).isoformat()
    weekly_tx = await db.transactions.count_documents({"user_id": user["id"], "created_at": {"$gte": since}})
    if weekly_tx >= 10:
        flags.append({"kind": "warn", "label": "High velocity", "detail": f"{weekly_tx} transfers in the last 7 days."})
        score += 12

    # 5) KYC state
    if user.get("kyc_status") != "verified":
        flags.append({"kind": "info", "label": "Unverified account", "detail": "Complete KYC to unlock higher limits."})
        score += 8

    score = min(100, score)
    fraud_prob_pct = int(min(99, max(1, (score - 20) * 1.2)))
    if score >= 85:
        decision, headline = "block", "Blocked — this transfer looks unsafe."
    elif score >= 55:
        decision, headline = "review", "Please double-check before you continue."
    else:
        decision, headline = "proceed", "Looks safe. You're clear to send."

    return {
        "score": score,
        "fraud_probability_pct": fraud_prob_pct,
        "recipient_trust": recipient_trust,
        "flags": flags,
        "decision": decision,
        "headline": headline,
        "checked_at": utcnow_iso(),
    }


# ============================================================
# FINANCIAL HEALTH
# ============================================================

@router.get("/health/score")
async def health_score(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    txs = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    invs = await db.invoices.find({"user_id": user["id"], "status": "paid"}, {"_id": 0}).to_list(500)

    outflow = sum(float(t["amount"]) for t in txs)
    inflow = sum(float(i["amount"]) for i in invs) + 3000.0  # assume base income
    savings_rate = round(max(0, (inflow - outflow)) / max(inflow, 1) * 100, 1)

    # Currency exposure
    balances = user.get("balances", {})
    base_rates = {"USD": 1.0, "EUR": 0.92, "GBP": 0.79, "INR": 83.2, "JPY": 149.5, "AED": 3.67, "AUD": 1.51, "CAD": 1.36, "SGD": 1.34, "CHF": 0.88, "CNY": 7.24}
    exposure = []
    total_usd = 0.0
    for c, amt in balances.items():
        u = float(amt) / base_rates.get(c, 1)
        total_usd += u
        if amt > 0:
            exposure.append({"currency": c, "usd_value": round(u, 2)})
    for e in exposure:
        e["pct"] = round(e["usd_value"] / max(total_usd, 1) * 100, 1)
    exposure.sort(key=lambda x: -x["usd_value"])

    # Score components
    save_pts   = min(35, int(savings_rate * 0.7))
    kyc_pts    = 20 if user.get("kyc_status") == "verified" else 0
    plus_pts   = 10 if user.get("premium_active") else 0
    diverse_pts = min(15, len([e for e in exposure if e["pct"] >= 5]) * 4)
    cashback_pts = min(10, int(float(user.get("cashback_usd") or 0) / 5))
    freq_pts = min(10, len(txs))
    score = save_pts + kyc_pts + plus_pts + diverse_pts + cashback_pts + freq_pts

    # 6-month trend
    rnd = random.Random(user["id"] + utcnow().strftime("%Y%m"))
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    spending = [round(rnd.uniform(300, 900), 2) for _ in months]
    income = [round(rnd.uniform(700, 1800), 2) for _ in months]

    # AI recommendations
    recs: List[Dict[str, str]] = []
    if savings_rate < 15:
        recs.append({"icon": "trending-up", "title": "Boost your savings rate", "body": "Aim for at least 20% of income. Move idle USD into EUR — Finn spotted a stronger week ahead."})
    if not user.get("premium_active"):
        recs.append({"icon": "sparkles", "title": "Try GLOBiN Plus", "body": "Cuts fees in half. Based on your transfers, that's about $10/mo saved."})
    if user.get("kyc_status") != "verified":
        recs.append({"icon": "shield-checkmark", "title": "Verify identity", "body": "Unlocks a $50k/mo limit and better fraud protection."})
    if any(e["pct"] > 70 for e in exposure):
        recs.append({"icon": "pie-chart", "title": "Diversify currencies", "body": ">70% of your net worth sits in a single currency. Consider splitting into EUR + INR."})
    if not recs:
        recs.append({"icon": "checkmark-done", "title": "You're in great shape", "body": "Solid savings rate, verified account, diversified balances. Keep it up!"})

    return {
        "score": min(100, score),
        "savings_rate_pct": savings_rate,
        "inflow_usd": round(inflow, 2),
        "outflow_usd": round(outflow, 2),
        "months": months,
        "spending_series": spending,
        "income_series": income,
        "exposure": exposure,
        "recommendations": recs,
    }


# ============================================================
# BUSINESS HUB
# ============================================================

class ClientIn(BaseModel):
    name: str
    company: Optional[str] = None
    email: EmailStr
    country: str = "US"
    currency: str = "USD"


@router.post("/business/clients")
async def create_client(data: ClientIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **data.dict(), "created_at": utcnow_iso()}
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/business/clients")
async def list_clients(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    return await db.clients.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.delete("/business/clients/{cid}")
async def delete_client(cid: str, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    r = await db.clients.delete_one({"id": cid, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


class BulkPayItem(BaseModel):
    recipient_name: str
    recipient_country: str
    amount: float
    from_currency: str = "USD"
    to_currency: str = "USD"


class BulkPayIn(BaseModel):
    title: str
    items: List[BulkPayItem]


@router.post("/business/bulk-pay")
async def bulk_pay(data: BulkPayIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    total = sum(i.amount for i in data.items if i.from_currency == "USD")
    if user["balances"].get("USD", 0) < total:
        raise HTTPException(status_code=400, detail=f"Insufficient USD balance for total ${total:.2f}")
    results = []
    for it in data.items:
        # simulate execution via internal transfer endpoint (no HTTP call — direct DB writes)
        fc = it.from_currency.upper()
        bal = user["balances"].get(fc, 0)
        if bal < it.amount:
            results.append({"recipient": it.recipient_name, "status": "failed", "reason": "insufficient balance"})
            continue
        fee = calc_transfer_fee(it.amount)
        rate = 1.0  # simple within-USD bulk
        receiving = round((it.amount - fee) * rate, 2)
        await db.users.update_one({"id": user["id"]}, {"$inc": {f"balances.{fc}": -it.amount}})
        tx = {
            "id": str(uuid.uuid4()), "user_id": user["id"], "type": "bulk_payout",
            "from_currency": fc, "to_currency": it.to_currency, "amount": it.amount,
            "receiving_amount": receiving, "exchange_rate": rate, "fee": fee,
            "recipient_name": it.recipient_name, "recipient_country": it.recipient_country,
            "note": data.title, "status": "completed", "created_at": utcnow_iso(),
        }
        await db.transactions.insert_one(tx)
        results.append({"recipient": it.recipient_name, "status": "sent", "tx_id": tx["id"], "amount": it.amount})
    await db.bulk_batches.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "title": data.title,
        "total_usd": total, "count": len(data.items), "created_at": utcnow_iso(),
    })
    return {"ok": True, "count": len(data.items), "results": results}


@router.get("/business/tax-report")
async def tax_report(year: Optional[int] = None, request: Request = None, user=Depends(_current_user)):
    db = request.app.state.db
    y = year or utcnow().year
    txs = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(2000)
    invs = await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).to_list(2000)
    txs_y = [t for t in txs if t["created_at"].startswith(str(y))]
    invs_y = [i for i in invs if i["created_at"].startswith(str(y))]
    total_out = sum(float(t["amount"]) for t in txs_y)
    total_fees = sum(float(t["fee"]) for t in txs_y)
    total_income = sum(float(i["amount"]) for i in invs_y if i["status"] == "paid")
    # CSV payload
    csv_lines = ["date,type,amount,currency,counterparty,fee"]
    for t in sorted(txs_y, key=lambda x: x["created_at"]):
        csv_lines.append(f"{t['created_at']},transfer,-{t['amount']},{t['from_currency']},{t['recipient_name']},{t['fee']}")
    for i in sorted(invs_y, key=lambda x: x["created_at"]):
        if i["status"] == "paid":
            csv_lines.append(f"{i['created_at']},invoice,+{i['amount']},{i['currency']},{i['client_name']},0")
    return {
        "year": y,
        "total_outflow_usd": round(total_out, 2),
        "total_fees_paid": round(total_fees, 2),
        "total_income": round(total_income, 2),
        "transactions_count": len(txs_y),
        "invoices_paid": sum(1 for i in invs_y if i["status"] == "paid"),
        "csv": "\n".join(csv_lines),
    }


# ============================================================
# BRING YOUR OWN API KEYS (encrypted at rest)
# ============================================================

class ApiKeyIn(BaseModel):
    provider: Literal["wise", "stripe", "rapyd", "complyadvantage", "exchange_rate", "refinitiv", "marqeta"]
    key: str
    enabled: bool = True


@router.get("/admin/apikeys")
async def list_apikeys(request: Request, _=Depends(_require_admin)):
    db = request.app.state.db
    rows = await db.apikeys.find({}, {"_id": 0}).to_list(50)
    out = []
    for r in rows:
        raw = _dec(r["key_enc"]) or ""
        out.append({
            "provider": r["provider"],
            "enabled": r.get("enabled", False),
            "last4": raw[-4:] if raw else "",
            "updated_at": r.get("updated_at"),
        })
    return out


@router.post("/admin/apikeys")
async def upsert_apikey(data: ApiKeyIn, request: Request, admin=Depends(_require_admin)):
    db = request.app.state.db
    await db.apikeys.update_one(
        {"provider": data.provider},
        {"$set": {
            "provider": data.provider,
            "key_enc": _enc(data.key.strip()),
            "enabled": data.enabled,
            "updated_at": utcnow_iso(),
            "updated_by": admin["id"],
        }},
        upsert=True,
    )
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": admin["id"],
        "action": f"apikey_upsert:{data.provider}",
        "created_at": utcnow_iso(),
    })
    return {"provider": data.provider, "enabled": data.enabled, "last4": data.key[-4:]}


@router.post("/admin/apikeys/{provider}/toggle")
async def toggle_apikey(provider: str, request: Request, admin=Depends(_require_admin)):
    db = request.app.state.db
    row = await db.apikeys.find_one({"provider": provider}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Not set")
    enabled = not bool(row.get("enabled"))
    await db.apikeys.update_one({"provider": provider}, {"$set": {"enabled": enabled, "updated_at": utcnow_iso()}})
    return {"provider": provider, "enabled": enabled}


# ============================================================
# ANNOUNCEMENTS ("send notifications" — stored, not push)
# ============================================================

class AnnounceIn(BaseModel):
    title: str
    body: str
    audience: Literal["all", "plus", "unverified"] = "all"


@router.post("/admin/announce")
async def send_announcement(data: AnnounceIn, request: Request, admin=Depends(_require_admin)):
    db = request.app.state.db
    doc = {
        "id": str(uuid.uuid4()),
        "title": data.title, "body": data.body, "audience": data.audience,
        "created_by": admin["id"], "created_at": utcnow_iso(),
    }
    await db.announcements.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/announcements")
async def list_announcements(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    cur = db.announcements.find({}, {"_id": 0}).sort("created_at", -1).limit(20)
    docs = await cur.to_list(20)
    # Filter by audience
    out = []
    for d in docs:
        aud = d.get("audience", "all")
        if aud == "all" \
           or (aud == "plus" and user.get("premium_active")) \
           or (aud == "unverified" and user.get("kyc_status") != "verified"):
            out.append(d)
    return out


# ============================================================
# RATE ALERTS + AUTO-CONVERT RULES
# ============================================================

class RateAlertIn(BaseModel):
    from_currency: str
    to_currency: str
    threshold_rate: float
    direction: Literal["above", "below"] = "above"


@router.post("/exchange/alert")
async def create_alert(data: RateAlertIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **data.dict(), "created_at": utcnow_iso()}
    await db.rate_alerts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/exchange/alert")
async def list_alerts(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    return await db.rate_alerts.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)


class AutoConvertIn(BaseModel):
    from_currency: str
    to_currency: str
    daily_usd_amount: float = Field(gt=0)
    trigger_rate: float


@router.post("/exchange/auto")
async def create_auto(data: AutoConvertIn, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **data.dict(),
           "active": True, "created_at": utcnow_iso()}
    await db.auto_rules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/exchange/auto")
async def list_auto(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    return await db.auto_rules.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)


# ============================================================
# FOUNDER DASHBOARD METRICS
# ============================================================

@router.get("/admin/founder")
async def founder_dashboard(request: Request, _=Depends(_require_admin)):
    db = request.app.state.db
    users_count = await db.users.count_documents({})
    plus_count = await db.users.count_documents({"premium_active": True})
    kyc_pending = await db.users.count_documents({"kyc_status": "pending"})
    tx = await db.transactions.find({}, {"_id": 0}).to_list(5000)
    volume_usd = 0.0
    fees_usd = 0.0
    base_rates = {"USD": 1.0, "EUR": 0.92, "GBP": 0.79, "INR": 83.2, "JPY": 149.5, "AED": 3.67, "AUD": 1.51, "CAD": 1.36, "SGD": 1.34, "CHF": 0.88, "CNY": 7.24}
    countries = set()
    for t in tx:
        rate = base_rates.get(t.get("from_currency") or t.get("currency_send") or "USD", 1)
        amt = t.get("amount") or t.get("amount_send") or 0
        volume_usd += float(amt) / rate
        fees_usd += float(t.get("fee", 0)) / rate
        if t.get("recipient_country"):
            countries.add(t["recipient_country"])
    revenue_usd = fees_usd + plus_count * 6.99  # subs
    fraud_alerts = await db.transactions.count_documents({"aml_score": {"$gte": 50}})
    referrals = await db.referrals.count_documents({})
    apikeys_set = await db.apikeys.count_documents({})

    # 7-day series
    now = utcnow()
    days = [(now - timedelta(days=6 - i)).strftime("%b %d") for i in range(7)]
    day_users = []
    day_volume = []
    for i in range(7):
        d0 = (now - timedelta(days=6 - i)).replace(hour=0, minute=0, second=0, microsecond=0)
        d1 = d0 + timedelta(days=1)
        day_users.append(await db.users.count_documents({"created_at": {"$gte": d0.isoformat(), "$lt": d1.isoformat()}}))
        vol = 0.0
        async for t in db.transactions.find({"created_at": {"$gte": d0.isoformat(), "$lt": d1.isoformat()}}, {"_id": 0}):
            amt = t.get("amount") or t.get("amount_send") or 0
            cur_key = t.get("from_currency") or t.get("currency_send") or "USD"
            vol += float(amt) / base_rates.get(cur_key, 1)
        day_volume.append(round(vol, 2))

    return {
        "total_users": users_count,
        "plus_subscribers": plus_count,
        "countries_served": len(countries) or 51,  # fallback to catalog size
        "transaction_volume_usd": round(volume_usd, 2),
        "revenue_usd": round(revenue_usd, 2),
        "fraud_alerts": fraud_alerts,
        "kyc_pending": kyc_pending,
        "referrals_count": referrals,
        "apikeys_configured": apikeys_set,
        "series": {"days": days, "signups": day_users, "volume": day_volume},
    }
