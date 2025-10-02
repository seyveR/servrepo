from __future__ import annotations
import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.settings import CORS_ORIGINS, ORIGINAL_DIR, PROCESSED_DIR, REPORTS_DIR, UPLOAD_DIR
from app.db.database import Base, engine
from app.api.routes_infer import router as infer_router
from app.api.routes_audits import router as audits_router

# создаём таблицы
Base.metadata.create_all(engine)

# очистка каталога uploads
async def cleanup_uploads():  
    while True:
        now = time.time()
        cutoff = 60 * 60  # 1 час
        for folder in (ORIGINAL_DIR, PROCESSED_DIR, REPORTS_DIR):
            for p in Path(folder).glob("*"):
                try:
                    if p.is_file() and now - p.stat().st_mtime > cutoff:
                        p.unlink()
                except Exception:
                    pass 
        await asyncio.sleep(300)

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(cleanup_uploads())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="Silex Core API", version="4.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# статика
app.mount("/static", StaticFiles(directory=str(UPLOAD_DIR)), name="static")

# роуты
app.include_router(infer_router)
app.include_router(audits_router)
