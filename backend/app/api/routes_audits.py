from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models import Audit
from app.settings import UPLOAD_DIR

router = APIRouter()

def _url_to_path(static_url: Optional[str]) -> Optional[Path]:
    if not static_url:
        return None
    rel = static_url.replace("/static/", "")
    return UPLOAD_DIR / rel

def apply_filters(q, *, employee_id: Optional[str]=None, date: Optional[str]=None,
                  manual: Optional[str]=None, employees: Optional[List[str]]=None):
    if employee_id:
        q = q.filter(func.lower(Audit.employee_id).like(f"%{employee_id.lower()}%"))
    if employees:
        q = q.filter(Audit.employee_id.in_(employees))
    if date:
        q = q.filter(func.date(Audit.created_at) == date)
    if manual == "yes":
        q = q.filter(Audit.manual_check_required.is_(True))
    elif manual == "no":
        q = q.filter(Audit.manual_check_required.is_(False))
    return q

@router.get("/audit-dates")
def audit_dates(db: Session = Depends(get_db)):
    rows = db.query(func.date(Audit.created_at)).distinct().order_by(func.date(Audit.created_at).desc()).all()
    return [r[0].strftime("%Y-%m-%d") for r in rows]

@router.get("/audits")
def list_audits(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    employee_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    manual: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Audit).order_by(Audit.id.desc())
    q = apply_filters(q, employee_id=employee_id, date=date, manual=manual)
    total = q.count()
    size = 20  # фиксированный размер страницы
    items = q.offset((page - 1) * size).limit(size).all()

    def row(a: Audit) -> Dict[str, Any]:
        return {
            "id": a.id,
            "employee_id": a.employee_id,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "total_detections": a.total_detections,
            "all_tools_present": a.all_tools_present,
            "min_confidence": float(a.min_confidence),
            "manual_check_required": a.manual_check_required,
            "report_url": a.report_url,
        }

    return {"total": total, "page": page, "size": size, "items": [row(i) for i in items]}

@router.get("/audits/{audit_id}/report")
def get_report(audit_id: int, db: Session = Depends(get_db)):
    a = db.get(Audit, audit_id)
    if not a or not a.report_url:
        raise HTTPException(404, "Not found")
    file_path = _url_to_path(a.report_url)
    if not file_path or not file_path.exists():
        raise HTTPException(404, "Report file not found")
    return FileResponse(str(file_path), media_type="application/json", filename=f"audit_{audit_id}.json")

@router.delete("/audits/{audit_id}")
def delete_audit(audit_id: int, db: Session = Depends(get_db)):
    a = db.get(Audit, audit_id)
    if not a:
        raise HTTPException(404, "Not found")

    def _safe_unlink(p: Optional[Path]) -> None:
        try:
            if p and p.exists():
                p.unlink(missing_ok=True)
        except Exception:
            pass

    _safe_unlink(_url_to_path(a.original_url))
    _safe_unlink(_url_to_path(a.processed_url))
    _safe_unlink(_url_to_path(a.report_url))

    db.delete(a)
    db.commit()
    return {"ok": True, "deleted_id": audit_id}

@router.delete("/audits")
def clear_audits(confirm: str = Query(..., description="Type YES to confirm"), db: Session = Depends(get_db)):
    if confirm != "YES":
        raise HTTPException(400, "Confirmation required: pass confirm=YES")
    items = db.query(Audit).all()

    def _safe_unlink(p: Optional[Path]) -> None:
        try:
            if p and p.exists():
                p.unlink(missing_ok=True)
        except Exception:
            pass

    for a in items:
        _safe_unlink(_url_to_path(a.original_url))
        _safe_unlink(_url_to_path(a.processed_url))
        _safe_unlink(_url_to_path(a.report_url))
        db.delete(a)
    db.commit()
    return {"ok": True, "deleted": len(items)}

# ----- экспорт -----
class ExportRequest(BaseModel):
    date: Optional[str] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None
    size: int = 20
    status: str = "all"                 # 'all' | 'needed' | 'not_needed'
    employees: Optional[List[str]] = None
    employee_search: Optional[str] = None

@router.post("/audits/export")
def export_audits(req: ExportRequest, db: Session = Depends(get_db)):
    q = db.query(Audit).order_by(Audit.id.desc())

    manual = None
    if req.status == "needed": manual = "yes"
    elif req.status == "not_needed": manual = "no"

    q = apply_filters(q, employee_id=req.employee_search, date=req.date, manual=manual, employees=req.employees)

    if req.page_from and req.page_to:
        pf = max(1, int(req.page_from))
        pt = max(pf, int(req.page_to))
        size = max(1, int(req.size))
        offs = (pf - 1) * size
        lim = (pt - pf + 1) * size
        q = q.offset(offs).limit(lim)

    rows = q.all()

    def full_row(a: Audit) -> Dict[str, Any]:
        try:
            missing = json.loads(a.missing_tools)
        except Exception:
            missing = []
        try:
            extras = json.loads(a.extras_or_duplicates)
        except Exception:
            extras = []
        return {
            "id": a.id,
            "image_uid": a.image_uid,
            "employee_id": a.employee_id,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "total_detections": a.total_detections,
            "all_tools_present": a.all_tools_present,
            "min_confidence": float(a.min_confidence),
            "manual_check_required": a.manual_check_required,
            "missing_tools": missing,
            "extras_or_duplicates": extras,
            "original_url": a.original_url,
            "processed_url": a.processed_url,
            "report_url": a.report_url,
        }

    data = [full_row(r) for r in rows]
    tmp = NamedTemporaryFile("w", encoding="utf-8", suffix=".json", dir=str((UPLOAD_DIR / 'processed' / 'reports')), delete=False)
    with tmp as f:
        json.dump({"count": len(data), "items": data}, f, ensure_ascii=False, indent=2)
        temp_path = Path(f.name)

    fname = f"audit_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    return FileResponse(str(temp_path), media_type="application/json", filename=fname)

# ----- фасеты и статистика -----
@router.get("/audits/facets")
def audits_facets(db: Session = Depends(get_db)):
    dates = [
        d[0].strftime("%Y-%m-%d")
        for d in db.query(func.date(Audit.created_at)).distinct().order_by(func.date(Audit.created_at)).all()
        if d[0] is not None
    ]
    employees = [e[0] for e in db.query(Audit.employee_id).distinct().order_by(Audit.employee_id).all()]
    return {"dates": dates, "employees": employees}

@router.get("/audits/stats")
def audits_stats(
    date: Optional[str] = Query(None, description="YYYY-MM-DD — конкретная дата"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD — от"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD — до (включительно)"),
    manual: Optional[str] = Query(None, regex="^(yes|no|all)$", description="yes|no|all"),
    employee_ids: Optional[str] = Query(None, description="через запятую"),
    search: Optional[str] = Query(None, description="подстрока по employee_id, case-insensitive"),
    db: Session = Depends(get_db),
):
    q = db.query(Audit)

    from sqlalchemy import func as _f
    if date:
        q = q.filter(_f.date(Audit.created_at) == date)
    else:
        if date_from: q = q.filter(_f.date(Audit.created_at) >= date_from)
        if date_to:   q = q.filter(_f.date(Audit.created_at) <= date_to)

    if manual == "yes":
        q = q.filter(Audit.manual_check_required.is_(True))
    elif manual == "no":
        q = q.filter(Audit.manual_check_required.is_(False))

    if employee_ids:
        ids = [x.strip() for x in employee_ids.split(",") if x.strip()]
        if ids: q = q.filter(Audit.employee_id.in_(ids))
    if search:
        q = q.filter(_f.lower(Audit.employee_id).like(f"%{search.lower()}%"))

    rows: List[Audit] = q.order_by(Audit.created_at.asc()).all()
    total = len(rows)
    if not total:
        return {
            "total": 0,
            "detections": {"avg": 0, "min": 0, "max": 0},
            "manual": {"required": 0, "not_required": 0},
            "all_tools_present": {"yes": 0, "no": 0},
            "by_date": [], "by_employee": [], "min_conf_hist": [],
            "missing_top": [], "extras_top": [], "date_span": None,
        }

    d_min = min(r.created_at for r in rows)
    d_max = max(r.created_at for r in rows)
    det_vals = [r.total_detections for r in rows]
    det_stats = {"avg": round(sum(det_vals) / total, 2), "min": min(det_vals), "max": max(det_vals)}

    manual_req = sum(1 for r in rows if r.manual_check_required)
    all11_yes = sum(1 for r in rows if r.all_tools_present)

    by_date_map: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        dkey = r.created_at.strftime("%Y-%m-%d")
        it = by_date_map.setdefault(dkey, {"date": dkey, "count": 0, "manual": 0, "min_conf_sum": 0.0})
        it["count"] += 1; it["manual"] += 1 if r.manual_check_required else 0
        it["min_conf_sum"] += float(r.min_confidence)
    by_date = []
    for dkey, it in sorted(by_date_map.items()):
        avg_mc = it["min_conf_sum"] / it["count"] if it["count"] else 0.0
        by_date.append({"date": dkey, "count": it["count"], "manual": it["manual"], "avg_min_conf": round(avg_mc, 3)})

    by_emp_map: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        it = by_emp_map.setdefault(r.employee_id, {"employee_id": r.employee_id, "count": 0, "last": r.created_at})
        it["count"] += 1
        if r.created_at > it["last"]: it["last"] = r.created_at
    by_employee = sorted(
        ({"employee_id": k, "count": v["count"], "last": v["last"].strftime("%Y-%m-%d %H:%M:%S")} for k, v in by_emp_map.items()),
        key=lambda x: (-x["count"], x["employee_id"]),
    )

    def bucket(c: float) -> str:
        lo = int(c * 20) / 20.0
        hi = round(lo + 0.05, 2)
        return f"{lo:.2f}-{hi:.2f}"

    hist_map: Dict[str, int] = {}
    for r in rows:
        b = bucket(float(r.min_confidence))
        hist_map[b] = hist_map.get(b, 0) + 1
    min_conf_hist = [{"bucket": k, "count": hist_map[k]} for k in sorted(hist_map)]

    from collections import Counter
    miss_cnt: Counter[str] = Counter()
    extra_cnt: Counter[str] = Counter()

    for r in rows:
        try:
            m = json.loads(r.missing_tools or "[]")
            if isinstance(m, list): miss_cnt.update([str(x) for x in m])
        except Exception: pass
        try:
            e = json.loads(r.extras_or_duplicates or "[]")
            if isinstance(e, list): extra_cnt.update([str(x) for x in e])
        except Exception: pass

    def top(counter, n=10):
        return [{"name": k, "count": v} for k, v in counter.most_common(n)]

    return {
        "total": total,
        "detections": det_stats,
        "manual": {"required": manual_req, "not_required": total - manual_req},
        "all_tools_present": {"yes": all11_yes, "no": total - all11_yes},
        "by_date": by_date,
        "by_employee": by_employee[:20],
        "min_conf_hist": min_conf_hist,
        "missing_top": top(miss_cnt, 12),
        "extras_top": top(extra_cnt, 12),
        "date_span": {"from": d_min.strftime("%Y-%m-%d %H:%M:%S"), "to": d_max.strftime("%Y-%m-%d %H:%M:%S")},
    }
