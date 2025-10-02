from __future__ import annotations
import uuid
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from fastapi import APIRouter, Request, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.settings import ORIGINAL_DIR, PROCESSED_DIR, REPORTS_DIR
from app.db.database import get_db
from app.db.models import Audit
from sqlalchemy.orm import Session

from app.services.inference import run_pipeline, draw_custom

router = APIRouter()

def _abs_url(request: Request, rel: str) -> str:
    base = str(request.base_url).rstrip("/")
    return base + rel

@router.post("/infer")
async def infer_endpoint(
    request: Request,
    image: UploadFile = File(...),
    employee_id: str = Form(...),

    check_thr: float = Form(0.70),     # 0..1
    render_thr: float = Form(0.60),    # 0..1
    model_kind: str = Form("det"),     # "det" | "seg"

    draw_boxes: bool = Form(True),
    draw_labels: bool = Form(True),
    draw_masks: bool = Form(False),
    db: Session = Depends(get_db),
):
    # сохранить оригинал
    ext = Path(image.filename).suffix or ".jpg"
    uid = uuid.uuid4().hex
    original_path = ORIGINAL_DIR / f"{uid}{ext}"
    processed_path = PROCESSED_DIR / f"{uid}.jpg"
    report_path = REPORTS_DIR / f"{uid}.json"

    with original_path.open("wb") as f:
        f.write(await image.read())

    # инференс
    try:
        pred: Dict[str, Any] = run_pipeline(original_path, model_kind=model_kind, check_thr=check_thr)
    except RuntimeError as e:
        raise HTTPException(400, str(e))

    dets = pred["detections"]
    summary = pred["summary"]

    # рендер
    if not draw_boxes and not draw_labels and not draw_masks:
        processed_path.write_bytes(original_path.read_bytes())
    else:
        draw_custom(
            original_path,
            dets,
            render_thr=render_thr,
            draw_boxes=draw_boxes,
            draw_labels=draw_labels,
            out_path=processed_path,
            draw_masks=(draw_masks and model_kind == "seg"),
        )

    # отчёт
    original_url = f"/static/original/{original_path.name}"
    processed_url = f"/static/processed/{processed_path.name}"
    processed_url_abs = _abs_url(request, processed_url)

    report_data = {
        "image_width": pred["w"],
        "image_height": pred["h"],
        "detections": dets,
        "summary": summary,
        "original_url": original_url,
        "processed_url": processed_url,
        "employee_id": employee_id,
        "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "model_kind": model_kind,
        "check_threshold": check_thr,
        "render_threshold": render_thr,
        "draw_masks": bool(draw_masks and model_kind == "seg"),
    }
    with report_path.open("w", encoding="utf-8") as f:
        json.dump(report_data, f, ensure_ascii=False, indent=2)
    report_url = f"/static/processed/reports/{report_path.name}"

    # запись в БД
    a = Audit(
        image_uid=uid,
        employee_id=employee_id,
        total_detections=len([d for d in dets if d["confidence"] >= check_thr]),
        all_tools_present=summary["all_tools_present"],
        min_confidence=float(summary["min_confidence"]),
        manual_check_required=summary["manual_check_required"],
        missing_tools=json.dumps(summary["missing_tools"], ensure_ascii=False),
        extras_or_duplicates=json.dumps(summary["extras_or_duplicates"], ensure_ascii=False),
        original_url=original_url,
        processed_url=processed_url,
        report_url=report_url,
    )
    db.add(a); db.commit(); db.refresh(a)

    return JSONResponse({
        "audit_id": a.id,
        "image_width": pred["w"],
        "image_height": pred["h"],
        "detections": dets,
        "summary": summary,
        "original_url": original_url,
        "processed_url": processed_url,
        "processed_url_abs": processed_url_abs,
    })
