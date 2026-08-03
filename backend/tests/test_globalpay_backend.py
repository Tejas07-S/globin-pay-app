"""GlobalPay AI backend end-to-end tests.
Covers: auth, wallet, rates, fee quote, transfers, invoices, KYC, analytics, AI chat, auth guard.
"""
import uuid
import requests
import pytest


# ---------- Health ----------
class TestHealth:
    def test_root(self, api, base_url):
        r = api.get(f"{base_url}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_register_seeds_balances_and_returns_jwt(self, registered_user):
        u = registered_user["user"]
        assert registered_user["token"]
        assert u["kyc_status"] == "pending"
        b = u["balances"]
        assert b["USD"] == 2500.00
        assert b["EUR"] == 830.50
        assert b["GBP"] == 420.00
        assert b["INR"] == 15000.00
        assert "password" not in u
        assert "_id" not in u

    def test_register_duplicate_email_rejected(self, api, base_url, registered_user):
        r = api.post(f"{base_url}/auth/register", json={
            "email": registered_user["email"], "password": "testpass123", "full_name": "TEST User"
        })
        assert r.status_code == 400

    def test_login_success(self, api, base_url, registered_user):
        r = api.post(f"{base_url}/auth/login", json={
            "email": registered_user["email"], "password": registered_user["password"],
        })
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_invalid_password(self, api, base_url, registered_user):
        r = api.post(f"{base_url}/auth/login", json={
            "email": registered_user["email"], "password": "wrongpass",
        })
        assert r.status_code == 401

    def test_me_returns_current_user(self, api, base_url, auth_headers, registered_user):
        r = api.get(f"{base_url}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == registered_user["email"].lower()


# ---------- Auth guard ----------
class TestAuthGuard:
    @pytest.mark.parametrize("path,method", [
        ("/auth/me", "get"),
        ("/wallet", "get"),
        ("/transfers", "get"),
        ("/transfers", "post"),
        ("/invoices", "get"),
        ("/invoices", "post"),
        ("/kyc", "post"),
        ("/analytics", "get"),
        ("/ai/chat", "post"),
        ("/ai/history?session_id=x", "get"),
    ])
    def test_protected_endpoint_without_token_returns_401(self, api, base_url, path, method):
        url = f"{base_url}{path}"
        r = getattr(requests, method)(url, json={} if method == "post" else None)
        assert r.status_code == 401, f"{method.upper()} {path} expected 401 got {r.status_code}"


# ---------- Wallet ----------
class TestWallet:
    def test_wallet_balances_and_total_usd(self, api, base_url, auth_headers):
        r = api.get(f"{base_url}/wallet", headers=auth_headers)
        assert r.status_code == 200
        j = r.json()
        assert "balances" in j and "total_usd" in j
        assert j["balances"]["USD"] == 2500.00
        assert j["total_usd"] > 0


# ---------- Rates ----------
class TestRates:
    def test_rates_returns_10_pairs_with_sparklines(self, api, base_url):
        r = api.get(f"{base_url}/rates?base=USD")
        assert r.status_code == 200
        j = r.json()
        assert j["base"] == "USD"
        assert len(j["rates"]) == 10
        for p in j["rates"]:
            assert set(["pair", "quote", "rate", "change_pct", "sparkline"]).issubset(p.keys())
            assert isinstance(p["sparkline"], list) and len(p["sparkline"]) == 7
            assert isinstance(p["rate"], (int, float))

    def test_rates_invalid_base(self, api, base_url):
        r = api.get(f"{base_url}/rates?base=XXX")
        assert r.status_code == 400

    def test_rates_predict(self, api, base_url):
        r = api.get(f"{base_url}/rates/predict?base=USD&quote=EUR")
        assert r.status_code == 200
        j = r.json()
        for k in ["today", "tomorrow", "week", "best_day", "confidence"]:
            assert k in j
        assert len(j["week"]) == 7
        assert 0 <= j["confidence"] <= 100
        assert j["best_day"] in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# ---------- Fee quote ----------
class TestFeeQuote:
    def test_fee_quote_structure(self, api, base_url):
        r = api.get(f"{base_url}/fee/quote", params={
            "from_currency": "USD", "to_currency": "EUR", "amount": 500
        })
        assert r.status_code == 200
        j = r.json()
        assert j["amount_sent"] == 500
        assert j["hidden_fees"] == 0.0
        assert j["transfer_fee"] > 0
        assert j["receiving_amount"] > 0
        assert j["savings_vs_paypal"] > 0
        assert isinstance(j["exchange_rate"], (int, float))


# ---------- Transfers ----------
class TestTransfers:
    def test_transfer_debits_balance_and_persists(self, api, base_url, auth_headers):
        # baseline
        w1 = api.get(f"{base_url}/wallet", headers=auth_headers).json()
        usd_before = w1["balances"]["USD"]

        payload = {
            "from_currency": "USD", "to_currency": "EUR", "amount": 100.0,
            "recipient_name": "TEST Alice", "recipient_country": "France", "note": "TEST"
        }
        r = api.post(f"{base_url}/transfers", headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["from_currency"] == "USD"
        assert tx["to_currency"] == "EUR"
        assert tx["status"] == "completed"
        assert "id" in tx and "_id" not in tx

        w2 = api.get(f"{base_url}/wallet", headers=auth_headers).json()
        assert round(w2["balances"]["USD"], 2) == round(usd_before - 100.0, 2)

        # list transfers
        lr = api.get(f"{base_url}/transfers", headers=auth_headers)
        assert lr.status_code == 200
        ids = [t["id"] for t in lr.json()]
        assert tx["id"] in ids

    def test_transfer_insufficient_funds(self, api, base_url, auth_headers):
        r = api.post(f"{base_url}/transfers", headers=auth_headers, json={
            "from_currency": "USD", "to_currency": "EUR", "amount": 10_000_000,
            "recipient_name": "X", "recipient_country": "Y",
        })
        assert r.status_code == 400


# ---------- Invoices ----------
class TestInvoices:
    def test_invoice_create_list_mark_paid_credits_balance(self, api, base_url, auth_headers):
        payload = {
            "client_name": "TEST Client", "client_email": "client@test.com",
            "amount": 300.0, "currency": "EUR", "description": "TEST work", "due_days": 7
        }
        r = api.post(f"{base_url}/invoices", headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["status"] == "pending"
        assert inv["currency"] == "EUR"
        assert inv["payment_link"].startswith("https://")
        inv_id = inv["id"]

        lr = api.get(f"{base_url}/invoices", headers=auth_headers)
        assert lr.status_code == 200
        assert any(i["id"] == inv_id for i in lr.json())

        eur_before = api.get(f"{base_url}/wallet", headers=auth_headers).json()["balances"]["EUR"]

        m = api.post(f"{base_url}/invoices/{inv_id}/mark-paid", headers=auth_headers)
        assert m.status_code == 200
        assert m.json().get("ok") is True

        eur_after = api.get(f"{base_url}/wallet", headers=auth_headers).json()["balances"]["EUR"]
        assert round(eur_after - eur_before, 2) == 300.00

        # Verify status persisted
        after = api.get(f"{base_url}/invoices", headers=auth_headers).json()
        target = next(i for i in after if i["id"] == inv_id)
        assert target["status"] == "paid"

    def test_mark_paid_unknown_invoice_404(self, api, base_url, auth_headers):
        r = api.post(f"{base_url}/invoices/{uuid.uuid4()}/mark-paid", headers=auth_headers)
        assert r.status_code == 404


# ---------- KYC ----------
class TestKYC:
    def test_kyc_submit_flips_status_verified(self, api, base_url, auth_headers):
        payload = {
            "doc_type": "passport", "doc_number": "TESTX123",
            "country": "IN", "date_of_birth": "1990-01-01", "address": "TEST addr",
        }
        r = api.post(f"{base_url}/kyc", headers=auth_headers, json=payload)
        assert r.status_code == 200
        assert r.json()["status"] == "verified"

        me = api.get(f"{base_url}/auth/me", headers=auth_headers).json()
        assert me["kyc_status"] == "verified"


# ---------- Analytics ----------
class TestAnalytics:
    def test_analytics_shape(self, api, base_url, auth_headers):
        r = api.get(f"{base_url}/analytics", headers=auth_headers)
        assert r.status_code == 200
        j = r.json()
        for k in ["net_worth_usd", "spending_series", "income_series",
                  "allocation", "categories", "financial_health_score", "months"]:
            assert k in j, f"missing {k}"
        assert len(j["months"]) == 6
        assert len(j["spending_series"]) == 6
        assert len(j["income_series"]) == 6
        assert 20 <= j["financial_health_score"] <= 98
        assert isinstance(j["allocation"], list) and len(j["allocation"]) >= 1
        for a in j["allocation"]:
            assert "currency" in a and "usd_value" in a and "pct" in a


# ---------- AI chat ----------
class TestAIChat:
    def test_ai_chat_persists_and_history(self, api, base_url, auth_headers):
        session_id = f"TEST_{uuid.uuid4().hex[:10]}"
        r = api.post(f"{base_url}/ai/chat", headers=auth_headers, json={
            "session_id": session_id, "message": "Hello, in one short sentence what is FX?"
        }, timeout=90)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "reply" in j and isinstance(j["reply"], str) and len(j["reply"]) > 0

        hist = api.get(f"{base_url}/ai/history", headers=auth_headers,
                       params={"session_id": session_id})
        assert hist.status_code == 200
        msgs = hist.json()
        # 1 user + 1 assistant persisted
        assert len(msgs) >= 2
        roles = [m["role"] for m in msgs]
        assert "user" in roles and "assistant" in roles
