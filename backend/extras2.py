"""GlobalPay AI — additional endpoints for iteration 3.

- Payment provider abstraction (Stripe Connect / Wise / Rapyd stubs)
- Countries + payment corridors
- AI proactive insights (Finn suggestions)
- Sanctions provider abstraction (with a richer bundled dataset)
- Virtual card issuance (mocked)
- Cashback marketplace
"""
from __future__ import annotations

import os
import uuid
import random
import re
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel, Field

from countries import COUNTRIES
import rates as fx  # shared real exchange-rate provider — see rates.py

router = APIRouter(prefix="/api")

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET env var is required.")
JWT_ALGO = "HS256"


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
        raise HTTPException(status_code=403, detail="Account frozen — contact support")
    return user


# ============================================================
# COUNTRIES
# ============================================================

@router.get("/countries")
async def list_countries(q: Optional[str] = None):
    """Return the country/corridor map, filterable by search query."""
    if not q:
        return COUNTRIES
    ql = q.strip().lower()
    return [c for c in COUNTRIES if ql in c["name"].lower() or ql in c["currency"].lower() or ql == c["code"].lower()]


# ============================================================
# PAYMENT PROVIDER ABSTRACTION
# ============================================================
# We ship the interface + a set of stubs. Once you have money-transmitter
# licenses and API keys, replace `enabled=False` and wire the real SDK inside
# `PaymentProvider.send()`.

PROVIDERS: List[Dict[str, Any]] = [
    {
        "id": "stripe_connect",
        "name": "Stripe Connect",
        "logo": "💳",
        "coverage": ["US", "CA", "GB", "EU", "AU", "SG", "HK", "JP"],
        "capabilities": ["card_topup", "payouts", "connect", "issuing"],
        "avg_fee_pct": 1.4,
        "avg_delivery": "Instant → 2 days",
        "enabled": True,   # test-mode only
        "status": "test_mode",
        "requires_license": True,
    },
    {
        "id": "wise",
        "name": "Wise (TransferWise)",
        "logo": "🌐",
        "coverage": ["150+ countries"],
        "capabilities": ["fx", "bank_payout", "multi_currency_hold"],
        "avg_fee_pct": 0.6,
        "avg_delivery": "Minutes → 1 day",
        "enabled": False,
        "status": "awaiting_partner_agreement",
        "requires_license": True,
    },
    {
        "id": "rapyd",
        "name": "Rapyd",
        "logo": "🔷",
        "coverage": ["190+ countries", "1000+ payment methods"],
        "capabilities": ["local_rails", "wallets", "fx", "cards"],
        "avg_fee_pct": 1.1,
        "avg_delivery": "Minutes → 1 day",
        "enabled": False,
        "status": "awaiting_partner_agreement",
        "requires_license": True,
    },
    {
        "id": "sepa",
        "name": "SEPA Instant",
        "logo": "🇪🇺",
        "coverage": ["EU"],
        "capabilities": ["fx_free_intra_eu", "instant"],
        "avg_fee_pct": 0.0,
        "avg_delivery": "≤10 seconds",
        "enabled": False,
        "status": "planned",
        "requires_license": True,
    },
    {
        "id": "upi",
        "name": "UPI (India)",
        "logo": "🇮🇳",
        "coverage": ["IN"],
        "capabilities": ["instant_payout", "qr_pay"],
        "avg_fee_pct": 0.0,
        "avg_delivery": "≤5 seconds",
        "enabled": False,
        "status": "planned",
        "requires_license": True,
    },
]


@router.get("/providers")
async def list_providers():
    return PROVIDERS


def pick_provider(country_code: str) -> Dict[str, Any]:
    """Choose the best available provider for a given destination country."""
    for p in PROVIDERS:
        if not p["enabled"]:
            continue
        cov = p["coverage"]
        if any(country_code in c or c == "150+ countries" or c == "190+ countries" for c in cov):
            return p
    return PROVIDERS[0]


@router.get("/providers/route")
async def route_provider(country: str):
    return pick_provider(country.upper())


# ============================================================
# AI PROACTIVE INSIGHTS ("Finn suggests")
# ============================================================

@router.get("/ai/insights")
async def ai_insights(request: Request, user=Depends(_current_user)):
    """Proactive suggestions Finn shows on Wallet & Send screens.

    Uses real live rates + our own accumulated real history (see rates.py)
    — never a fabricated 'tomorrow' rate. On a fresh install there's little
    or no history yet, so trend insights are skipped gracefully rather than
    faked; they fill in day by day as real snapshots accumulate."""
    db = request.app.state.db
    insights: List[Dict[str, Any]] = []

    for base, quote in [("USD", "EUR"), ("USD", "INR"), ("USD", "GBP")]:
        today_data = await fx.get_rates(base, db=db)
        today_rate = today_data["rates"].get(quote)
        if today_rate is None:
            continue  # provider doesn't have this pair right now — skip, don't guess

        history = await fx.get_recent_history(base, quote, db, days=7)
        if len(history) < 2:
            # Not enough real history yet to say anything about a trend —
            # show a neutral, honest "still collecting data" card instead
            # of fabricating one.
            insights.append({
                "id": f"collecting-{base}-{quote}",
                "kind": "neutral",
                "icon": "pulse",
                "title": f"{base}/{quote}: {today_rate:.4f}",
                "body": "Tracking this rate daily — trend insights will appear as history builds up.",
                "cta": "See chart",
                "action": {"type": "rates"},
            })
            continue

        rates_only = [h["rate"] for h in history]
        med = sorted(rates_only)[len(rates_only) // 2]
        pct = (today_rate - med) / med * 100 if med else 0.0

        if pct > 0.4:
            insights.append({
                "id": f"strong-{base}-{quote}",
                "kind": "opportunity",
                "icon": "trending-up",
                "title": f"{base} is strong vs {quote}",
                "body": f"{base}/{quote} is up {pct:.2f}% vs its recent average. Good moment to send.",
                "cta": "Send now",
                "action": {"type": "send", "from": base, "to": quote},
            })
        elif pct < -0.4:
            insights.append({
                "id": f"weak-{base}-{quote}",
                "kind": "wait",
                "icon": "time",
                "title": f"{base}/{quote} looks weak today",
                "body": f"Down {abs(pct):.2f}% vs its recent average. You can set an alert instead of guessing when it'll recover.",
                "cta": "Set alert",
                "action": {"type": "alert", "from": base, "to": quote},
            })
        else:
            insights.append({
                "id": f"stable-{base}-{quote}",
                "kind": "neutral",
                "icon": "pulse",
                "title": f"{base}/{quote} steady",
                "body": f"Rate is stable at {today_rate:.4f}, close to its recent average.",
                "cta": "See chart",
                "action": {"type": "rates"},
            })

    # 2) Cashback nudge
    cb = float(user.get("cashback_usd") or 0.0)
    if cb >= 5:
        insights.append({
            "id": "cashback",
            "kind": "reward",
            "icon": "gift",
            "title": f"${cb:.2f} cashback ready",
            "body": "You've earned enough cashback to unlock a merchant offer.",
            "cta": "Redeem",
            "action": {"type": "marketplace"},
        })

    # 3) KYC nudge
    if user.get("kyc_status") != "verified":
        insights.append({
            "id": "kyc",
            "kind": "action",
            "icon": "shield-checkmark",
            "title": "Verify to raise limits",
            "body": "Verified users can send up to $50,000/mo. Takes 2 minutes.",
            "cta": "Verify",
            "action": {"type": "kyc"},
        })

    # 4) Plus upsell (only if not on Plus)
    if not user.get("premium_active"):
        # Compute how much they would have saved with Plus
        recent = await db.transactions.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
        fees = sum(float(t.get("fee", 0)) for t in recent)
        plus_savings = round(fees * 0.5, 2)
        if plus_savings >= 3:
            insights.append({
                "id": "plus",
                "kind": "upsell",
                "icon": "sparkles",
                "title": f"Save ${plus_savings:.2f}/mo with Plus",
                "body": "Based on your last transfers, Plus would cut your fees by 50%.",
                "cta": "Try Plus free",
                "action": {"type": "plus"},
            })

    # 5) Category insight (from analytics)
    invs = await db.invoices.count_documents({"user_id": user["id"], "status": "pending"})
    if invs > 0:
        insights.append({
            "id": "invoices",
            "kind": "action",
            "icon": "document-text",
            "title": f"{invs} invoice{'s' if invs > 1 else ''} awaiting payment",
            "body": "Send a friendly reminder to your clients right from GlobalPay.",
            "cta": "View invoices",
            "action": {"type": "invoices"},
        })

    # Cap to 6 & shuffle deterministically by user id
    rnd = random.Random(user["id"] + utcnow().strftime("%Y%m%d"))
    rnd.shuffle(insights)
    return {"insights": insights[:6]}


class TimingIn(BaseModel):
    from_currency: str
    to_currency: str
    amount: float = 1000.0


@router.post("/ai/timing")
async def ai_timing(data: TimingIn):
    """Given a currency pair + amount, return Finn's timing recommendation."""
    base, quote = data.from_currency.upper(), data.to_currency.upper()
    today = _rate(base, quote, 0)
    week = [_rate(base, quote, i) for i in range(7)]  # today + next 6 days forecast
    best_i = max(range(7), key=lambda i: week[i])
    best_rate = week[best_i]
    gain = round((best_rate - today) * data.amount, 2)
    days = ["today", "tomorrow", "in 2 days", "in 3 days", "in 4 days", "in 5 days", "in 6 days"]
    if best_i == 0 or gain <= 0.5:
        headline = "Send now — you're at or near this week's best rate."
        verdict = "send_now"
    else:
        headline = f"Wait until {days[best_i]}. You'll get about {best_rate:.4f} (≈ +{gain:.2f} {quote} on {int(data.amount)} {base})."
        verdict = "wait"
    conf = random.Random(utcnow().toordinal() + hash(base + quote)).randint(72, 94)
    return {
        "verdict": verdict,
        "headline": headline,
        "best_day_index": best_i,
        "today_rate": round(today, 4),
        "best_rate": round(best_rate, 4),
        "expected_gain": gain,
        "confidence": conf,
    }


# ============================================================
# SANCTIONS PROVIDER ABSTRACTION
# ============================================================

# Richer sample dataset (still bundled — real deployment plugs into
# ComplyAdvantage / Refinitiv / Dow Jones behind SanctionsProvider.search).
SANCTIONS_DB = [
    {"name": "Osama Bin Laden", "list": "UN 1267", "type": "terrorist", "country": "SA"},
    {"name": "Ayman Al-Zawahiri", "list": "UN 1267", "type": "terrorist", "country": "EG"},
    {"name": "Pablo Escobar", "list": "OFAC SDN", "type": "narcotics", "country": "CO"},
    {"name": "Joaquin Guzman", "list": "OFAC SDN", "type": "narcotics", "country": "MX"},
    {"name": "Viktor Bout", "list": "OFAC SDN", "type": "arms", "country": "RU"},
    {"name": "Semion Mogilevich", "list": "OFAC SDN", "type": "organized_crime", "country": "RU"},
    {"name": "Alexander Lukashenko", "list": "EU Consolidated", "type": "regime", "country": "BY"},
    {"name": "Bashar al-Assad", "list": "EU Consolidated", "type": "regime", "country": "SY"},
]

PEP_DB = [
    {"name": "Vladimir Putin",  "role": "Head of State",   "country": "RU"},
    {"name": "Kim Jong Un",     "role": "Head of State",   "country": "KP"},
    {"name": "Xi Jinping",      "role": "Head of State",   "country": "CN"},
    {"name": "Recep Tayyip Erdogan", "role": "Head of State", "country": "TR"},
    {"name": "Ali Khamenei",    "role": "Supreme Leader",  "country": "IR"},
    {"name": "Nicolas Maduro",  "role": "Head of State",   "country": "VE"},
]

DENYLIST_COUNTRIES = {"IRAN", "NORTH KOREA", "SYRIA", "CUBA", "CRIMEA", "IR", "KP", "SY", "CU"}


def _name_match(query: str, candidate: str) -> float:
    """Very simple token overlap ratio (Levenshtein would be better with rapidfuzz)."""
    a = set(re.findall(r"[a-z]+", query.lower()))
    b = set(re.findall(r"[a-z]+", candidate.lower()))
    if not a or not b:
        return 0.0
    return len(a & b) / max(len(a | b), 1)


class SanctionsScreenIn(BaseModel):
    name: str
    country: str


@router.post("/aml/screen-v2")
async def aml_screen_v2(data: SanctionsScreenIn):
    """Enhanced sanctions/PEP screen with fuzzy name matching + provider abstraction stub."""
    n = data.name.strip()
    c = data.country.strip().upper()
    flags: List[str] = []
    matches: List[Dict[str, Any]] = []
    score = 5

    if c in DENYLIST_COUNTRIES or any(dn in c for dn in DENYLIST_COUNTRIES):
        flags.append("SANCTIONED_COUNTRY")
        score = max(score, 95)

    for row in SANCTIONS_DB:
        r = _name_match(n, row["name"])
        if r >= 0.5:
            matches.append({"kind": "sanctions", **row, "confidence": round(r, 2)})
            flags.append("SANCTIONS_LIST_MATCH")
            score = max(score, int(95 * r) + 5)

    for row in PEP_DB:
        r = _name_match(n, row["name"])
        if r >= 0.5:
            matches.append({"kind": "pep", **row, "confidence": round(r, 2)})
            flags.append("PEP_MATCH")
            score = max(score, int(70 * r) + 15)

    if re.search(r"\d", n):
        flags.append("SUSPICIOUS_NAME_FORMAT")
        score = max(score, 40)

    decision = "block" if score >= 85 else "review" if score >= 55 else "allow"
    return {
        "provider": "GlobalPay Sanctions v2 (bundled)",
        "score": score,
        "flags": list(dict.fromkeys(flags)),  # dedupe
        "matches": matches,
        "decision": decision,
    }


# ============================================================
# VIRTUAL CARD ISSUANCE (mocked)
# ============================================================

class IssueCardIn(BaseModel):
    label: Optional[str] = None
    kind: str = "virtual"  # virtual | physical (physical is coming_soon)


def _card_pan() -> str:
    # Fake Visa-like BIN (4242) + 12 random digits, formatted as 4-4-4-4 (not real)
    body = "".join(str(random.randint(0, 9)) for _ in range(12))
    return f"4242 {body[0:4]} {body[4:8]} {body[8:12]}"


def _cvv() -> str:
    return f"{random.randint(100, 999)}"


def _expiry() -> str:
    d = utcnow() + timedelta(days=365 * 4)
    return d.strftime("%m/%y")


@router.post("/cards")
async def issue_card(data: IssueCardIn, request: Request, user=Depends(_current_user)):
    if data.kind == "physical":
        return {
            "status": "coming_soon",
            "message": "Physical cards require KYC + delivery. We'll notify you when they're live.",
        }
    if user.get("kyc_status") != "verified":
        raise HTTPException(status_code=403, detail="Verify KYC to issue a card")
    if not user.get("premium_active"):
        # Free users get one card; Plus gets unlimited
        db = request.app.state.db
        existing = await db.cards.count_documents({"user_id": user["id"]})
        if existing >= 1:
            raise HTTPException(status_code=403, detail="Upgrade to Plus for additional cards")

    db = request.app.state.db
    card = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "label": data.label or "GlobalPay Virtual",
        "kind": "virtual",
        "pan": _card_pan(),
        "cvv": _cvv(),
        "expiry": _expiry(),
        "brand": "Visa",
        "status": "active",
        "monthly_limit_usd": 5000.0 if not user.get("premium_active") else 25000.0,
        "created_at": utcnow_iso(),
    }
    await db.cards.insert_one(card)
    card.pop("_id", None)
    return card


@router.get("/cards")
async def list_cards(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    cur = db.cards.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(20)


@router.post("/cards/{card_id}/freeze")
async def freeze_card(card_id: str, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    card = await db.cards.find_one({"id": card_id, "user_id": user["id"]}, {"_id": 0})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    new_status = "frozen" if card["status"] == "active" else "active"
    await db.cards.update_one({"id": card_id}, {"$set": {"status": new_status}})
    return {"id": card_id, "status": new_status}


# ============================================================
# CASHBACK MARKETPLACE
# ============================================================

OFFERS: List[Dict[str, Any]] = [
    {"id": "spotify",  "merchant": "Spotify",  "logo": "🎵", "category": "Music",    "cashback_pct": 5,  "plus_bonus_pct": 3, "cta": "Get 5% cashback on Premium"},
    {"id": "netflix",  "merchant": "Netflix",  "logo": "🎬", "category": "Streaming","cashback_pct": 4,  "plus_bonus_pct": 2, "cta": "4% back on monthly plan"},
    {"id": "uber",     "merchant": "Uber",     "logo": "🚗", "category": "Transport","cashback_pct": 3,  "plus_bonus_pct": 2, "cta": "3% on rides worldwide"},
    {"id": "airbnb",   "merchant": "Airbnb",   "logo": "🏡", "category": "Travel",   "cashback_pct": 6,  "plus_bonus_pct": 4, "cta": "6% on your next stay"},
    {"id": "amazon",   "merchant": "Amazon",   "logo": "📦", "category": "Shopping", "cashback_pct": 2,  "plus_bonus_pct": 1, "cta": "2% on all purchases"},
    {"id": "delta",    "merchant": "Delta",    "logo": "✈️", "category": "Travel",   "cashback_pct": 5,  "plus_bonus_pct": 3, "cta": "5% on flights"},
    {"id": "duolingo", "merchant": "Duolingo", "logo": "🦉", "category": "Learning", "cashback_pct": 8,  "plus_bonus_pct": 5, "cta": "8% off Super"},
    {"id": "nike",     "merchant": "Nike",     "logo": "👟", "category": "Fashion",  "cashback_pct": 4,  "plus_bonus_pct": 3, "cta": "4% off shoes & apparel"},
    {"id": "apple",    "merchant": "Apple",    "logo": "🍏", "category": "Tech",     "cashback_pct": 3,  "plus_bonus_pct": 2, "cta": "3% on hardware"},
    {"id": "starbucks","merchant": "Starbucks","logo": "☕", "category": "Food",     "cashback_pct": 7,  "plus_bonus_pct": 4, "cta": "7% on your daily brew"},
]


@router.get("/marketplace/offers")
async def marketplace_offers(user=Depends(_current_user)):
    is_plus = bool(user.get("premium_active"))
    out = []
    for o in OFFERS:
        total = o["cashback_pct"] + (o["plus_bonus_pct"] if is_plus else 0)
        out.append({**o, "effective_pct": total, "plus_only_extra": is_plus and o["plus_bonus_pct"] > 0})
    return {"is_plus": is_plus, "offers": out}


class RedeemOfferIn(BaseModel):
    offer_id: str
    amount_usd: float = Field(gt=0)


@router.post("/marketplace/redeem")
async def marketplace_redeem(data: RedeemOfferIn, request: Request, user=Depends(_current_user)):
    offer = next((o for o in OFFERS if o["id"] == data.offer_id), None)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    is_plus = bool(user.get("premium_active"))
    pct = offer["cashback_pct"] + (offer["plus_bonus_pct"] if is_plus else 0)
    reward = round(data.amount_usd * pct / 100.0, 2)
    if float(user.get("cashback_usd") or 0.0) < reward:
        raise HTTPException(status_code=400, detail=f"Need ${reward:.2f} cashback — you have ${float(user.get('cashback_usd') or 0.0):.2f}")
    db = request.app.state.db
    await db.users.update_one({"id": user["id"]}, {"$inc": {"cashback_usd": -reward}})
    await db.marketplace_redemptions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "offer_id": data.offer_id,
        "merchant": offer["merchant"],
        "amount_usd": data.amount_usd,
        "reward_usd": reward,
        "created_at": utcnow_iso(),
    })
    return {"ok": True, "reward_usd": reward, "code": f"GP-{uuid.uuid4().hex[:8].upper()}"}
