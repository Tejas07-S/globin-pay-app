"""Iteration 6 - Payment Methods, Country Schemas, Withdrawals, Recipients, Finn tests.

Covers all endpoints in /app/backend/routes_payment_methods.py.
"""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def fresh_user():
    """Register a fresh (non-founder) user for onboarding + PM tests."""
    email = f"TEST_iter6_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{BASE_URL}/auth/register",
                      json={"email": email, "password": "testpass123",
                            "full_name": "Iter6 User"}, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "token": data["token"], "user": data["user"]}


@pytest.fixture(scope="module")
def headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}",
            "Content-Type": "application/json"}


# ---------- Country schemas ----------

class TestCountrySchemas:
    def test_all_schemas(self):
        r = requests.get(f"{BASE_URL}/countries/schema", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "countries" in data and "flags" in data
        assert len(data["countries"]) == 11
        for c in data["countries"]:
            assert all(k in c for k in ("code", "name", "flag", "currency", "methods", "popular_banks"))
        assert data["flags"] == {"plaid": False, "setu": False}

    def test_india_schema(self):
        r = requests.get(f"{BASE_URL}/countries/IN/schema", timeout=10)
        assert r.status_code == 200
        data = r.json()
        method_types = [m["type"] for m in data["methods"]]
        assert "upi" in method_types and "bank" in method_types
        upi = next(m for m in data["methods"] if m["type"] == "upi")
        assert upi["fields"][0]["key"] == "vpa"
        bank = next(m for m in data["methods"] if m["type"] == "bank")
        keys = [f["key"] for f in bank["fields"]]
        assert "account" in keys and "ifsc" in keys

    def test_gb_schema(self):
        r = requests.get(f"{BASE_URL}/countries/GB/schema", timeout=10)
        assert r.status_code == 200
        bank = next(m for m in r.json()["methods"] if m["type"] == "bank")
        keys = [f["key"] for f in bank["fields"]]
        assert "sort_code" in keys and "account" in keys

    def test_unknown_country(self):
        r = requests.get(f"{BASE_URL}/countries/XX/schema", timeout=10)
        assert r.status_code == 404


# ---------- Payment Methods CRUD ----------

class TestPaymentMethods:
    bank_id = None
    upi_id = None

    def test_create_india_bank(self, headers):
        payload = {
            "country": "IN", "method_type": "bank",
            "holder_name": "Demo",
            "details": {"account": "123456789012", "ifsc": "HDFC0001234"},
            "nickname": "Salary", "linked_via": "manual",
        }
        r = requests.post(f"{BASE_URL}/payment-methods", json=payload, headers=headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_default"] is True
        assert data["verified"] is False
        assert data["verification_method"] == "micro_deposit"
        assert data["last4"] == "9012"
        assert "display" in data
        TestPaymentMethods.bank_id = data["id"]

    def test_create_india_upi(self, headers):
        payload = {
            "country": "IN", "method_type": "upi",
            "holder_name": "Demo",
            "details": {"vpa": "demo@okhdfc"},
            "linked_via": "manual",
        }
        r = requests.post(f"{BASE_URL}/payment-methods", json=payload, headers=headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["is_default"] is False
        TestPaymentMethods.upi_id = data["id"]

    def test_validation_ifsc_short(self, headers):
        r = requests.post(f"{BASE_URL}/payment-methods", json={
            "country": "IN", "method_type": "bank",
            "holder_name": "X", "details": {"account": "123456789012", "ifsc": "HDFC001"},
        }, headers=headers, timeout=10)
        assert r.status_code == 400
        assert "IFSC" in r.text.upper() or "too short" in r.text.lower()

    def test_validation_missing_account(self, headers):
        r = requests.post(f"{BASE_URL}/payment-methods", json={
            "country": "IN", "method_type": "bank",
            "holder_name": "X", "details": {"account": "", "ifsc": "HDFC0001234"},
        }, headers=headers, timeout=10)
        assert r.status_code == 400

    def test_list_default_first(self, headers):
        r = requests.get(f"{BASE_URL}/payment-methods", headers=headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        methods = data["methods"]
        assert len(methods) >= 2
        assert methods[0]["is_default"] is True
        assert methods[0]["id"] == TestPaymentMethods.bank_id

    def test_verify_init_and_confirm(self, headers):
        pid = TestPaymentMethods.bank_id
        r = requests.post(f"{BASE_URL}/payment-methods/{pid}/verify-init",
                          headers=headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "demo_hint" in data
        # Extract amounts from hint
        import re
        nums = [float(x) for x in re.findall(r"\d+\.\d+", data["demo_hint"])]
        assert len(nums) >= 2

        # Wrong amounts
        r2 = requests.post(f"{BASE_URL}/payment-methods/{pid}/verify",
                           json={"amounts": [0.01, 0.02]},
                           headers=headers, timeout=10)
        assert r2.status_code == 400

        # Correct amounts
        r3 = requests.post(f"{BASE_URL}/payment-methods/{pid}/verify",
                           json={"amounts": nums[:2]},
                           headers=headers, timeout=10)
        assert r3.status_code == 200, r3.text
        assert r3.json()["verified"] is True

    def test_set_default_flip(self, headers):
        r = requests.post(f"{BASE_URL}/payment-methods/{TestPaymentMethods.upi_id}/default",
                          headers=headers, timeout=10)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/payment-methods", headers=headers, timeout=10)
        methods = r2.json()["methods"]
        assert methods[0]["id"] == TestPaymentMethods.upi_id
        assert methods[0]["is_default"] is True

    def test_nickname_update(self, headers):
        r = requests.post(f"{BASE_URL}/payment-methods/{TestPaymentMethods.bank_id}/nickname",
                          json={"nickname": "Salary #2"}, headers=headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["nickname"] == "Salary #2"

    def test_delete_and_promote_default(self, headers):
        # UPI is currently default; delete it and confirm bank becomes default
        upi = TestPaymentMethods.upi_id
        r = requests.delete(f"{BASE_URL}/payment-methods/{upi}", headers=headers, timeout=10)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/payment-methods", headers=headers, timeout=10)
        methods = r2.json()["methods"]
        assert all(m["id"] != upi for m in methods)
        assert any(m["is_default"] for m in methods)


# ---------- Bank link (mock) ----------

class TestLinkBank:
    linked_id = None

    def test_link_hdfc(self, headers):
        payload = {"country": "IN", "bank_slug": "hdfc",
                   "bank_name": "HDFC Bank", "holder_name": "Demo"}
        r = requests.post(f"{BASE_URL}/payment-methods/link", json=payload,
                          headers=headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["verified"] is True
        assert data["linked_via"] == "link"
        assert data["bank_name"] == "HDFC Bank"
        TestLinkBank.linked_id = data["id"]


# ---------- Withdrawals ----------

class TestWithdrawals:
    def test_withdraw_requires_verified(self, headers):
        # Create an unverified method
        r = requests.post(f"{BASE_URL}/payment-methods", json={
            "country": "IN", "method_type": "upi",
            "holder_name": "X", "details": {"vpa": "unv@okhdfc"},
        }, headers=headers, timeout=10)
        assert r.status_code == 200
        pid = r.json()["id"]
        r2 = requests.post(f"{BASE_URL}/withdrawals",
                           json={"payment_method_id": pid, "amount": 10, "currency": "INR"},
                           headers=headers, timeout=10)
        assert r2.status_code == 400
        assert "verified" in r2.text.lower()

    def test_withdraw_ok(self, headers, fresh_user):
        pid = TestLinkBank.linked_id
        # Get current wallet
        w0 = requests.get(f"{BASE_URL}/wallet", headers=headers, timeout=10).json()
        inr0 = w0.get("balances", {}).get("INR", 0)
        r = requests.post(f"{BASE_URL}/withdrawals",
                          json={"payment_method_id": pid, "amount": 100, "currency": "INR"},
                          headers=headers, timeout=10)
        assert r.status_code == 200, r.text
        w1 = requests.get(f"{BASE_URL}/wallet", headers=headers, timeout=10).json()
        inr1 = w1.get("balances", {}).get("INR", 0)
        assert abs((inr0 - inr1) - 100) < 0.001, f"expected -100, got {inr0}->{inr1}"

    def test_withdraw_insufficient(self, headers):
        pid = TestLinkBank.linked_id
        r = requests.post(f"{BASE_URL}/withdrawals",
                          json={"payment_method_id": pid, "amount": 10_000_000, "currency": "INR"},
                          headers=headers, timeout=10)
        assert r.status_code == 400
        assert "insufficient" in r.text.lower()

    def test_list_withdrawals(self, headers):
        r = requests.get(f"{BASE_URL}/withdrawals", headers=headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        assert data[0]["amount"] == 100
        assert data[0]["currency"] == "INR"


# ---------- Detailed Recipients ----------

class TestDetailedRecipients:
    def test_create_uk_recipient(self, headers):
        payload = {"name": "Alice", "country": "GB", "method_type": "bank",
                   "details": {"sort_code": "12-34-56", "account": "12345678"},
                   "nickname": "UK Friend", "favorite": True}
        r = requests.post(f"{BASE_URL}/recipients/detailed", json=payload,
                          headers=headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "Alice"
        assert data["favorite"] is True
        assert data["verified"] is True
        assert data["verification_status"] == "verified_mock"

    def test_list_recipients_alice(self, headers):
        r = requests.get(f"{BASE_URL}/recipients", headers=headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        all_names = [x.get("name") for x in data.get("all", [])]
        fav_names = [x.get("name") for x in data.get("favorites", [])]
        assert "Alice" in all_names
        assert "Alice" in fav_names


# ---------- Finn explain ----------

class TestFinnExplain:
    @pytest.mark.parametrize("term", ["IFSC", "IBAN", "SWIFT", "ROUTING", "BSB", "VPA", "SEPA"])
    def test_library_terms(self, term):
        r = requests.post(f"{BASE_URL}/finn/explain-term",
                          json={"term": term}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["source"] == "library"
        assert data["answer"] and len(data["answer"]) > 10

    def test_fallback(self):
        r = requests.post(f"{BASE_URL}/finn/explain-term",
                          json={"term": "ZZZQQQ_UNKNOWN"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["source"] == "fallback"


# ---------- Onboarding status ----------

class TestOnboarding:
    def test_first_time_true(self):
        """A brand-new user (no PM, no recipient) must be first_time=true."""
        email = f"TEST_iter6_onboard_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{BASE_URL}/auth/register",
                            json={"email": email, "password": "testpass123",
                                  "full_name": "Onboard User"}, timeout=15)
        assert reg.status_code == 200
        token = reg.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE_URL}/onboarding/payment-status", headers=h, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["first_time"] is True
        assert data["has_payment_method"] is False
        assert data["has_recipient"] is False

        # Add a PM → first_time becomes false
        pm = requests.post(f"{BASE_URL}/payment-methods", json={
            "country": "IN", "method_type": "upi",
            "holder_name": "X", "details": {"vpa": "x@okhdfc"},
        }, headers={**h, "Content-Type": "application/json"}, timeout=10)
        assert pm.status_code == 200
        r2 = requests.get(f"{BASE_URL}/onboarding/payment-status", headers=h, timeout=10)
        d2 = r2.json()
        assert d2["first_time"] is False
        assert d2["has_payment_method"] is True
