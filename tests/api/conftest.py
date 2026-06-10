import os
import httpx
import pytest

BASE = os.getenv("API_BASE", "http://localhost:8000")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "filippov.ao@phystech.edu")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
SEED_PASSWORD = os.getenv("SEED_PASSWORD")

ACCOUNTS = {
    "r1": (ADMIN_EMAIL, ADMIN_PASSWORD),
    "r2": ("cfo@mikofai.ru", SEED_PASSWORD),
    "r3": ("med@mikofai.ru", SEED_PASSWORD),
    "r4": ("staff@mikofai.ru", SEED_PASSWORD),
}


def _client(role: str) -> httpx.Client:
    email, password = ACCOUNTS[role]
    if not password:
        pytest.skip("Set ADMIN_PASSWORD and SEED_PASSWORD env vars to run API tests")
    c = httpx.Client(base_url=BASE, timeout=15)
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {role} failed: {r.text}"
    token = c.cookies.get("XSRF-TOKEN")
    if token:
        c.headers["X-XSRF-TOKEN"] = token
    return c


@pytest.fixture
def r1():
    c = _client("r1")
    yield c
    c.close()


@pytest.fixture
def r2():
    c = _client("r2")
    yield c
    c.close()


@pytest.fixture
def r3():
    c = _client("r3")
    yield c
    c.close()


@pytest.fixture
def r4():
    c = _client("r4")
    yield c
    c.close()
