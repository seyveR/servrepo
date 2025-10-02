from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import colorsys
import math

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO

from app.settings import DET_MODEL_PATH, SEG_MODEL_PATH, DOP_MODEL_PATH
# ========== загрузка моделей ==========
DET_MODEL = YOLO(str(DET_MODEL_PATH))
SEG_MODEL: Optional[YOLO] = YOLO(
    str(SEG_MODEL_PATH)) if SEG_MODEL_PATH.exists() else None
DOP_MODEL: Optional[YOLO] = YOLO(
    str(DOP_MODEL_PATH)) if DOP_MODEL_PATH.exists() else None

# ========= RU-имена + канонизация SEG =========
RU_NAME_MAP: Dict[str, str] = {
    "otvertka-minus": 'Отвертка -',
    "otvertka-plus":  "Отвертка +",
    "otvertka-smesh": "Отвертка смещённый крест",
    "kolovorot":      "Коловорот",
    "pass-contr":     "Пассатижи контровочные",
    "pass":           "Пассатижи",
    "sherniza":       "Шэрница",
    "razv-key":       "Разводной ключ",
    "otkrivashka":    "Открывашка банок с маслом",
    "rozhkov-key":    "Ключ рожковый накидной 3/4",
    "bokorezi":       "Бокорезы",

    # синонимы из SEG-модели
    "open-oil":       "Открывашка банок с маслом",
    "passatizhi":     "Пассатижи",
    "rozh-key":       "Ключ рожковый накидной 3/4",
}

CLASS_ORDER: List[str] = list(DET_MODEL.model.names.values())

# seg->det
SEG_TO_DET_CANON: Dict[str, str] = {
    "open-oil":   "otkrivashka",
    "passatizhi": "pass",
    "rozh-key":   "rozhkov-key",
    # остальные совпадают
}

# ========= цветовая палитра =========


def build_palette(n: int, s: float = 0.85, v: float = 0.95) -> List[Tuple[int, int, int]]:
    out = []
    for i in range(n):
        h = i / max(1, n)
        r, g, b = colorsys.hsv_to_rgb(h, s, v)
        out.append((int(r * 255), int(g * 255), int(b * 255)))
    return out


COLOR_PALETTE = build_palette(len(CLASS_ORDER))
COLOR_MAP = {name: COLOR_PALETTE[i] for i, name in enumerate(CLASS_ORDER)}


def class_rgb(name_en: str) -> Tuple[int, int, int]:
    return COLOR_MAP.get(name_en, (255, 255, 255))


# ========= шрифт =========
FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
]


def load_font(size: int = 22) -> ImageFont.FreeTypeFont:
    for p in FONT_CANDIDATES:
        if p.exists():
            return ImageFont.truetype(str(p), size=size)
    return ImageFont.load_default()

# ========= геометрия / NMS =========


def iou_xyxy(a: List[float], b: List[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, (ax2 - ax1)) * max(0.0, (ay2 - ay1))
    area_b = max(0.0, (bx2 - bx1)) * max(0.0, (by2 - by1))
    denom = area_a + area_b - inter
    return inter / denom if denom > 0 else 0.0


def box_containment(a: List[float], b: List[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    area_a = max(0.0, (ax2 - ax1)) * max(0.0, (ay2 - ay1))
    area_b = max(0.0, (bx2 - bx1)) * max(0.0, (by2 - by1))
    m = max(1e-9, min(area_a, area_b))
    return inter / m


def centers_and_sizes(b: List[float]):
    x1, y1, x2, y2 = b
    cx = 0.5 * (x1 + x2)
    cy = 0.5 * (y1 + y2)
    w = max(1e-6, x2 - x1)
    h = max(1e-6, y2 - y1)
    return cx, cy, w, h


def center_distance_norm(a: List[float], b: List[float]) -> float:
    cxa, cya, wa, ha = centers_and_sizes(a)
    cxb, cyb, wb, hb = centers_and_sizes(b)
    dist = math.hypot(cxa - cxb, cya - cyb)
    diag = max(math.hypot(wa, ha), math.hypot(wb, hb))
    return dist / max(1e-6, diag)


def axis_overlap_ratios(a: List[float], b: List[float]) -> Tuple[float, float]:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    w_a = max(1e-6, ax2 - ax1)
    h_a = max(1e-6, ay2 - ay1)
    w_b = max(1e-6, bx2 - bx1)
    h_b = max(1e-6, by2 - by1)
    ox = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    oy = max(0.0, min(ay2, by2) - max(ay1, by1))
    rx = ox / min(w_a, w_b)
    ry = oy / min(h_a, h_b)
    return rx, ry


SPECIAL_NMS = {
    "kolovorot":      {"iou": 0.35, "contain": 0.60, "center": 0.25, "side": 0.65},
    "otvertka-plus":  {"iou": 0.50, "contain": 0.80, "center": 0.22, "side": 0.70},
    "otvertka-minus": {"iou": 0.50, "contain": 0.80, "center": 0.22, "side": 0.70},
    "otvertka-smesh": {"iou": 0.50, "contain": 0.80, "center": 0.22, "side": 0.70},
}


def classwise_nms(dets: List[Dict[str, Any]], default_iou: float = 0.55, default_contain: float = 0.90) -> List[Dict[str, Any]]:
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    for d in dets:
        by_class.setdefault(d["class_name"], []).append(d)
    kept: List[Dict[str, Any]] = []
    for cls, arr in by_class.items():
        arr = sorted(arr, key=lambda x: float(x["confidence"]), reverse=True)
        cfg = SPECIAL_NMS.get(cls, {})
        iou_thr = cfg.get("iou", default_iou)
        contain_thr = cfg.get("contain", default_contain)
        center_thr = cfg.get("center", None)
        side_thr = cfg.get("side",   None)
        chosen: List[Dict[str, Any]] = []
        for cand in arr:
            ok = True
            for prev in chosen:
                i = iou_xyxy(cand["bbox_xyxy"], prev["bbox_xyxy"])
                c = box_containment(cand["bbox_xyxy"], prev["bbox_xyxy"])
                if i >= iou_thr or c >= contain_thr:
                    ok = False
                    break
                if center_thr is not None and side_thr is not None:
                    dist = center_distance_norm(
                        cand["bbox_xyxy"], prev["bbox_xyxy"])
                    rx, ry = axis_overlap_ratios(
                        cand["bbox_xyxy"], prev["bbox_xyxy"])
                    if dist <= center_thr and (rx >= side_thr or ry >= side_thr):
                        ok = False
                        break
            if ok:
                chosen.append(cand)
        kept.extend(chosen)
    return kept

# ========= yolo utils =========


def yolo_detect_boxes(model: YOLO, image_path: str, conf: float, iou: float = 0.65) -> Dict[str, Any]:
    results = model.predict(
        source=image_path, conf=conf, iou=iou,
        imgsz=1280, max_det=300, agnostic_nms=True, verbose=False,
    )
    r = results[0]
    names = r.names
    w, h = r.orig_shape[1], r.orig_shape[0]
    dets: List[Dict[str, Any]] = []
    if r.boxes is not None:
        for idx, b in enumerate(r.boxes):
            cls = int(b.cls.item())
            score = float(b.conf.item())
            x1, y1, x2, y2 = [float(x) for x in b.xyxy.squeeze().tolist()]
            en = names[cls]
            ru = RU_NAME_MAP.get(en, en)

            mask_poly = None
            if getattr(r, "masks", None) is not None and r.masks is not None:
                if r.masks.xyn is not None and idx < len(r.masks.xyn):
                    xy = r.masks.xyn[idx]
                    pts = [(float(px) * w, float(py) * h) for px, py in xy]
                    mask_poly = pts

            dets.append(
                {
                    "class_id": cls,
                    "class_name": en,
                    "class_name_ru": ru,
                    "confidence": score,
                    "bbox_xyxy": [x1, y1, x2, y2],
                    **({"mask": mask_poly} if mask_poly else {}),
                }
            )
    return {"w": w, "h": h, "detections": dets}


def seg_kolovorot_box(image_path: str, conf: float) -> Optional[Dict[str, Any]]:
    if SEG_MODEL is None:
        return None
    results = SEG_MODEL.predict(
        source=image_path, conf=conf, iou=0.5, imgsz=960, max_det=20, verbose=False)
    if not results:
        return None
    r = results[0]
    names = r.names
    best, best_conf = None, -1.0
    if r.boxes is None:
        return None
    for b in r.boxes:
        cls = int(b.cls.item())
        en = names[cls]
        if en != "kolovorot":
            continue
        score = float(b.conf.item())
        x1, y1, x2, y2 = [float(x) for x in b.xyxy.squeeze().tolist()]
        if score > best_conf:
            best_conf = score
            best = {
                "class_id": cls, "class_name": "kolovorot",
                "class_name_ru": RU_NAME_MAP.get("kolovorot", "kolovorot"),
                "confidence": score, "bbox_xyxy": [x1, y1, x2, y2],
            }
    return best


# ========= сводка =========
REQUIRED_CLASSES: List[str] = CLASS_ORDER


def make_summary(dets: List[Dict[str, Any]], check_thr: float) -> Dict[str, Any]:
    f = [d for d in dets if d["confidence"] >= check_thr]
    min_conf = min([d["confidence"] for d in f], default=0.0)
    by_class: Dict[str, int] = {}
    for d in f:
        en = d["class_name"]
        by_class[en] = by_class.get(en, 0) + 1
    missing_en = [c for c in REQUIRED_CLASSES if by_class.get(c, 0) == 0]
    missing_ru = [RU_NAME_MAP.get(c, c) for c in missing_en]
    extras_or_dups_ru: List[str] = []
    for en, n in by_class.items():
        if n > 1:
            extras_or_dups_ru.append(f'{RU_NAME_MAP.get(en, en)} x{n}')
    manual = (len(missing_ru) > 0) or (
        len(extras_or_dups_ru) > 0) or (min_conf < check_thr)
    return {
        "all_tools_present": (not missing_ru and not extras_or_dups_ru),
        "missing_tools": missing_ru,
        "extras_or_duplicates": extras_or_dups_ru,
        "min_confidence": float(min_conf),
        "manual_check_required": bool(manual),
    }

# ========= отрисовка =========


def draw_custom(image_path: Path, dets: List[Dict[str, Any]], render_thr: float,
                draw_boxes: bool, draw_labels: bool, out_path: Path, *, draw_masks: bool = False) -> None:
    bgr = cv2.imread(str(image_path))
    if bgr is None:
        raise RuntimeError(f"Can't read image: {image_path}")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    im = Image.fromarray(rgb)
    draw = ImageDraw.Draw(im, "RGBA")

    H, W = bgr.shape[:2]
    box_thickness = max(4, int(min(W, H) * 0.006))
    font_size = max(20, int(min(W, H) * 0.028))
    font = load_font(size=font_size)
    pad = max(6, box_thickness)

    for d in dets:
        if d["confidence"] < render_thr:
            continue
        x1, y1, x2, y2 = [int(round(t)) for t in d["bbox_xyxy"]]
        en_name = d["class_name"]
        ru_name = d.get("class_name_ru") or en_name
        conf_frac = max(0.0, min(1.0, float(d["confidence"])))
        color = class_rgb(en_name)
        label = f"{ru_name} {conf_frac:.2f}"

        if draw_masks and d.get("mask"):
            poly = [(float(px), float(py)) for px, py in d["mask"]]
            draw.polygon(poly, fill=(color[0], color[1], color[2], 90))
        if draw_boxes:
            for off in range(box_thickness):
                draw.rectangle(
                    [(x1-off, y1-off), (x2+off, y2+off)], outline=color)
        if draw_labels:
            x0, y0, x3, y3 = draw.textbbox((0, 0), label, font=font)
            tw, th = (x3-x0), (y3-y0)
            bx = max(0, min(x1, W - tw - pad*2))
            by = max(0, y1 - th - pad*2)
            draw.rectangle([(bx, by), (bx+tw+pad*2, by+th+pad*2)],
                           fill=(color[0], color[1], color[2], 220))
            draw.text((bx+pad, by+pad), label, font=font, fill=(255, 255, 255, 255),
                      stroke_width=max(1, box_thickness//3), stroke_fill=(0, 0, 0, 200))
    out_bgr = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    cv2.imwrite(str(out_path), out_bgr)

# ========= основной пайплайн =========


def run_pipeline(image_path: Path, *, model_kind: str, check_thr: float) -> Dict[str, Any]:
    model = DET_MODEL if model_kind != "seg" else SEG_MODEL
    if model is None:
        raise RuntimeError("Segmentation model not available")

    pred = yolo_detect_boxes(model, str(image_path), conf=check_thr, iou=0.65)
    dets: List[Dict[str, Any]] = pred["detections"]

    # нормализация SEG имён в канонические
    if model_kind == "seg":
        for d in dets:
            en = d["class_name"]
            canon = SEG_TO_DET_CANON.get(en, en)
            if canon != en:
                d["class_name"] = canon
                d["class_name_ru"] = RU_NAME_MAP.get(canon, canon)
                try:
                    d["class_id"] = CLASS_ORDER.index(canon)
                except ValueError:
                    pass

    dets = classwise_nms(dets, default_iou=0.55, default_contain=0.90)

    # det: fallback kolovorot через сегментацию
    if model_kind == "det":
        has_kolo = [d for d in dets if d["class_name"] ==
                    "kolovorot" and d["confidence"] >= check_thr]
        if not has_kolo:
            seg_best = seg_kolovorot_box(str(image_path), conf=check_thr)
            if seg_best:
                dets = [d for d in dets if d["class_name"] != "kolovorot"]
                dets.append(seg_best)

    summary = make_summary(dets, check_thr=check_thr)

    # доп.модель — только для детекции
    if (summary["missing_tools"] or summary["extras_or_duplicates"]) and DOP_MODEL is not None and model_kind == "det":
        dop_pred = yolo_detect_boxes(
            DOP_MODEL, str(image_path), conf=0.50, iou=0.65)
        dop_dets = classwise_nms(
            dop_pred["detections"], default_iou=0.55, default_contain=0.90)

        by_class: Dict[str, int] = {}
        for d in dets:
            if d["confidence"] >= check_thr:
                by_class[d["class_name"]] = by_class.get(
                    d["class_name"], 0) + 1
        missing_en = [c for c in REQUIRED_CLASSES if by_class.get(c, 0) == 0]

        for cls_name in missing_en:
            cand = None
            best = -1.0
            for d in dop_dets:
                if d["class_name"] != cls_name:
                    continue
                if d["confidence"] > best:
                    best = d["confidence"]
                    cand = d
            if cand is None:
                continue
            ok = True
            for ex in dets:
                if ex["class_name"] != cls_name:
                    continue
                if iou_xyxy(cand["bbox_xyxy"], ex["bbox_xyxy"]) >= 0.50:
                    ok = False
                    break
            if ok:
                dets.append(cand)

        dets = classwise_nms(dets, default_iou=0.55, default_contain=0.90)
        summary = make_summary(dets, check_thr=check_thr)

    return {"w": pred["w"], "h": pred["h"], "detections": dets, "summary": summary}
