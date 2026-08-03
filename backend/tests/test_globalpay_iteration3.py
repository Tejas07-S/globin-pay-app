"""Iteration 3 backend tests — countries, providers, AI insights/timing,
sanctions v2, virtual cards, cashback marketplace."""
import os
import uuid
import time
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"

DEMO_EMAIL = "demo@globalpay.ai"
DEMO_PASS = "demo1234"


# -------- helpers --------
def _login_or_register(email, password, name="Demo User"):
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return r.json()
    r = requests.post(f"{BASE_URL}/auth/register",
                      json={"email": email, "password": password, "full_name": name})
    assert r.status_code == 200, r.text
    return r.json()


def _fresh_user():
    email = f"TEST_{uuid.uuid4().hex[:10]}@globalpay.ai"
    r = requests.post(f"{BASE_URL}/auth/register",
                      json={"email": email, "password": "testpass123", "full_name": "TEST User"})
    assert r.status_code == 200, r.text
    return r.json(), email


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def demo():
    data = _login_or_register(DEMO_EMAIL, DEMO_PASS)
    # Ensure verified (idempotent)
    if data["user"].get("kyc_status") != "verified":
        requests.post(f"{BASE_URL}/kyc",
                      headers=_hdr(data["token"]),
                      json={"doc_type": "passport", "doc_number": "X1", "country": "US",
                            "date_of_birth": "1990-01-01", "address": "1 Test St"})
    return data


# =============================== COUNTRIES ================================
class TestCountries:
    def test_list_countries(self):
        r = requests.get(f"{BASE_URL}/countries")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 40
        c = data[0]
        for k in ("code", "name", "flag", "currency", "methods", "eta"):
            assert k in c, f"missing {k}"
        assert isinstance(c["methods"], list)

    def test_filter_countries_india(self):
        r = requests.get(f"{BASE_URL}/countries", params={"q": "India"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert any(c["code"] == "IN" for c in data)


# =============================== PROVIDERS ================================
class TestProviders:
    def test_list_providers(self):
        r = requests.get(f"{BASE_URL}/providers")
        assert r.status_code == 200
        data = r.json()
        ids = {p["id"]: p for p in data}
        assert "stripe_connect" in ids
        assert "wise" in ids
        assert "rapyd" in ids
        assert ids["stripe_connect"]["enabled"] is True
        assert ids["wise"]["enabled"] is False
        assert ids["rapyd"]["enabled"] is False
        assert len(data) >= 5

    def test_route_provider(self):
        r = requests.get(f"{BASE_URL}/providers/route", params={"country": "IN"})
        assert r.status_code == 200
        p = r.json()
        assert "id" in p
        # only stripe_connect is enabled → route should return it
        assert p["id"] == "stripe_connect"


# =============================== AI INSIGHTS ==============================
class TestAIInsights:
    def test_insights_requires_auth(self):
        r = requests.get(f"{BASE_URL}/ai/insights")
        assert r.status_code == 401

    def test_insights_shape(self, demo):
        r = requests.get(f"{BASE_URL}/ai/insights", headers=_hdr(demo["token"]))
        assert r.status_code == 200
        data = r.json()
        assert "insights" in data
        items = data["insights"]
        assert isinstance(items, list)
        assert 1 <= len(items) <= 6
        for it in items:
            for k in ("id", "kind", "icon", "title", "body", "cta", "action"):
                assert k in it, f"missing {k} in insight"


class TestAITiming:
    def test_timing_returns_verdict(self):
        r = requests.post(f"{BASE_URL}/ai/timing",
                          json={"from_currency": "USD", "to_currency": "EUR", "amount": 1000})
        assert r.status_code == 200
        d = r.json()
        for k in ("verdict", "headline", "today_rate", "best_rate", "expected_gain", "confidence"):
            assert k in d, f"missing {k}"
        assert d["verdict"] in ("send_now", "wait")
        assert 0 < d["confidence"] <= 100


# =============================== SANCTIONS V2 =============================
class TestSanctionsV2:
    def test_fuzzy_pablo_escobar(self):
        r = requests.post(f"{BASE_URL}/aml/screen-v2",
                          json={"name": "Pablo Escobar", "country": "US"})
        assert r.status_code == 200
        d = r.json()
        assert "matches" in d
        assert any(m.get("kind") == "sanctions" for m in d["matches"])
        # confidence at 0.5+ for at least one match
        assert any(m.get("confidence", 0) >= 0.5 for m in d["matches"])
        assert "SANCTIONS_LIST_MATCH" in d["flags"]

    def test_iran_country_blocked(self):
        r = requests.post(f"{BASE_URL}/aml/screen-v2",
                          json={"name": "John Doe", "country": "IR"})
        assert r.status_code == 200
        d = r.json()
        assert d["decision"] == "block"
        assert "SANCTIONED_COUNTRY" in d["flags"]


# =============================== VIRTUAL CARDS ============================
class TestVirtualCards:
    def test_unverified_cannot_issue(self):
        data, _ = _fresh_user()
        r = requests.post(f"{BASE_URL}/cards",
                          headers=_hdr(data["token"]),
                          json={"label": "Test"})
        assert r.status_code == 403

    def test_verified_user_issues_card(self):
        data, _ = _fresh_user()
        # KYC verify
        rk = requests.post(f"{BASE_URL}/kyc", headers=_hdr(data["token"]),
                           json={"doc_type": "passport", "doc_number": "P1",
                                 "country": "US", "date_of_birth": "1990-01-01",
                                 "address": "1 Test St"})
        assert rk.status_code == 200
        r = requests.post(f"{BASE_URL}/cards", headers=_hdr(data["token"]),
                          json={"label": "Primary"})
        assert r.status_code == 200, r.text
        card = r.json()
        for k in ("id", "pan", "cvv", "expiry", "brand", "status"):
            assert k in card
        assert card["brand"] == "Visa"
        assert card["status"] == "active"

    def test_list_cards(self, demo):
        # ensure at least one card exists for demo
        requests.post(f"{BASE_URL}/cards", headers=_hdr(demo["token"]),
                      json={"label": "demo-card"})
        r = requests.get(f"{BASE_URL}/cards", headers=_hdr(demo["token"]))
        assert r.status_code == 200
        cards = r.json()
        assert isinstance(cards, list)
        assert len(cards) >= 1

    def test_freeze_toggles(self):
        data, _ = _fresh_user()
        requests.post(f"{BASE_URL}/kyc", headers=_hdr(data["token"]),
                      json={"doc_type": "passport", "doc_number": "P2", "country": "US",
                            "date_of_birth": "1990-01-01", "address": "1 St"})
        r = requests.post(f"{BASE_URL}/cards", headers=_hdr(data["token"]), json={})
        card_id = r.json()["id"]
        rf = requests.post(f"{BASE_URL}/cards/{card_id}/freeze", headers=_hdr(data["token"]))
        assert rf.status_code == 200
        assert rf.json()["status"] == "frozen"
        rf2 = requests.post(f"{BASE_URL}/cards/{card_id}/freeze", headers=_hdr(data["token"]))
        assert rf2.json()["status"] == "active"

    def test_non_plus_limited_to_one_card(self):
        data, _ = _fresh_user()
        requests.post(f"{BASE_URL}/kyc", headers=_hdr(data["token"]),
                      json={"doc_type": "passport", "doc_number": "P3", "country": "US",
                            "date_of_birth": "1990-01-01", "address": "1 St"})
        r1 = requests.post(f"{BASE_URL}/cards", headers=_hdr(data["token"]), json={})
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/cards", headers=_hdr(data["token"]), json={})
        assert r2.status_code == 403
        assert "Plus" in r2.json().get("detail", "")


# =============================== MARKETPLACE ==============================
class TestMarketplace:
    def test_offers_list(self, demo):
        r = requests.get(f"{BASE_URL}/marketplace/offers", headers=_hdr(demo["token"]))
        assert r.status_code == 200
        d = r.json()
        assert "is_plus" in d
        assert "offers" in d
        assert len(d["offers"]) == 10
        for o in d["offers"]:
            assert "effective_pct" in o
            assert "cashback_pct" in o
            assert "merchant" in o

    def test_redeem_insufficient_cashback(self):
        # Fresh user has $0 cashback; redemption should 400
        data, _ = _fresh_user()
        r = requests.post(f"{BASE_URL}/marketplace/redeem",
                          headers=_hdr(data["token"]),
                          json={"offer_id": "spotify", "amount_usd": 100})
        assert r.status_code == 400

    def test_redeem_success_after_cashback(self):
        # Fresh user, verify, make several transfers to accrue cashback, then redeem
        data, _ = _fresh_user()
        token = data["token"]
        # Make 3 transfers of $200 USD -> EUR: cashback = 0.5% * (200/1) * 3 = $3.00
        for _ in range(3):
            r = requests.post(f"{BASE_URL}/transfers", headers=_hdr(token),
                              json={"from_currency": "USD", "to_currency": "EUR",
                                    "amount": 200, "recipient_name": "Alice",
                                    "recipient_country": "Germany"})
            assert r.status_code == 200, r.text

        me = requests.get(f"{BASE_URL}/auth/me", headers=_hdr(token)).json()
        cb = float(me.get("cashback_usd", 0))
        assert cb >= 3.0

        # Try to redeem an amount where reward <= cashback.
        # Amazon cashback_pct=2 → reward = amount * 0.02. For reward <= cb=$3 use amount=100 → $2.
        r = requests.post(f"{BASE_URL}/marketplace/redeem", headers=_hdr(token),
                          json={"offer_id": "amazon", "amount_usd": 100})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["reward_usd"] == 2.0
        assert d["code"].startswith("GP-")

        # Verify cashback deducted
        me2 = requests.get(f"{BASE_URL}/auth/me", headers=_hdr(token)).json()
        assert round(float(me2["cashback_usd"]), 2) == round(cb - 2.0, 2)
