from pathlib import Path
import os

# Базовые пути
BASE_DIR = Path(__file__).resolve().parents[1]       # backend/
APP_DIR = Path(__file__).resolve().parent           # backend/app
UPLOAD_DIR = BASE_DIR / "uploads"
ORIGINAL_DIR = UPLOAD_DIR / "original"
PROCESSED_DIR = UPLOAD_DIR / "processed"
REPORTS_DIR = PROCESSED_DIR / "reports"

for d in (UPLOAD_DIR, ORIGINAL_DIR, PROCESSED_DIR, REPORTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# DB
DB_URL = os.getenv(
    "DB_URL", "mysql+pymysql://app:app@db:3306/tools?charset=utf8mb4")

# Модели
MODELS_DIR = APP_DIR / "models"
DET_MODEL_PATH = MODELS_DIR / "yoloM_onlygroup.pt"
SEG_MODEL_PATH = MODELS_DIR / "best-seg.pt"     # YOLO(seg) - test
DOP_MODEL_PATH = MODELS_DIR / "yoloM-dop.pt"    # доп.детектор

# CORS
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "*"]
