import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .alerts.engine import start_background, stop_background
from .database import init_db
from .routers import connectors, status, settings, ai, auth, users, license, alerts, setup, proxmox, ssh, docker_ctrl, wol


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    start_background()
    try:
        yield
    finally:
        await stop_background()


# CORS_ORIGINS kann als kommaseparierte Liste gesetzt werden, z.B.:
#   CORS_ORIGINS=http://localhost:5173,https://nexboard.example.com
# Im Docker-Produktionsbetrieb (nginx-Proxy) ist CORS nicht erforderlich;
# der Default deckt nur lokale Entwicklung ab.
_raw_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
_cors_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="Nexboard API", version="0.6.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(license.router, prefix="/api")
app.include_router(connectors.router, prefix="/api")
app.include_router(status.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(setup.router, prefix="/api")
app.include_router(proxmox.router, prefix="/api")
app.include_router(ssh.router, prefix="/api")
app.include_router(docker_ctrl.router, prefix="/api")
app.include_router(wol.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "nexboard", "version": "0.6.0"}
