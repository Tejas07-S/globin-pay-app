"""GLOBiN pay — Payment Methods & country-aware banking APIs.

Provides:
- User's own Payment Methods (bank, UPI, wallet, card) with linking/manual/verify
- Country-aware field schemas (India / US / UK / Germany / France / EU / Australia / Canada / Singapore / UAE …)
- Micro-deposit verification (simulated) + Plaid / Setu feature flags for future
- Withdrawals: cash-out wallet balance to a verified payment method
- Finn AI term-explainer (IFSC / IBAN / SWIFT / Routing / BSB / BIC / VPA …)
- Enhanced recipient creation reusing the same country schema
"""
from __future__ import annotations

import os
import re
import uuid
import random
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Literal

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel, Field

from countries import COUNTRIES as ALL_COUNTRIES

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET env var is required.")
JWT_ALGO = "HS256"

# Feature flags — future third-party integrations
USE_PLAID = os.environ.get("USE_PLAID", "false").lower() == "true"
USE_SETU  = os.environ.get("USE_SETU",  "false").lower() == "true"

router = APIRouter(prefix="/api")


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = request.app.state.db
    user = await db.users.find_one(
        {"id": payload["sub"]}, {"_id": 0, "password": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("frozen"):
        raise HTTPException(status_code=403, detail="Account frozen")
    return user


# ============================================================
# COUNTRY SCHEMAS  (single source of truth for both payment methods + recipients)
# ============================================================

COUNTRY_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "IN": {
        "name": "India", "flag": "🇮🇳", "currency": "INR",
        "domestic": {"method_type": "upi", "label": "UPI"},
        "methods": [
            {
                "type": "upi", "label": "UPI ID",
                "icon": "phone-portrait-outline",
                "fields": [
                    {"key": "vpa", "label": "UPI ID / VPA", "placeholder": "yourname@ybl",
                     "help": "Your Virtual Payment Address, e.g. 9876543210@upi or tejas@okhdfc",
                     "min": 4, "max": 60, "auto": "lower"},
                ],
            },
            {
                "type": "bank", "label": "Bank account",
                "icon": "business-outline",
                "fields": [
                    {"key": "account", "label": "Account number", "placeholder": "123456789012",
                     "keyboard": "number-pad", "min": 9, "max": 18,
                     "help": "9–18 digit bank account number"},
                    {"key": "ifsc", "label": "IFSC code", "placeholder": "HDFC0001234",
                     "auto": "upper", "min": 11, "max": 11,
                     "help": "11-character branch code (4 letters + 0 + 6 alphanumerics)"},
                ],
            },
        ],
    },
    "US": {
        "name": "United States", "flag": "🇺🇸", "currency": "USD",
        "domestic": {"method_type": "bank", "label": "ACH"},
        "methods": [{
            "type": "bank", "label": "US bank account", "icon": "business-outline",
            "fields": [
                {"key": "routing", "label": "Routing number (ABA)", "placeholder": "021000021",
                 "keyboard": "number-pad", "min": 9, "max": 9,
                 "help": "9-digit routing number on the bottom-left of your check"},
                {"key": "account", "label": "Account number", "placeholder": "1234567890",
                 "keyboard": "number-pad", "min": 4, "max": 17},
                {"key": "account_type", "label": "Account type", "select":
                    [{"value": "checking", "label": "Checking"},
                     {"value": "savings",  "label": "Savings"}], "default": "checking"},
            ],
        }],
    },
    "GB": {
        "name": "United Kingdom", "flag": "🇬🇧", "currency": "GBP",
        "domestic": {"method_type": "bank", "label": "Faster Payments"},
        "methods": [{
            "type": "bank", "label": "UK bank account", "icon": "business-outline",
            "fields": [
                {"key": "sort_code", "label": "Sort code", "placeholder": "12-34-56",
                 "keyboard": "number-pad", "min": 6, "max": 8,
                 "help": "6-digit branch code, formatted XX-XX-XX"},
                {"key": "account", "label": "Account number", "placeholder": "12345678",
                 "keyboard": "number-pad", "min": 8, "max": 8},
            ],
        }],
    },
    "DE": {
        "name": "Germany", "flag": "🇩🇪", "currency": "EUR",
        "domestic": {"method_type": "bank", "label": "SEPA"},
        "methods": [{
            "type": "bank", "label": "SEPA account (IBAN + BIC)", "icon": "business-outline",
            "fields": [
                {"key": "iban", "label": "IBAN", "placeholder": "DE89 3704 0044 0532 0130 00",
                 "auto": "upper", "min": 22, "max": 34,
                 "help": "22-char German IBAN starting with DE"},
                {"key": "bic",  "label": "BIC / SWIFT", "placeholder": "COBADEFFXXX",
                 "auto": "upper", "min": 8, "max": 11,
                 "help": "8 or 11 char bank identifier code"},
            ],
        }],
    },
    "FR": {
        "name": "France", "flag": "🇫🇷", "currency": "EUR",
        "domestic": {"method_type": "bank", "label": "SEPA"},
        "methods": [{
            "type": "bank", "label": "SEPA account (IBAN)", "icon": "business-outline",
            "fields": [
                {"key": "iban", "label": "IBAN", "placeholder": "FR76 3000 4000 03…",
                 "auto": "upper", "min": 14, "max": 34,
                 "help": "Your International Bank Account Number"},
            ],
        }],
    },
    "ES": {
        "name": "Spain", "flag": "🇪🇸", "currency": "EUR",
        "domestic": {"method_type": "bank", "label": "SEPA"},
        "methods": [{
            "type": "bank", "label": "SEPA account (IBAN)", "icon": "business-outline",
            "fields": [
                {"key": "iban", "label": "IBAN", "placeholder": "ES91 2100 0418 45…",
                 "auto": "upper", "min": 14, "max": 34},
            ],
        }],
    },
    "AU": {
        "name": "Australia", "flag": "🇦🇺", "currency": "AUD",
        "domestic": {"method_type": "bank", "label": "PayID"},
        "methods": [{
            "type": "bank", "label": "AU bank account", "icon": "business-outline",
            "fields": [
                {"key": "bsb", "label": "BSB code", "placeholder": "123-456",
                 "keyboard": "number-pad", "min": 6, "max": 7,
                 "help": "6-digit Bank-State-Branch code"},
                {"key": "account", "label": "Account number", "placeholder": "12345678",
                 "keyboard": "number-pad", "min": 6, "max": 10},
            ],
        }],
    },
    "CA": {
        "name": "Canada", "flag": "🇨🇦", "currency": "CAD",
        "domestic": {"method_type": "bank", "label": "Interac"},
        "methods": [{
            "type": "bank", "label": "CA bank account", "icon": "business-outline",
            "fields": [
                {"key": "transit", "label": "Transit number", "placeholder": "12345",
                 "keyboard": "number-pad", "min": 5, "max": 5},
                {"key": "institution", "label": "Institution number", "placeholder": "003",
                 "keyboard": "number-pad", "min": 3, "max": 3},
                {"key": "account", "label": "Account number", "keyboard": "number-pad",
                 "min": 4, "max": 12},
            ],
        }],
    },
    "SG": {
        "name": "Singapore", "flag": "🇸🇬", "currency": "SGD",
        "domestic": {"method_type": "bank", "label": "FAST"},
        "methods": [{
            "type": "bank", "label": "SG bank account", "icon": "business-outline",
            "fields": [
                {"key": "bank_code", "label": "Bank code", "keyboard": "number-pad",
                 "min": 4, "max": 7, "help": "Bank code (DBS 7171, OCBC 7339, UOB 7375, etc.)"},
                {"key": "account", "label": "Account number", "keyboard": "number-pad"},
            ],
        }],
    },
    "AE": {
        "name": "United Arab Emirates", "flag": "🇦🇪", "currency": "AED",
        "domestic": {"method_type": "bank", "label": "Bank Transfer"},
        "methods": [{
            "type": "bank", "label": "UAE bank (IBAN)", "icon": "business-outline",
            "fields": [
                {"key": "iban", "label": "IBAN", "placeholder": "AE07 0331 2345 6789…",
                 "auto": "upper", "min": 23, "max": 23,
                 "help": "23-character UAE IBAN"},
            ],
        }],
    },
    "JP": {
        "name": "Japan", "flag": "🇯🇵", "currency": "JPY",
        "domestic": {"method_type": "bank", "label": "Zengin"},
        "methods": [{
            "type": "bank", "label": "JP bank account", "icon": "business-outline",
            "fields": [
                {"key": "bank_code",   "label": "Bank code",   "keyboard": "number-pad", "min": 4, "max": 4},
                {"key": "branch_code", "label": "Branch code", "keyboard": "number-pad", "min": 3, "max": 3},
                {"key": "account",     "label": "Account number", "keyboard": "number-pad"},
            ],
        }],
    },
}


# Popular banks per country — used by the "Link bank securely" flow (mocked)
POPULAR_BANKS: Dict[str, List[Dict[str, str]]] = {
    "IN": [
        {"slug": "sbi",   "name": "State Bank of India"},
        {"slug": "hdfc",  "name": "HDFC Bank"},
        {"slug": "icici", "name": "ICICI Bank"},
        {"slug": "axis",  "name": "Axis Bank"},
        {"slug": "kotak", "name": "Kotak Mahindra"},
        {"slug": "pnb",   "name": "Punjab National Bank"},
    ],
    "US": [
        {"slug": "chase",   "name": "Chase"},
        {"slug": "bofa",    "name": "Bank of America"},
        {"slug": "wells",   "name": "Wells Fargo"},
        {"slug": "citi",    "name": "Citibank"},
        {"slug": "us-bank", "name": "US Bank"},
        {"slug": "pnc",     "name": "PNC Bank"},
    ],
    "GB": [
        {"slug": "barclays", "name": "Barclays"},
        {"slug": "hsbc",     "name": "HSBC UK"},
        {"slug": "lloyds",   "name": "Lloyds Bank"},
        {"slug": "natwest",  "name": "NatWest"},
        {"slug": "monzo",    "name": "Monzo"},
        {"slug": "revolut",  "name": "Revolut"},
    ],
    "DE": [
        {"slug": "deutsche", "name": "Deutsche Bank"},
        {"slug": "commerz",  "name": "Commerzbank"},
        {"slug": "n26",      "name": "N26"},
        {"slug": "sparkass", "name": "Sparkasse"},
    ],
    "FR": [
        {"slug": "bnp",       "name": "BNP Paribas"},
        {"slug": "societe",   "name": "Société Générale"},
        {"slug": "credit-ag", "name": "Crédit Agricole"},
        {"slug": "lcl",       "name": "LCL"},
    ],
    "AU": [
        {"slug": "cba",     "name": "Commonwealth Bank"},
        {"slug": "westpac", "name": "Westpac"},
        {"slug": "anz",     "name": "ANZ"},
        {"slug": "nab",     "name": "NAB"},
    ],
    "CA": [
        {"slug": "rbc",       "name": "RBC Royal Bank"},
        {"slug": "td",        "name": "TD Bank"},
        {"slug": "scotia",    "name": "Scotiabank"},
        {"slug": "bmo",       "name": "BMO"},
    ],
    "SG": [
        {"slug": "dbs",  "name": "DBS Bank"},
        {"slug": "ocbc", "name": "OCBC Bank"},
        {"slug": "uob",  "name": "UOB"},
    ],
    "AE": [
        {"slug": "enbd", "name": "Emirates NBD"},
        {"slug": "adcb", "name": "ADCB"},
        {"slug": "mashreq", "name": "Mashreq"},
    ],
    "JP": [
        {"slug": "mufg",     "name": "MUFG Bank"},
        {"slug": "smbc",     "name": "SMBC"},
        {"slug": "mizuho",   "name": "Mizuho Bank"},
    ],
}


# ============================================================
# GET country schemas / bank lists
# ============================================================

_COUNTRIES_BY_CODE = {c["code"]: c for c in ALL_COUNTRIES}


def _generic_schema(code: str) -> Dict[str, Any]:
    """Fallback for any onboarding-supported country (see countries.py) that
    doesn't have a bespoke field schema above yet. Same shape as the bespoke
    ones so the frontend never has to know the difference — adding a real
    schema for a new country later is a backend-only change."""
    c = _COUNTRIES_BY_CODE.get(code)
    if not c:
        return None
    return {
        "name": c["name"], "flag": c["flag"], "currency": c["currency"],
        "domestic": {"method_type": "bank", "label": "Bank Transfer"},
        "methods": [{
            "type": "bank", "label": "Bank account", "icon": "business-outline",
            "fields": [
                {"key": "bank_name", "label": "Bank name", "placeholder": "e.g. First National Bank"},
                {"key": "account", "label": "Account number", "keyboard": "number-pad",
                 "min": 4, "max": 20},
            ],
        }],
    }


def _schema_for(code: str) -> Dict[str, Any]:
    return COUNTRY_SCHEMAS.get(code) or _generic_schema(code)


@router.get("/countries/schema")
async def all_country_schemas():
    """Return every supported country with its fields + popular banks."""
    out = []
    for code, s in COUNTRY_SCHEMAS.items():
        out.append({
            "code": code,
            "name": s["name"],
            "flag": s["flag"],
            "currency": s["currency"],
            "domestic": s.get("domestic", {"method_type": "bank", "label": "Bank Transfer"}),
            "methods": s["methods"],
            "popular_banks": POPULAR_BANKS.get(code, []),
        })
    return {"countries": sorted(out, key=lambda x: x["name"]),
            "flags": {"plaid": USE_PLAID, "setu": USE_SETU}}


@router.get("/countries/{code}/schema")
async def country_schema(code: str):
    code = code.upper()
    s = _schema_for(code)
    if not s:
        raise HTTPException(status_code=404, detail="Unknown country code")
    return {
        "code": code,
        "name": s["name"], "flag": s["flag"], "currency": s["currency"],
        "domestic": s.get("domestic", {"method_type": "bank", "label": "Bank Transfer"}),
        "methods": s["methods"],
        "popular_banks": POPULAR_BANKS.get(code, []),
        "flags": {"plaid": USE_PLAID, "setu": USE_SETU},
    }


# ============================================================
# HELPERS
# ============================================================

def _mask_identifier(country: str, method_type: str, details: Dict[str, str]) -> str:
    """Return a masked display string like `SBI •••• 1234` for UI."""
    if method_type == "upi":
        vpa = (details.get("vpa") or "").lower()
        if "@" in vpa:
            u, h = vpa.split("@", 1)
            return f"{u[:2]}•••@{h}"
        return vpa
    for key in ("account", "iban"):
        val = details.get(key)
        if val:
            v = "".join(ch for ch in val if ch.isalnum())
            return "•••• " + v[-4:] if len(v) >= 4 else v
    return "linked"


def _last4(details: Dict[str, str]) -> str:
    for key in ("account", "iban", "vpa"):
        val = details.get(key)
        if val:
            v = "".join(ch for ch in val if ch.isalnum())
            return v[-4:]
    return "----"


def _validate_details(country: str, method_type: str, details: Dict[str, Any]) -> None:
    if country not in COUNTRY_SCHEMAS:
        raise HTTPException(status_code=400, detail=f"Country {country} not supported")
    methods = COUNTRY_SCHEMAS[country]["methods"]
    method = next((m for m in methods if m["type"] == method_type), None)
    if not method:
        raise HTTPException(status_code=400,
            detail=f"Method '{method_type}' not available for {country}")
    for f in method["fields"]:
        if f.get("select"):
            continue
        v = str(details.get(f["key"], "")).strip()
        if not v:
            raise HTTPException(status_code=400, detail=f"{f['label']} is required")
        if "min" in f and len(re.sub(r"\s|-", "", v)) < f["min"]:
            raise HTTPException(status_code=400,
                detail=f"{f['label']} is too short (min {f['min']} chars)")


def _finn_micro_deposits(seed: str) -> List[float]:
    """Deterministic 2 micro-deposits between 0.01 and 0.99 for verification."""
    h = hashlib.sha256(seed.encode()).digest()
    a = 0.05 + (h[0] % 90) / 100  # 0.05 – 0.95
    b = 0.05 + (h[1] % 90) / 100
    if abs(a - b) < 0.05:
        b = (b + 0.20) if b < 0.79 else (b - 0.20)
    return [round(a, 2), round(b, 2)]


# ============================================================
# PAYMENT METHODS  (user's own)
# ============================================================

class PaymentMethodIn(BaseModel):
    country: str
    method_type: Literal["bank", "upi", "wallet", "card"]
    holder_name: str
    bank_slug: Optional[str] = None
    bank_name: Optional[str] = None
    nickname: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    linked_via: Literal["manual", "link", "cheque_scan"] = "manual"


@router.post("/payment-methods")
async def create_payment_method(data: PaymentMethodIn, request: Request,
                                user=Depends(_current_user)):
    db = request.app.state.db
    country = data.country.upper()
    _validate_details(country, data.method_type, data.details)
    schema = COUNTRY_SCHEMAS[country]
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "country": country,
        "currency": schema["currency"],
        "flag": schema["flag"],
        "method_type": data.method_type,
        "holder_name": data.holder_name,
        "bank_slug": data.bank_slug,
        "bank_name": data.bank_name,
        "nickname": (data.nickname or _default_nickname(data)),
        "details": data.details,             # NOTE: production would encrypt/tokenize
        "display": _mask_identifier(country, data.method_type, data.details),
        "last4": _last4(data.details),
        "linked_via": data.linked_via,
        "verified": data.linked_via == "link",  # instant-link is pre-verified in mock
        "verification_method": ("plaid_mock" if data.linked_via == "link" else "micro_deposit"),
        "is_default": False,
        "created_at": utcnow_iso(),
    }
    # If user has no default yet, promote this one
    existing_default = await db.payment_methods.find_one(
        {"user_id": user["id"], "is_default": True}
    )
    if not existing_default:
        doc["is_default"] = True
    await db.payment_methods.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("details", None)  # never return raw details to client after create
    return doc


def _default_nickname(data: PaymentMethodIn) -> str:
    if data.bank_name:
        return f"{data.bank_name} {data.method_type.capitalize()}"
    if data.method_type == "upi":
        return "UPI"
    return f"{data.country} {data.method_type.capitalize()}"


@router.get("/payment-methods")
async def list_payment_methods(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    cur = db.payment_methods.find(
        {"user_id": user["id"]},
        {"_id": 0, "details": 0, "user_id": 0},
    ).sort([("is_default", -1), ("created_at", -1)])
    docs = await cur.to_list(200)
    return {"methods": docs, "flags": {"plaid": USE_PLAID, "setu": USE_SETU}}


@router.post("/payment-methods/{pid}/verify-init")
async def verify_init(pid: str, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    m = await db.payment_methods.find_one({"id": pid, "user_id": user["id"]})
    if not m:
        raise HTTPException(status_code=404, detail="Payment method not found")
    if m.get("verified"):
        return {"already_verified": True}
    amounts = _finn_micro_deposits(pid + user["id"])
    await db.payment_methods.update_one(
        {"id": pid},
        {"$set": {
            "verification_amounts": amounts,
            "verification_started_at": utcnow_iso(),
            "verification_method": "micro_deposit",
        }},
    )
    return {
        "ok": True,
        "message": (
            "We've sent 2 small deposits (under $1 each) to your account. "
            "They usually arrive within 1–2 business days. Come back and enter the exact amounts to finish verification."
        ),
        "demo_hint": f"For this demo the amounts are {amounts[0]} and {amounts[1]}",
    }


class VerifyIn(BaseModel):
    amounts: List[float]


@router.post("/payment-methods/{pid}/verify")
async def verify_confirm(pid: str, data: VerifyIn, request: Request,
                          user=Depends(_current_user)):
    db = request.app.state.db
    m = await db.payment_methods.find_one({"id": pid, "user_id": user["id"]})
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    if m.get("verified"):
        return {"verified": True}
    expected = sorted(m.get("verification_amounts") or [])
    given = sorted([round(float(x), 2) for x in data.amounts])
    if given != expected:
        raise HTTPException(status_code=400,
            detail="Amounts don't match. Please check your statement and try again.")
    await db.payment_methods.update_one(
        {"id": pid},
        {"$set": {"verified": True, "verified_at": utcnow_iso()}},
    )
    return {"verified": True}


@router.post("/payment-methods/{pid}/default")
async def set_default(pid: str, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    m = await db.payment_methods.find_one({"id": pid, "user_id": user["id"]})
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    await db.payment_methods.update_many(
        {"user_id": user["id"]}, {"$set": {"is_default": False}}
    )
    await db.payment_methods.update_one({"id": pid}, {"$set": {"is_default": True}})
    return {"ok": True, "default_id": pid}


class NicknameIn(BaseModel):
    nickname: str


@router.post("/payment-methods/{pid}/nickname")
async def rename(pid: str, data: NicknameIn, request: Request,
                 user=Depends(_current_user)):
    db = request.app.state.db
    r = await db.payment_methods.update_one(
        {"id": pid, "user_id": user["id"]}, {"$set": {"nickname": data.nickname[:40]}}
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True, "nickname": data.nickname[:40]}


@router.delete("/payment-methods/{pid}")
async def delete_pm(pid: str, request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    m = await db.payment_methods.find_one({"id": pid, "user_id": user["id"]})
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    await db.payment_methods.delete_one({"id": pid})
    # Promote another as default if we removed the default
    if m.get("is_default"):
        nxt = await db.payment_methods.find_one({"user_id": user["id"]})
        if nxt:
            await db.payment_methods.update_one(
                {"id": nxt["id"]}, {"$set": {"is_default": True}}
            )
    return {"ok": True}


# ============================================================
# LINK BANK (mocked Plaid/Setu — feature-flagged)
# ============================================================

class LinkBankIn(BaseModel):
    country: str
    bank_slug: str
    bank_name: str
    holder_name: str
    # In a real integration these come from a webview redirect after user
    # signs into their bank. For now we simulate.
    mock_last4: Optional[str] = None
    mock_currency: Optional[str] = None


@router.post("/payment-methods/link")
async def link_bank(data: LinkBankIn, request: Request, user=Depends(_current_user)):
    """
    Simulated bank-link flow. Returns an already-verified payment method.
    When Plaid/Setu keys are available, this endpoint will exchange the
    public_token via the real integration instead of generating mock digits.
    """
    country = data.country.upper()
    if country not in COUNTRY_SCHEMAS:
        raise HTTPException(status_code=400, detail="Country not supported")

    # Auto-generate deterministic mocked details for the country schema
    seed = hashlib.sha256(f"{user['id']}-{data.bank_slug}".encode()).digest()
    schema = COUNTRY_SCHEMAS[country]
    method_type = "bank" if country != "IN" else "bank"
    method_schema = next(m for m in schema["methods"] if m["type"] == method_type)
    details: Dict[str, str] = {}
    for f in method_schema["fields"]:
        if f.get("select"):
            details[f["key"]] = f.get("default", f["select"][0]["value"])
            continue
        k = f["key"]
        # Generate mock value
        if k == "account":
            details[k] = "".join(str(seed[i] % 10) for i in range(0, 10))
        elif k == "routing":
            details[k] = "0210000" + str(seed[0] % 10) + str(seed[1] % 10)
        elif k == "sort_code":
            details[k] = f"{seed[0]%99:02d}-{seed[1]%99:02d}-{seed[2]%99:02d}"
        elif k == "iban":
            code_prefix = country
            details[k] = f"{code_prefix}89370400440532013000"[:22]
        elif k == "bic":
            details[k] = "COBADEFFXXX"
        elif k == "ifsc":
            details[k] = f"{data.bank_slug.upper()[:4]:>4}".replace(" ", "X") + "0" + "".join(
                str(seed[i] % 10) for i in range(3, 9)
            )
        elif k == "bsb":
            details[k] = f"{seed[0]%999:03d}-{seed[1]%999:03d}"
        elif k in ("transit", "institution", "bank_code", "branch_code"):
            details[k] = "".join(str(seed[i] % 10) for i in range(0, f.get("min", 3)))

    return await create_payment_method(
        PaymentMethodIn(
            country=country,
            method_type=method_type,
            holder_name=data.holder_name,
            bank_slug=data.bank_slug,
            bank_name=data.bank_name,
            details=details,
            linked_via="link",
        ),
        request, user,
    )


# ============================================================
# WITHDRAWALS  (wallet balance → payment method)
# ============================================================

class WithdrawIn(BaseModel):
    payment_method_id: str
    amount: float = Field(gt=0)
    currency: str = "USD"
    note: Optional[str] = None


@router.post("/withdrawals")
async def create_withdrawal(data: WithdrawIn, request: Request,
                             user=Depends(_current_user)):
    db = request.app.state.db
    m = await db.payment_methods.find_one(
        {"id": data.payment_method_id, "user_id": user["id"]}
    )
    if not m:
        raise HTTPException(status_code=404, detail="Payment method not found")
    if not m.get("verified"):
        raise HTTPException(status_code=400, detail="Payment method not yet verified")

    balances = user.get("balances", {})
    cur = data.currency.upper()
    if balances.get(cur, 0) < data.amount:
        raise HTTPException(status_code=400,
            detail=f"Insufficient {cur} balance (have {balances.get(cur,0):.2f})")

    # Deduct wallet immediately
    await db.users.update_one(
        {"id": user["id"]},
        {"$inc": {f"balances.{cur}": -data.amount}},
    )
    tx_id = str(uuid.uuid4())
    doc = {
        "id": tx_id,
        "user_id": user["id"],
        "payment_method_id": m["id"],
        "payment_method_display": f"{m.get('nickname')} · {m.get('display')}",
        "amount": round(data.amount, 2),
        "currency": cur,
        "note": data.note,
        "status": "processing",
        "created_at": utcnow_iso(),
        "eta_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
    }
    await db.withdrawals.insert_one(doc)
    # Also record as a transaction so it shows up in history
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "withdrawal",
        # Canonical fields used by wallet + founder dashboard aggregations
        "amount": data.amount,
        "from_currency": cur,
        "to_currency": cur,
        # Iteration-6 fields (for withdrawal-specific consumers)
        "amount_send": data.amount,
        "amount_receive": data.amount,
        "currency_send": cur,
        "currency_receive": cur,
        "recipient_name": m.get("nickname") or "My bank",
        "recipient_country": m.get("country"),
        "fee": 0,
        "status": "processing",
        "created_at": utcnow_iso(),
    })
    doc.pop("_id", None)
    return doc


@router.get("/withdrawals")
async def list_withdrawals(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    cur = db.withdrawals.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1)
    return await cur.to_list(100)


# ============================================================
# ENHANCED RECIPIENTS — country-aware create
# ============================================================

class RecipientDetailedIn(BaseModel):
    name: str
    country: str
    method_type: Literal["bank", "upi", "wallet", "mobile", "email"] = "bank"
    details: Dict[str, Any] = Field(default_factory=dict)
    nickname: Optional[str] = None
    favorite: bool = False


@router.post("/recipients/detailed")
async def create_recipient_detailed(data: RecipientDetailedIn, request: Request,
                                    user=Depends(_current_user)):
    """Enhanced recipient create using country schemas (accepts full details dict)."""
    country = data.country.upper()
    # Only validate details if country schema is known
    if country in COUNTRY_SCHEMAS and data.method_type in {"bank", "upi"}:
        _validate_details(country, data.method_type, data.details)
    identifier = ""
    if data.method_type == "upi":
        identifier = data.details.get("vpa", "")
    elif data.details.get("iban"):
        identifier = data.details["iban"]
    elif data.details.get("account"):
        identifier = data.details["account"]
    else:
        identifier = next(iter(data.details.values()), "") if data.details else ""

    db = request.app.state.db
    schema = COUNTRY_SCHEMAS.get(country, {})
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": data.name,
        "country": country,
        "currency": schema.get("currency", "USD"),
        "flag": schema.get("flag", "🌐"),
        "account_type": data.method_type,
        "identifier": identifier,
        "details": data.details,
        "display": _mask_identifier(country, data.method_type, data.details),
        "nickname": data.nickname,
        "favorite": data.favorite,
        "verified": True,  # mocked; production would call bank + AML
        "verification_status": "verified_mock",
        "last_sent_at": None,
        "sent_count": 0,
        "created_at": utcnow_iso(),
    }
    await db.recipients.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("details", None)
    return doc


# ============================================================
# FINN — banking-term explainer (short, friendly, no chatty preamble)
# ============================================================

_TERM_LIBRARY = {
    "IFSC":   "Indian Financial System Code — the 11-character code that identifies a specific bank branch in India (4 letters + 0 + 6 alphanumerics, e.g. HDFC0001234).",
    "UPI":    "Unified Payments Interface — India's instant bank-to-bank transfer system. You send/receive using a UPI ID (VPA) like yourname@bank.",
    "VPA":    "Virtual Payment Address — the UPI 'handle' someone uses instead of sharing account details (e.g. tejas@okhdfc).",
    "IBAN":   "International Bank Account Number — a globally unique account identifier used across Europe and many other countries. Starts with a 2-letter country code (e.g. DE89, FR76).",
    "SWIFT":  "SWIFT/BIC — an 8 or 11-character bank identifier used for international wire transfers. It tells the network which bank branch to route funds to.",
    "BIC":    "Bank Identifier Code — same thing as SWIFT. 8 or 11 characters.",
    "ROUTING":"ABA Routing Number — the 9-digit code on the bottom-left of a US check that identifies the bank branch for domestic (ACH / wire) transfers.",
    "ABA":    "American Bankers Association routing number — the 9-digit US bank routing code.",
    "SORT CODE":"UK 6-digit code (formatted XX-XX-XX) that identifies the specific bank branch of an account.",
    "BSB":    "Bank-State-Branch — Australian 6-digit routing number formatted XXX-XXX.",
    "SEPA":   "Single Euro Payments Area — the standardised low-cost bank-transfer network across 36 European countries.",
    "ACH":    "Automated Clearing House — the US network used for low-cost bank-to-bank transfers (payroll, bills, transfers). Usually 1–3 business days.",
    "WIRE":   "A same-day, direct-settle bank transfer. More expensive than ACH but faster and typically irreversible.",
    "MICRO-DEPOSIT":"A tiny test deposit (usually under $1) sent to your bank so you can confirm you own the account by entering the exact amount later.",
}


class ExplainIn(BaseModel):
    term: str


@router.post("/finn/explain-term")
async def explain(data: ExplainIn):
    term = data.term.strip().upper()
    # First try the offline library (instant + free)
    for key, val in _TERM_LIBRARY.items():
        if term == key or key in term or term in key:
            return {"term": key, "answer": val, "source": "library"}
    # Fallback: short helpful message
    return {"term": data.term,
            "answer": f"'{data.term}' looks like a banking-specific field. Please refer to your bank statement or ask Finn in the AI chat for more detail.",
            "source": "fallback"}


# ============================================================
# ONBOARDING helper — is this user brand new?
# ============================================================

@router.get("/onboarding/payment-status")
async def onboarding_status(request: Request, user=Depends(_current_user)):
    db = request.app.state.db
    pm_count = await db.payment_methods.count_documents({"user_id": user["id"]})
    rec_count = await db.recipients.count_documents({"user_id": user["id"]})
    return {
        "has_payment_method": pm_count > 0,
        "has_recipient": rec_count > 0,
        "payment_methods": pm_count,
        "recipients": rec_count,
        "first_time": (pm_count == 0 and rec_count == 0),
    }
