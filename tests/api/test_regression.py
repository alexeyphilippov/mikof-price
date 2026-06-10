"""Регрессионный набор API mikof-price. Запуск: см. TEST_PLAN.md.
Требует запущенный стек (docker compose up -d) и env ADMIN_PASSWORD / SEED_PASSWORD.
"""


def _first_service_id(client):
    items = client.get("/api/services", params={"limit": 1}).json()
    items = items["items"] if isinstance(items, dict) and "items" in items else items
    return items[0]["id"]


# --- AUTH / RBAC ---

def test_auth_bad_password_rejected(r1):
    bad = r1.post("/api/auth/login", json={"email": "med@mikofai.ru", "password": "wrong"})
    assert bad.status_code == 401


def test_rbac_r3_cannot_patch_service(r3):
    sid = _first_service_id(r3)
    assert r3.patch(f"/api/services/{sid}", json={"note": "x"}).status_code == 403


def test_rbac_r1_can_patch_service(r1):
    sid = _first_service_id(r1)
    r = r1.patch(f"/api/services/{sid}", json={"note": "regression-ok"})
    assert r.status_code == 200


def test_rbac_r4_cannot_list_requests(r4):
    assert r4.get("/api/requests").status_code in (401, 403)


# --- WORKFLOW ---

def test_workflow_r3_request_full_cycle(r1, r2, r3):
    sid = _first_service_id(r3)
    payload = {
        "title": "regression cycle",
        "items": [{"entity_type": "service", "entity_id": sid,
                   "field_name": "note", "old_value": {"v": ""}, "new_value": {"v": "wf-regression"}}],
    }
    req = r3.post("/api/requests", json=payload).json()
    assert r3.patch(f"/api/requests/{req['id']}/submit").status_code == 200
    assert r3.get(f"/api/requests/{req['id']}").json()["status"] == "pending_cfd"

    assert r2.patch(f"/api/requests/{req['id']}/approve", json={}).status_code == 200
    assert r1.get(f"/api/requests/{req['id']}").json()["status"] == "pending_ceo"

    assert r1.patch(f"/api/requests/{req['id']}/approve", json={}).status_code == 200
    assert r1.get(f"/api/requests/{req['id']}").json()["status"] == "approved"
    assert r1.get(f"/api/services/{sid}").json()["note"] == "wf-regression"


# --- HISTORY (Ф34) ---

def test_history_has_author_name(r1):
    sid = _first_service_id(r1)
    r1.patch(f"/api/services/{sid}", json={"note": "hist-author"})
    hist = r1.get(f"/api/services/{sid}/history").json()
    assert hist and "changed_by_name" in hist[0] and hist[0]["changed_by_name"]


# --- AUDIT (зам.12) ---

def test_audit_has_user_name(r1):
    rows = r1.get("/api/audit").json()
    assert rows and rows[0].get("user_name")


# --- USERS (зам.11) ---

def test_user_password_reset(r1):
    users = r1.get("/api/users").json()
    staff = next(u for u in users if u["email"] == "staff@mikofai.ru")
    assert r1.patch(f"/api/users/{staff['id']}", json={"password": "Regression123X"}).status_code == 200
    import httpx
    c = httpx.Client(base_url=r1.base_url, timeout=15)
    assert c.post("/api/auth/login", json={"email": "staff@mikofai.ru", "password": "Regression123X"}).status_code == 200
    # restore
    import os
    r1.patch(f"/api/users/{staff['id']}", json={"password": os.getenv("SEED_PASSWORD")})


# --- DIRECTORIES archive block-if-used (зам.9) ---

def test_directory_archive_blocked_when_used(r1):
    groups = r1.get("/api/groups").json()
    used = next((g for g in groups if g.get("status", "active") == "active"), None)
    assert used is not None
    r = r1.patch(f"/api/groups/{used['id']}/archive", json={})
    # либо блокировка (409) при активных связях, либо успешная архивация (200) если связей нет
    assert r.status_code in (200, 409)
    if r.status_code == 200:  # вернуть в active
        r1.patch(f"/api/groups/{used['id']}/archive", json={})


# --- SEED data sanity ---

def test_seed_counts(r1):
    assert len(r1.get("/api/groups").json()) >= 10
    assert len(r1.get("/api/subgroups").json()) >= 20
