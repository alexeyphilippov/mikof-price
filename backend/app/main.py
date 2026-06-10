from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.ratelimit import limiter
from app.core.config import settings
from app.api.routers import auth, directories, services, packages, requests, users, audit

app = FastAPI(title="Mikofai Price Panel")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Эндпоинты, которым CSRF-токен ещё недоступен (выдаётся в /login).
CSRF_EXEMPT = {"/api/auth/login", "/api/auth/refresh"}


@app.middleware("http")
async def csrf_and_security_headers(request: Request, call_next):
    if (
        request.method in ("POST", "PUT", "PATCH", "DELETE")
        and request.url.path.startswith("/api")
        and request.url.path not in CSRF_EXEMPT
    ):
        cookie = request.cookies.get("XSRF-TOKEN")
        if not cookie or cookie != request.headers.get("X-XSRF-TOKEN"):
            return JSONResponse({"detail": "CSRF token missing or invalid"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@app.get("/api/health")
async def health():
    return {"ok": True}


app.include_router(auth.router)
app.include_router(directories.router)
app.include_router(services.router)
app.include_router(packages.router)
app.include_router(requests.router)
app.include_router(users.router)
app.include_router(audit.router)
