"""Iteration 2 backend tests for GlobalPay AI.

Covers: Google auth, Stripe (top-up + Plus), Family wallet, Split bills,
Referral & cashback, AML/sanctions screen, Transfer AML block + cashback,
Admin overview/users/audit/freeze/kyc/bootstrap.
"""
import os
import uuid
import pytest
import requests

DEMO_EMAIL = "demo@globalpay.ai"
DEMO_PASSWORD = "demo1234"


# ---------- fixtures specific to iteration 2 ----------
@pytest.fixture(scope="module")
def demo_admin(api, base_url):
    """Login (or register) the demo admin user."""
    r = api.post(f"{base_url}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if r.status_code != 200:
        # register then login
        api.post(f"{base_url}/auth/register", json={
            "email": DEMO_EMAIL, "password": DEMO_PASSWORD, "full_name": "Demo User"
        })
        r = api.post(f"{base_url}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data["user"],
            "headers": {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}}


@pytest.fixture(scope="module")
def second_user(api, base_url):
    """A fresh second user for referral & admin actions."""
    email = f"TEST_{uuid.uuid4().hex[:10]}@globalpay.ai"
    r = api.post(f"{base_url}/auth/register", json={
        "email": email, "password": "testpass123", "full_name": "TEST Second"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "user": data["user"],
            "headers": {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}}


# ============================================================
# Google Auth
# ============================================================
class TestGoogleAuth:
    def test_google_auth_invalid_session_returns_401(self, api, base_url):
        r = api.post(f"{base_url}/auth/google", json={"session_id": "invalid-session-xyz"})
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"


# ============================================================
# Stripe
# ============================================================
class TestStripe:
    def test_topup_creates_session_and_persists(self, api, base_url, demo_admin):
        r = api.post(f"{base_url}/stripe/topup", json={"amount_usd": 25},
                     headers=demo_admin["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("http")
        assert "session_id" in data and data["session_id"]
        # Verify persisted state via status endpoint
        s = api.get(f"{base_url}/stripe/status/{data['session_id']}", headers=demo_admin["headers"])
        assert s.status_code == 200, s.text
        st = s.json()
        assert st["credited"] is False
        assert st["intent"] == "wallet_topup"
        assert st["amount_usd"] == 25

    def test_subscribe_plus_creates_session(self, api, base_url, demo_admin):
        r = api.post(f"{base_url}/stripe/subscribe-plus", headers=demo_admin["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and "session_id" in data
        s = api.get(f"{base_url}/stripe/status/{data['session_id']}", headers=demo_admin["headers"])
        assert s.status_code == 200
        st = s.json()
        assert st["intent"] == "plus_upgrade"
        assert st["credited"] is False


# ============================================================
# Family wallet
# ============================================================
class TestFamily:
    def test_family_full_flow(self, api, base_url, second_user):
        h = second_user["headers"]
        # create
        r = api.post(f"{base_url}/family", json={"name": "TEST Family"}, headers=h)
        assert r.status_code == 200, r.text
        fam = r.json()
        assert fam["name"] == "TEST Family"
        assert fam["balance_usd"] == 0.0
        assert any(m["role"] == "owner" for m in fam["members"])
        # get
        r2 = api.get(f"{base_url}/family", headers=h)
        assert r2.status_code == 200 and r2.json()["id"] == fam["id"]
        # add member
        r3 = api.post(f"{base_url}/family/add-member",
                      json={"member_email": "member1@example.com", "allowance_usd": 50},
                      headers=h)
        assert r3.status_code == 200, r3.text
        assert len(r3.json()["members"]) == 2
        # fund — user starts with USD 2500 (from register seed)
        r4 = api.post(f"{base_url}/family/fund", json={"amount_usd": 100}, headers=h)
        assert r4.status_code == 200, r4.text
        assert r4.json()["balance_usd"] == 100
        # verify user's USD balance debited
        me = api.get(f"{base_url}/auth/me", headers=h).json()
        assert me["balances"]["USD"] == pytest.approx(2500 - 100, abs=0.01)


# ============================================================
# Splits
# ============================================================
class TestSplits:
    def test_split_create_list_and_mark(self, api, base_url, second_user):
        h = second_user["headers"]
        r = api.post(f"{base_url}/splits", json={
            "title": "TEST Dinner", "total": 90.0, "currency": "USD",
            "participants": ["Alice", "Bob", "Carol"],
        }, headers=h)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["share_each"] == pytest.approx(30.0, abs=0.01)
        assert len(doc["participants"]) == 3
        split_id = doc["id"]
        # list
        r2 = api.get(f"{base_url}/splits", headers=h)
        assert r2.status_code == 200
        assert any(s["id"] == split_id for s in r2.json())
        # mark Alice paid (toggle True)
        r3 = api.post(f"{base_url}/splits/{split_id}/mark?name=Alice", headers=h)
        assert r3.status_code == 200, r3.text
        parts = r3.json()["participants"]
        alice = next(p for p in parts if p["name"] == "Alice")
        assert alice["paid"] is True
        # toggle back
        r4 = api.post(f"{base_url}/splits/{split_id}/mark?name=Alice", headers=h)
        alice2 = next(p for p in r4.json()["participants"] if p["name"] == "Alice")
        assert alice2["paid"] is False


# ============================================================
# Referral & Cashback
# ============================================================
class TestReferral:
    def test_referral_me_returns_code(self, api, base_url, second_user):
        r = api.get(f"{base_url}/referral/me", headers=second_user["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["code"].startswith("GP-") and len(data["code"]) == 9
        assert isinstance(data["invited_count"], int)
        assert "cashback_usd" in data

    def test_redeem_own_code_returns_400(self, api, base_url, second_user):
        me = api.get(f"{base_url}/referral/me", headers=second_user["headers"]).json()
        r = api.post(f"{base_url}/referral/redeem", json={"code": me["code"]},
                     headers=second_user["headers"])
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_redeem_invalid_code_returns_404(self, api, base_url, second_user):
        r = api.post(f"{base_url}/referral/redeem", json={"code": "GP-ZZZZZZ"},
                     headers=second_user["headers"])
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"

    def test_redeem_valid_code_credits_both(self, api, base_url, demo_admin):
        # create a fresh referrer user
        ref_email = f"TEST_{uuid.uuid4().hex[:10]}@globalpay.ai"
        r = api.post(f"{base_url}/auth/register", json={
            "email": ref_email, "password": "testpass123", "full_name": "Referrer"
        })
        assert r.status_code == 200
        ref_user = r.json()["user"]
        ref_token = r.json()["token"]
        ref_headers = {"Authorization": f"Bearer {ref_token}", "Content-Type": "application/json"}
        ref_code = api.get(f"{base_url}/referral/me", headers=ref_headers).json()["code"]

        # fresh invitee
        inv_email = f"TEST_{uuid.uuid4().hex[:10]}@globalpay.ai"
        r2 = api.post(f"{base_url}/auth/register", json={
            "email": inv_email, "password": "testpass123", "full_name": "Invitee"
        })
        assert r2.status_code == 200
        inv_token = r2.json()["token"]
        inv_headers = {"Authorization": f"Bearer {inv_token}", "Content-Type": "application/json"}
        inv_usd_before = r2.json()["user"]["balances"]["USD"]

        # redeem
        rr = api.post(f"{base_url}/referral/redeem", json={"code": ref_code}, headers=inv_headers)
        assert rr.status_code == 200, rr.text
        assert rr.json()["credited_usd"] == 5.0

        # verify invitee's USD +5
        inv_me = api.get(f"{base_url}/auth/me", headers=inv_headers).json()
        assert inv_me["balances"]["USD"] == pytest.approx(inv_usd_before + 5.0, abs=0.01)
        # verify referrer's USD +5
        ref_me = api.get(f"{base_url}/auth/me", headers=ref_headers).json()
        assert ref_me["balances"]["USD"] == pytest.approx(ref_user["balances"]["USD"] + 5.0, abs=0.01)


# ============================================================
# AML / Sanctions engine
# ============================================================
class TestAML:
    def test_aml_allow(self, api, base_url):
        r = api.post(f"{base_url}/aml/screen", json={"name": "John Doe", "country": "Germany"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["decision"] == "allow"
        assert d["score"] < 50

    def test_aml_block_sanctioned_country(self, api, base_url):
        r = api.post(f"{base_url}/aml/screen", json={"name": "Someone", "country": "Iran"})
        assert r.status_code == 200
        d = r.json()
        assert d["decision"] == "block"
        assert d["score"] >= 90
        assert "SANCTIONED_COUNTRY" in d["flags"]

    def test_aml_pep_match(self, api, base_url):
        r = api.post(f"{base_url}/aml/screen", json={"name": "Mr VLADIMIR PUTIN", "country": "Russia"})
        assert r.status_code == 200
        d = r.json()
        assert "PEP_MATCH" in d["flags"]


# ============================================================
# Transfer AML block + cashback
# ============================================================
class TestTransferAMLAndCashback:
    def test_transfer_to_sanctioned_country_blocked_no_debit(self, api, base_url):
        # fresh user so we know starting balance
        email = f"TEST_{uuid.uuid4().hex[:10]}@globalpay.ai"
        rr = api.post(f"{base_url}/auth/register", json={
            "email": email, "password": "testpass123", "full_name": "AML Test"
        })
        assert rr.status_code == 200
        headers = {"Authorization": f"Bearer {rr.json()['token']}", "Content-Type": "application/json"}
        usd_before = rr.json()["user"]["balances"]["USD"]

        r = api.post(f"{base_url}/transfers", json={
            "from_currency": "USD", "to_currency": "EUR",
            "amount": 100, "recipient_name": "Ali Rez",
            "recipient_country": "Iran",
        }, headers=headers)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"
        assert "AML" in r.text

        # verify balance unchanged
        me = api.get(f"{base_url}/auth/me", headers=headers).json()
        assert me["balances"]["USD"] == pytest.approx(usd_before, abs=0.01)

    def test_successful_transfer_credits_cashback(self, api, base_url):
        email = f"TEST_{uuid.uuid4().hex[:10]}@globalpay.ai"
        rr = api.post(f"{base_url}/auth/register", json={
            "email": email, "password": "testpass123", "full_name": "Cashback Test"
        })
        headers = {"Authorization": f"Bearer {rr.json()['token']}", "Content-Type": "application/json"}
        # capture cashback before via /referral/me
        cb_before = api.get(f"{base_url}/referral/me", headers=headers).json()["cashback_usd"]

        r = api.post(f"{base_url}/transfers", json={
            "from_currency": "USD", "to_currency": "EUR",
            "amount": 200, "recipient_name": "Marie Curie",
            "recipient_country": "France",
        }, headers=headers)
        assert r.status_code == 200, r.text
        tx = r.json()
        # 0.5% of $200 = $1.00
        assert tx["cashback_usd"] == pytest.approx(1.0, abs=0.05)

        cb_after = api.get(f"{base_url}/referral/me", headers=headers).json()["cashback_usd"]
        assert cb_after == pytest.approx(cb_before + 1.0, abs=0.05)


# ============================================================
# Admin
# ============================================================
class TestAdmin:
    def test_admin_overview(self, api, base_url, demo_admin):
        r = api.get(f"{base_url}/admin/overview", headers=demo_admin["headers"])
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["users_count", "kyc_pending", "kyc_verified",
                  "transactions_count", "plus_subscribers",
                  "invoices_count", "payments_settled"]:
            assert k in d, f"missing {k}"
        assert d["users_count"] >= 1

    def test_admin_users_list(self, api, base_url, demo_admin):
        r = api.get(f"{base_url}/admin/users", headers=demo_admin["headers"])
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 1
        assert all("password" not in u for u in users)
        assert all("_id" not in u for u in users)

    def test_admin_audit_logs(self, api, base_url, demo_admin):
        r = api.get(f"{base_url}/admin/audit-logs", headers=demo_admin["headers"])
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_endpoints_forbidden_for_non_admin(self, api, base_url, second_user):
        for path in ["/admin/overview", "/admin/users", "/admin/audit-logs"]:
            r = api.get(f"{base_url}{path}", headers=second_user["headers"])
            assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"

    def test_admin_kyc_verified_flips_status(self, api, base_url, demo_admin, second_user):
        uid = second_user["user"]["id"]
        r = api.post(f"{base_url}/admin/users/{uid}/kyc/verified", headers=demo_admin["headers"])
        assert r.status_code == 200, r.text
        assert r.json()["kyc_status"] == "verified"
        # verify by re-fetching from admin/users
        users = api.get(f"{base_url}/admin/users", headers=demo_admin["headers"]).json()
        target = next((u for u in users if u["id"] == uid), None)
        assert target and target["kyc_status"] == "verified"

    def test_admin_freeze_blocks_frozen_user_calls(self, api, base_url, demo_admin):
        # register a throwaway user we can freeze without breaking other tests
        email = f"TEST_{uuid.uuid4().hex[:10]}@globalpay.ai"
        rr = api.post(f"{base_url}/auth/register", json={
            "email": email, "password": "testpass123", "full_name": "Freeze Test"
        })
        assert rr.status_code == 200
        target_id = rr.json()["user"]["id"]
        target_headers = {"Authorization": f"Bearer {rr.json()['token']}", "Content-Type": "application/json"}

        # confirm calls work before freeze
        pre = api.get(f"{base_url}/auth/me", headers=target_headers)
        assert pre.status_code == 200

        # freeze
        rf = api.post(f"{base_url}/admin/users/{target_id}/freeze", headers=demo_admin["headers"])
        assert rf.status_code == 200 and rf.json()["frozen"] is True

        # frozen user's authenticated calls should now 403
        post = api.get(f"{base_url}/auth/me", headers=target_headers)
        assert post.status_code == 403, f"expected 403 got {post.status_code}: {post.text}"

        # unfreeze (toggle)
        ru = api.post(f"{base_url}/admin/users/{target_id}/freeze", headers=demo_admin["headers"])
        assert ru.status_code == 200 and ru.json()["frozen"] is False

    def test_admin_bootstrap_returns_403_when_admin_exists(self, api, base_url, second_user):
        # demo_admin already has is_admin=true, so bootstrap should fail for anyone
        r = api.post(f"{base_url}/admin/bootstrap", headers=second_user["headers"])
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


# ============================================================
# Stripe webhook robustness
# ============================================================
class TestStripeWebhook:
    def test_webhook_with_bogus_body_does_not_500(self, api, base_url):
        r = requests.post(f"{base_url}/stripe/webhook",
                          data=b"not-a-real-event",
                          headers={"Content-Type": "application/json"})
        # Per iteration 2 note: 400 on invalid sig OR opportunistic accept — just not 500
        assert r.status_code < 500, f"webhook 5xx: {r.status_code} {r.text}"
