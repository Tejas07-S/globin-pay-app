"""Iteration 4 backend tests — Founder Dashboard auto-promotion + Priority-1 endpoints.

Covers the review request in `iteration_4`:
  - Founder auto-promotion via FOUNDER_EMAILS on login / register / /auth/me
  - Admin-only endpoints (founder dashboard, apikeys, announce, overview, users,
    transactions, audit-logs)
  - Priority-1 endpoints: fraud check, recipients CRUD + favorite toggle,
    financial health, business hub, transaction detail
  - Authorization negative cases (non-admin -> 403)
"""
from __future__ import annotations

import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"

DEMO_EMAIL = "demo@globalpay.ai"
DEMO_PASSWORD = "demo1234"


# ------------------------------------------------------------
# helpers / session fixtures
# ------------------------------------------------------------

@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    body = r.json()
    return body["token"], body["user"]


@pytest.fixture(scope="module")
def demo_headers(demo_token):
    token, _ = demo_token
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def fresh_user():
    """A brand-new non-founder user for negative auth checks and general auth tests."""
    email = f"TEST_iter4_{uuid.uuid4().hex[:10]}@globalpay.ai"
    r = requests.post(
        f"{BASE_URL}/auth/register",
        json={"email": email, "password": "testpass123", "full_name": "Iter4 Fresh"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return {"email": email, "token": body["token"], "user": body["user"]}


@pytest.fixture(scope="module")
def fresh_headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}"}


# ============================================================
# 1) Auth + founder auto-promotion
# ============================================================

class TestAuthFounderPromotion:
    def test_demo_login_sets_is_admin_true(self, demo_token):
        _, user = demo_token
        assert user["email"] == DEMO_EMAIL
        assert user.get("is_admin") is True, f"demo user should be founder: {user}"

    def test_fresh_register_is_admin_false(self, fresh_user):
        u = fresh_user["user"]
        assert u.get("is_admin") in (False, None), f"fresh user should NOT be admin: {u}"

    def test_me_returns_is_admin_true_for_demo(self, demo_headers):
        r = requests.get(f"{BASE_URL}/auth/me", headers=demo_headers)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me["email"] == DEMO_EMAIL
        assert me.get("is_admin") is True

    def test_me_returns_is_admin_false_for_fresh(self, fresh_headers):
        r = requests.get(f"{BASE_URL}/auth/me", headers=fresh_headers)
        assert r.status_code == 200
        me = r.json()
        assert me.get("is_admin") in (False, None)


# ============================================================
# 2) Founder Dashboard endpoints (admin-only)
# ============================================================

class TestFounderDashboard:
    def test_founder_endpoint_shape(self, demo_headers):
        r = requests.get(f"{BASE_URL}/admin/founder", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        required = {
            "total_users", "plus_subscribers", "countries_served",
            "transaction_volume_usd", "revenue_usd", "fraud_alerts",
            "kyc_pending", "referrals_count", "apikeys_configured", "series",
        }
        missing = required - set(d.keys())
        assert not missing, f"missing keys in founder payload: {missing}"
        assert isinstance(d["total_users"], int)
        assert isinstance(d["transaction_volume_usd"], (int, float))
        s = d["series"]
        assert set(s.keys()) == {"days", "signups", "volume"}
        assert len(s["days"]) == 7 == len(s["signups"]) == len(s["volume"])

    def test_founder_forbidden_for_non_admin(self, fresh_headers):
        r = requests.get(f"{BASE_URL}/admin/founder", headers=fresh_headers)
        assert r.status_code == 403, f"non-admin should be blocked, got {r.status_code} {r.text}"

    def test_admin_overview(self, demo_headers):
        r = requests.get(f"{BASE_URL}/admin/overview", headers=demo_headers)
        assert r.status_code == 200, r.text

    def test_admin_users_list(self, demo_headers):
        r = requests.get(f"{BASE_URL}/admin/users", headers=demo_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        # accept either raw list or {users: [...]}
        arr = data if isinstance(data, list) else data.get("users", [])
        assert isinstance(arr, list)
        assert len(arr) >= 1

    def test_admin_transactions(self, demo_headers):
        r = requests.get(f"{BASE_URL}/admin/transactions", headers=demo_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, (list, dict))

    def test_admin_audit_logs(self, demo_headers):
        r = requests.get(f"{BASE_URL}/admin/audit-logs", headers=demo_headers)
        assert r.status_code == 200, r.text


# ============================================================
# 3) API Keys management (admin-only)
# ============================================================

class TestApiKeys:
    def test_list_apikeys_reachable(self, demo_headers):
        r = requests.get(f"{BASE_URL}/admin/apikeys", headers=demo_headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_apikeys_forbidden_for_non_admin(self, fresh_headers):
        r = requests.get(f"{BASE_URL}/admin/apikeys", headers=fresh_headers)
        assert r.status_code == 403

    def test_upsert_stripe_key_and_verify_persistence(self, demo_headers):
        body = {"provider": "stripe", "key": "sk_test_dummy_1234567890", "enabled": True}
        r = requests.post(f"{BASE_URL}/admin/apikeys", json=body, headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["provider"] == "stripe"
        assert d["enabled"] is True
        assert d["last4"] == "7890"
        # GET back and verify
        rr = requests.get(f"{BASE_URL}/admin/apikeys", headers=demo_headers)
        rows = rr.json()
        stripe = next((x for x in rows if x["provider"] == "stripe"), None)
        assert stripe is not None, f"stripe key not persisted; rows={rows}"
        assert stripe["last4"] == "7890"
        assert stripe["enabled"] is True

    def test_toggle_stripe_apikey_flips_enabled(self, demo_headers):
        # ensure stripe exists first
        requests.post(
            f"{BASE_URL}/admin/apikeys",
            json={"provider": "stripe", "key": "sk_test_dummy_1234567890", "enabled": True},
            headers=demo_headers,
        )
        r1 = requests.post(f"{BASE_URL}/admin/apikeys/stripe/toggle", headers=demo_headers)
        assert r1.status_code == 200
        first = r1.json()["enabled"]
        r2 = requests.post(f"{BASE_URL}/admin/apikeys/stripe/toggle", headers=demo_headers)
        assert r2.status_code == 200
        second = r2.json()["enabled"]
        assert first != second, "toggle did not flip"


# ============================================================
# 4) Announcements
# ============================================================

class TestAnnouncements:
    def test_send_announcement_admin(self, demo_headers):
        payload = {"title": "Hello", "body": "Test", "audience": "all"}
        r = requests.post(f"{BASE_URL}/admin/announce", json=payload, headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "Hello" and d["body"] == "Test"
        assert "id" in d

    def test_announce_forbidden_for_non_admin(self, fresh_headers):
        r = requests.post(
            f"{BASE_URL}/admin/announce",
            json={"title": "x", "body": "y"},
            headers=fresh_headers,
        )
        assert r.status_code == 403

    def test_list_announcements_reachable(self, fresh_headers):
        r = requests.get(f"{BASE_URL}/announcements", headers=fresh_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============================================================
# 5) Priority-1 endpoints (auth required)
# ============================================================

class TestFraudCheck:
    def test_fraud_analyze_endpoint_note(self, fresh_headers):
        """Review request mentions POST /api/fraud/analyze — actual endpoint is
        /api/ai/fraud-check with a slightly different schema. Confirm the /fraud/analyze
        path does NOT exist (returns 404) so main agent can decide whether to rename or
        add an alias."""
        r = requests.post(
            f"{BASE_URL}/fraud/analyze",
            json={"amount_usd": 500, "recipient_country": "NG", "first_time_recipient": True},
            headers=fresh_headers,
        )
        assert r.status_code == 404, (
            f"expected 404 (endpoint doesn't exist); got {r.status_code} {r.text}"
        )

    def test_ai_fraud_check_shape(self, fresh_headers):
        payload = {
            "recipient_name": "John Doe",
            "recipient_country": "NG",
            "amount_usd": 500.0,
            "currency": "USD",
        }
        r = requests.post(f"{BASE_URL}/ai/fraud-check", json=payload, headers=fresh_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "score" in d and 0 <= d["score"] <= 100
        assert d["decision"] in {"proceed", "review", "block"}
        assert isinstance(d["flags"], list)
        assert "recipient_trust" in d and "fraud_probability_pct" in d

    def test_ai_fraud_check_blocks_sanctioned_country(self, fresh_headers):
        r = requests.post(
            f"{BASE_URL}/ai/fraud-check",
            json={"recipient_name": "X", "recipient_country": "IR", "amount_usd": 100},
            headers=fresh_headers,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["decision"] == "block", f"IR must block, got {d}"


class TestRecipients:
    _rid: str = ""

    def test_create_recipient(self, fresh_headers):
        payload = {
            "name": "Iter4 Recipient",
            "country": "NG",
            "currency": "USD",
            "account_type": "bank",
            "identifier": "GB29NWBK60161331926819",
            "nickname": "Mom",
            "favorite": False,
        }
        r = requests.post(f"{BASE_URL}/recipients", json=payload, headers=fresh_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert "id" in d and d["user_id"]
        assert d["verified"] is True
        TestRecipients._rid = d["id"]

    def test_list_recipients_contains_created(self, fresh_headers):
        r = requests.get(f"{BASE_URL}/recipients", headers=fresh_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(data.keys()) >= {"all", "favorites", "recent"}
        ids = [x["id"] for x in data["all"]]
        assert TestRecipients._rid in ids

    def test_toggle_favorite_and_verify(self, fresh_headers):
        r = requests.post(
            f"{BASE_URL}/recipients/{TestRecipients._rid}/favorite", headers=fresh_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["favorite"] is True
        # verify via GET list
        rr = requests.get(f"{BASE_URL}/recipients", headers=fresh_headers)
        favs = [x["id"] for x in rr.json()["favorites"]]
        assert TestRecipients._rid in favs

    def test_delete_recipient_then_404(self, fresh_headers):
        r = requests.delete(f"{BASE_URL}/recipients/{TestRecipients._rid}", headers=fresh_headers)
        assert r.status_code == 200 and r.json().get("ok") is True
        # deleting again should 404
        r2 = requests.delete(f"{BASE_URL}/recipients/{TestRecipients._rid}", headers=fresh_headers)
        assert r2.status_code == 404


class TestHealthScore:
    def test_health_score_shape(self, demo_headers):
        r = requests.get(f"{BASE_URL}/health/score", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "score" in d and isinstance(d["score"], (int, float))
        assert 0 <= d["score"] <= 100
        for k in ("savings_rate_pct", "inflow_usd", "outflow_usd", "recommendations"):
            assert k in d, f"missing '{k}' in health payload: {list(d.keys())}"


class TestBusinessHub:
    def test_business_dashboard_endpoint_note(self, demo_headers):
        """Review request expected GET /api/business/dashboard — server exposes
        /business/clients, /business/tax-report, /business/bulk-pay separately.
        Confirming the dashboard alias does NOT exist."""
        r = requests.get(f"{BASE_URL}/business/dashboard", headers=demo_headers)
        assert r.status_code == 404

    def test_business_clients_list(self, demo_headers):
        r = requests.get(f"{BASE_URL}/business/clients", headers=demo_headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_business_tax_report(self, demo_headers):
        r = requests.get(f"{BASE_URL}/business/tax-report", headers=demo_headers)
        assert r.status_code == 200, r.text


class TestTransactionDetail:
    def test_transaction_detail_flow(self, demo_headers):
        # 1) list transfers to find an existing tx id
        r = requests.get(f"{BASE_URL}/transfers", headers=demo_headers)
        assert r.status_code == 200, r.text
        txs = r.json()

        # 2) create one if empty
        if not txs:
            body = {
                "from_currency": "USD",
                "to_currency": "EUR",
                "amount": 100.0,
                "recipient_name": "Iter4 TxDetail",
                "recipient_country": "DE",
                "recipient_account": "IBAN12345",
            }
            r2 = requests.post(f"{BASE_URL}/transfers", json=body, headers=demo_headers)
            assert r2.status_code == 200, r2.text
            r = requests.get(f"{BASE_URL}/transfers", headers=demo_headers)
            txs = r.json()

        assert len(txs) >= 1
        tx_id = txs[0]["id"]

        # 3) fetch detail (response is {tx, timeline, ai_fee_explanation, receipt})
        d = requests.get(f"{BASE_URL}/transactions/{tx_id}", headers=demo_headers)
        assert d.status_code == 200, d.text
        body = d.json()
        assert set(body.keys()) >= {"tx", "timeline", "receipt"}
        assert body["tx"]["id"] == tx_id
        assert isinstance(body["timeline"], list) and len(body["timeline"]) >= 3
        assert body["receipt"]["id"] == tx_id

    def test_transaction_detail_404_for_bogus(self, demo_headers):
        r = requests.get(f"{BASE_URL}/transactions/not-a-real-id", headers=demo_headers)
        assert r.status_code == 404


# ============================================================
# 6) Cross-cutting negative auth
# ============================================================

class TestUnauthenticated:
    def test_no_token_founder(self):
        r = requests.get(f"{BASE_URL}/admin/founder")
        assert r.status_code == 401

    def test_no_token_recipients(self):
        r = requests.get(f"{BASE_URL}/recipients")
        assert r.status_code == 401

    def test_no_token_health(self):
        r = requests.get(f"{BASE_URL}/health/score")
        assert r.status_code == 401
