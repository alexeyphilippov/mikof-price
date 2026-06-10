from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api.routers import auth, directories, services, packages, requests, users, audit

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Mikofai Price Panel")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda _, exc: exc)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
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
