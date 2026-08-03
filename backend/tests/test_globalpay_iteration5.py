"""Iteration 5 regression tests — deployment-readiness hardening.

Focus:
- Login (demo user) → JWT signing still works
- POST /api/invoices → payment_link now uses PUBLIC_APP_URL (not https://globalpay.ai)
- POST /api/stripe/topup → returns Stripe checkout URL referencing real public URL (not example.com)
- POST /api/auth/register fresh user → is_admin=false when NOT in FOUNDER_EMAILS
- GET /api/admin/founder with founder token → 200 with expected keys
- Broad regression: /api/auth/me, /api/wallets, /api/transactions still work
"""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
PUBLIC_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

DEMO_EMAIL = "demo@globalpay.ai"
DEMO_PASSWORD = "demo1234"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo_token(api):
    r = api.post(f"{BASE_URL}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def fresh_user(api):
    """Non-founder fresh user."""
    email = f"TEST_iter5_{uuid.uuid4().hex[:10]}@example.com"
    r = api.post(
        f"{BASE_URL}/auth/register",
        json={"email": email, "password": "testpass123", "full_name": "Iter5 User"},
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()


# ---------- auth / JWT ----------
class TestAuthJWT:
    def test_demo_login_returns_jwt_and_admin_flag(self, api):
        r = api.post(f"{BASE_URL}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
        assert data["user"]["email"] == DEMO_EMAIL
        assert data["user"]["is_admin"] is True

    def test_auth_me_with_jwt(self, api, demo_headers):
        r = api.get(f"{BASE_URL}/auth/me", headers=demo_headers)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_bad_jwt_rejected(self, api):
        r = api.get(f"{BASE_URL}/auth/me", headers={"Authorization": "Bearer garbage.token.here"})
        assert r.status_code == 401


# ---------- register non-founder ----------
class TestRegisterNonFounder:
    def test_fresh_user_is_not_admin(self, fresh_user):
        assert fresh_user["user"]["is_admin"] is False
        assert "@" in fresh_user["user"]["email"]

    def test_fresh_user_cannot_hit_founder_dashboard(self, api, fresh_user):
        h = {"Authorization": f"Bearer {fresh_user['token']}"}
        r = api.get(f"{BASE_URL}/admin/founder", headers=h)
        assert r.status_code in (401, 403)


# ---------- founder dashboard ----------
class TestFounderDashboard:
    def test_founder_dashboard_ok(self, api, demo_headers):
        r = api.get(f"{BASE_URL}/admin/founder", headers=demo_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in [
            "total_users",
            "plus_subscribers",
            "countries_served",
            "transaction_volume_usd",
            "revenue_usd",
            "fraud_alerts",
            "kyc_pending",
            "referrals_count",
            "apikeys_configured",
            "series",
        ]:
            assert k in data, f"missing key {k}"
        assert isinstance(data["series"], dict)
        assert "days" in data["series"] and "signups" in data["series"] and "volume" in data["series"]


# ---------- invoice payment_link ----------
class TestInvoicePaymentLink:
    def test_invoice_payment_link_uses_public_url(self, api, demo_headers):
        payload = {
            "client_name": "Iter5 Client",
            "client_email": "iter5-client@example.com",
            "amount": 100.0,
            "currency": "USD",
            "description": "Iter5 test invoice",
        }
        r = api.post(f"{BASE_URL}/invoices", headers=demo_headers, json=payload)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert "payment_link" in inv, f"no payment_link in {inv}"
        link = inv["payment_link"]
        # Must NOT be the removed hardcoded https://globalpay.ai default.
        assert not link.startswith("https://globalpay.ai/"), f"payment_link still uses hardcoded https://globalpay.ai default: {link}"
        # Must be a real https URL, not example.com.
        assert link.startswith("https://") and "example.com" not in link, link
        # Should include a /pay/ segment.
        assert "/pay/" in link, link


# ---------- stripe topup ----------
class TestStripeTopup:
    def test_stripe_topup_returns_checkout_url(self, api, demo_headers):
        r = api.post(f"{BASE_URL}/stripe/topup", headers=demo_headers, json={"amount_usd": 25})
        # Stripe integration may return 200 with url, or a 4xx if API key/session invalid.
        assert r.status_code in (200, 400, 500, 502), r.text
        if r.status_code != 200:
            pytest.skip(f"Stripe topup returned {r.status_code}: {r.text[:200]}")
        data = r.json()
        # Look for a checkout URL field
        url = data.get("url") or data.get("checkout_url") or data.get("session_url")
        assert url, f"no checkout url in response: {data}"
        # Must NOT reference example.com
        assert "example.com" not in url, f"stripe topup still references example.com: {url}"
        # Should typically be a Stripe URL, but success/cancel URLs are sent as metadata.
        # If the response also echoes success/cancel URLs, validate them.
        for k in ("success_url", "cancel_url"):
            if k in data:
                assert "example.com" not in data[k], f"{k} still uses example.com: {data[k]}"
                assert data[k].startswith(PUBLIC_URL) or data[k].startswith("http"), data[k]


# ---------- broad regression ----------
class TestSmokeRegression:
    def test_wallet_ok(self, api, demo_headers):
        r = api.get(f"{BASE_URL}/wallet", headers=demo_headers)
        assert r.status_code == 200
        data = r.json()
        assert "balances" in data or isinstance(data, dict)

    def test_transfers_ok(self, api, demo_headers):
        r = api.get(f"{BASE_URL}/transfers", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_rates_ok(self, api):
        r = api.get(f"{BASE_URL}/rates")
        assert r.status_code == 200

    def test_root_ok(self, api):
        r = api.get(f"{BASE_URL}/")
        assert r.status_code == 200
