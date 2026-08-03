"""Shared fixtures for GlobalPay AI backend tests."""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend/.env to read EXPO_PUBLIC_BACKEND_URL (public URL for e2e testing)
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def registered_user(api):
    """Fresh test user per session (unique email)."""
    email = f"TEST_{uuid.uuid4().hex[:10]}@globalpay.ai"
    payload = {"email": email, "password": "testpass123", "full_name": "TEST User"}
    r = api.post(f"{BASE_URL}/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "password": "testpass123", "token": data["token"], "user": data["user"]}


@pytest.fixture(scope="session")
def auth_headers(registered_user):
    return {"Authorization": f"Bearer {registered_user['token']}", "Content-Type": "application/json"}
