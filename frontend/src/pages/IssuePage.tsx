
import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
  Backdrop,
  CircularProgress,
  useTheme,
  Autocomplete,
  Chip,
  FormControlLabel,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { inferImage } from "../api/client";
import type { InferenceResponse } from "../api/types";

/* ===================== Утилиты ===================== */
const IMG_EXT_RE = /\.(jpe?g|png|bmp|tiff?|webp|heic|heif)$/i;


function isImageFile(f: File) {
  return (f.type && f.type.startsWith("image/")) || IMG_EXT_RE.test(f.name);
}
function fileBase(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function fmtSec(s: number) {
  if (!isFinite(s) || s < 0) return "";
  const m = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return m ? `${m}м ${ss}с` : `${ss}с`;
}

/* ============ чтение папок из drag&drop (chrome/webkit) ============ */
type EntryLike = any;
async function readDirectoryEntries(dirEntry: EntryLike): Promise<File[]> {
  const reader = dirEntry.createReader();
  const all: EntryLike[] = [];
  while (true) {
    const batch: EntryLike[] = await new Promise((res) => reader.readEntries(res));
    if (!batch.length) break;
    all.push(...batch);
  }
  const files: File[] = [];
  for (const e of all) {
    if (e.isFile) {
      const file: File = await new Promise((res) => (e as any).file(res));
      files.push(file);
    } else if (e.isDirectory) {
      const nested = await readDirectoryEntries(e);
      files.push(...nested);
    }
  }
  return files;
}


// async function onDrop(e: React.DragEvent<HTMLDivElement>) {
//   e.preventDefault();
//   const list = await filesFromDataTransfer(e.dataTransfer, setZipLoading);
//   addFiles(list);
// }


async function filesFromDataTransfer(dt: DataTransfer, setLoading?: (v: boolean) => void): Promise<File[]> {
  const out: File[] = [];

  if (dt.items && dt.items.length) {
    const items = Array.from(dt.items);
    for (const it of items) {
      const entry: EntryLike | undefined = (it as any).webkitGetAsEntry?.();
      if (entry && entry.isDirectory) {
        const got = await readDirectoryEntries(entry);
        out.push(...got);
      } else {
        const f = it.getAsFile();
        if (f) {
          if (f.name.toLowerCase().endsWith(".zip")) {
            try {
              setLoading?.(true);   // включаем спиннер

              const buf = await f.arrayBuffer();
              const zip = await JSZip.loadAsync(buf);

              for (const [path, entry] of Object.entries(zip.files)) {
                if (!entry.dir && IMG_EXT_RE.test(path)) {
                  const content = await entry.async("blob");
                  const ext = path.split(".").pop()?.toLowerCase();
                  const mime =
                    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
                    ext === "png" ? "image/png" :
                    "application/octet-stream";

                  const file = new File([content], path, { type: mime });
                  out.push(file);
                }
              }
            } finally {
              setLoading?.(false);  // выключаем спиннер
            }
          } else {
            out.push(f);
          }
        }
      }
    }
  } else {
    out.push(...Array.from(dt.files || []));
  }
  return out;
}



/* ===================== Типы ===================== */
type ReportFormat = "none" | "json" | "csv";

type Detection = {
  class_id: number;
  class_name: string;
  class_name_ru?: string;
  confidence: number;
  bbox_xyxy: [number, number, number, number];
  mask?: [number, number][]; // для сегментации (пиксели исходного изображения)
};

type Item = {
  file: File;
  url: string; // локальный objectURL исходника
  processedUrl?: string;
  result?: InferenceResponse;
  loading?: boolean;
  error?: string;
};

/* ===================== Палитра для классов ===================== */
const PALETTE = [
  "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb7185",
  "#22d3ee", "#f59e0b", "#4ade80", "#93c5fd", "#f472b6", "#2dd4bf",
];
const colorForClass = (det: Detection) => {
  const idx = det.class_id ?? 0;
  return PALETTE[idx % PALETTE.length];
};

/* ===================== Страница ===================== */

export default function IssuePage() {
  const theme = useTheme();

  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState(0);

  // параметры инференса
  const [employeeId, setEmployeeId] = useState("");
  const [checkThr, setCheckThr] = useState(70);   // %  -> серверу в 0..1
  const [renderThr, setRenderThr] = useState(60); // %  -> влияет только на отрисовку
  const [modelKind, setModelKind] = useState<"det" | "seg">("det");
  const [drawMasks, setDrawMasks] = useState(false);

  const [report, setReport] = useState<ReportFormat>("json");

  // параметры отображения (оверлей)
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [drawBoxes, setDrawBoxes] = useState(true);
  const [drawLabels, setDrawLabels] = useState(true);
  const [showConf, setShowConf] = useState(true);

  const cur = items[current];

  const [zipLoading, setZipLoading] = useState(false);

  /* ---------- добавление файлов ---------- */
  function addFiles(fs: File[]) {
    const imgs = fs.filter(isImageFile);
    if (!imgs.length) return;
    const mapped = imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setItems((prev) => {
      const next = [...prev, ...mapped];
      if (prev.length === 0 && next.length > 0) setCurrent(0);
      return next;
    });
  }
  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const list = await filesFromDataTransfer(e.dataTransfer, setZipLoading);
    addFiles(list);
}
  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    addFiles(Array.from(e.target.files));
  }

  /* ---------- обработка всех изображений с прогрессом ---------- */
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [eta, setEta] = useState("");

  async function processAll() {
    if (!items.length || !employeeId.trim()) return;

    setBatchRunning(true);
    setBatchDone(0);
    setBatchTotal(items.length);
    const t0 = performance.now();

    const CONCURRENCY = 2;
    let index = 0;

    const runOne = async () => {
      const i = index++;
      if (i >= items.length) return;
      setItems((arr) => arr.map((it, k) => (k === i ? { ...it, loading: true, error: undefined } : it)));

      try {
        const res = await inferImage(items[i].file, {
          employeeId: employeeId.trim(),
          modelKind,
          checkThr: checkThr / 100,
          renderThr: renderThr / 100,
          drawBoxes: true,
          drawLabels: true,
          drawMasks: modelKind === "seg" ? drawMasks : false,
        });

        setItems((arr) =>
          arr.map((it, k) =>
            k === i ? { ...it, result: res, processedUrl: res.processed_url_abs, loading: false } : it
          )
        );
      } catch (e: any) {
        setItems((arr) =>
          arr.map((it, k) => (k === i ? { ...it, error: e?.message || "Ошибка", loading: false } : it))
        );
      } finally {
        setBatchDone((d) => {
          const done = d + 1;
          const elapsed = (performance.now() - t0) / 1000;
          const avg = elapsed / done;
          const remain = Math.max(0, (items.length - done) * avg);
          setEta(fmtSec(remain));
          return done;
        });
        await runOne();
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, runOne));
    setBatchRunning(false);
  }

  /* ---------- сброс ---------- */
  function resetAll() {
    items.forEach((it) => URL.revokeObjectURL(it.url));
    setItems([]);
    setCurrent(0);
  }

  /* ---------- отчёт ---------- */
  function downloadReport() {
    if (!cur?.result || report === "none") return;

    const data = cur.result;

    if (report === "json") {
      const json = JSON.stringify(data, null, 2);
      triggerDownload(new Blob([json], { type: "application/json" }), fileBase(cur.file.name) + "_report.json");
      return;
    }

    const detRows = data.detections.map((d: any) => {
      const ru = (d as any).class_name_ru as string | undefined;
      const name = ru && ru.trim().length > 0 ? ru : d.class_name;
      const [x1, y1, x2, y2] = d.bbox_xyxy.map((n: number) => Math.round(n));
      return [d.class_id, `"${name.replace(/"/g, '""')}"`, d.confidence.toFixed(4), x1, y1, x2, y2].join(",");
    });

    const metaRows = [
      ["image_width", data.image_width].join(","),
      ["image_height", data.image_height].join(","),
      ["all_tools_present", data.summary.all_tools_present].join(","),
      ["missing_tools", `"${data.summary.missing_tools.join("|").replace(/"/g, '""')}"`].join(","),
      ["extras_or_duplicates", `"${data.summary.extras_or_duplicates.join("|").replace(/"/g, '""')}"`].join(","),
      ["min_confidence", data.summary.min_confidence].join(","),
      ["manual_check_required", data.summary.manual_check_required].join(","),
    ];

    const csv =
      "\ufeff" +
      [...metaRows, "", ["class_id", "class_name", "confidence", "x1", "y1", "x2", "y2"].join(","), ...detRows].join(
        "\n"
      );

    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileBase(cur.file.name) + "_report.csv");
  }

  /* ---------- превью-лента ---------- */
  const THUMB = 84;
  const GAP = 8;
  const STRIP_VISIBLE = 7.5;
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrap = stripRef.current;
    if (!wrap) return;
    const btn = wrap.querySelector<HTMLButtonElement>(`button[data-idx="${current}"]`);
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const er = wrap.getBoundingClientRect();
    if (r.left < er.left) wrap.scrollBy({ left: r.left - er.left - 8, behavior: "smooth" });
    else if (r.right > er.right) wrap.scrollBy({ left: r.right - er.right + 8, behavior: "smooth" });
  }, [current]);

  const urls = useMemo(() => items.map((i) => i.url), [items]);
  const scrollByOne = (dir: -1 | 1) => {
    const wrap = stripRef.current;
    if (!wrap) return;
    wrap.scrollBy({ left: dir * (THUMB + GAP), behavior: "smooth" });
  };

  // цвета для миниатюр
  const thumbBorder = theme.palette.mode === "dark" ? "rgba(255,255,255,.18)" : "#e5e7eb";
  const thumbBorderActive = theme.palette.primary.main;

  // стили alert-плашек
  const warnBg = alpha(theme.palette.warning.main, 0.14);
  const warnBorder = alpha(theme.palette.warning.main, 0.45);
  const errBg = alpha(theme.palette.error.main, 0.14);
  const errBorder = alpha(theme.palette.error.main, 0.45);

  /* ---------- список классов для фильтра ---------- */
  const classOptions = useMemo(() => {
    const set = new Map<string, string>();
    const ds = cur?.result?.detections ?? [];
    for (const d of ds as any[]) {
      const en = d.class_name as string;
      const ru = (d.class_name_ru as string) || en;
      if (!set.has(en)) set.set(en, ru);
    }
    return Array.from(set.entries()).map(([en, ru]) => ({ en, ru }));
  }, [cur]);

  /* ---------- refs для оверлея ---------- */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* ---------- отрисовка оверлея (канвас) ---------- */
  const redraw = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const res = cur?.result as InferenceResponse | undefined;
    if (!img || !canvas || !wrap || !res) return;

    const wrapRect = wrap.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    const cssW = Math.round(imgRect.width);
    const cssH = Math.round(imgRect.height);
    const left = Math.round(imgRect.left - wrapRect.left);
    const top = Math.round(imgRect.top - wrapRect.top);

    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const origW = (res as any).image_width || img.naturalWidth || 1;
    const origH = (res as any).image_height || img.naturalHeight || 1;

    const scale = Math.min(cssW / origW, cssH / origH);
    const drawW = origW * scale;
    const drawH = origH * scale;
    const offX = (cssW - drawW) / 2;
    const offY = (cssH - drawH) / 2;

    const sel = new Set(selectedClasses);
    const showAll = sel.size === 0;

    const stroke = Math.max(2, Math.round(Math.min(drawW, drawH) * 0.004));
    ctx.lineWidth = stroke;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const fontSize = Math.max(12, Math.round(Math.min(drawW, drawH) * 0.035));
    ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;

    const dets = res.detections as Detection[];
    const thr = renderThr / 100;

    for (const d of dets) {
      if (d.confidence < thr) continue; // фильтр по порогу отрисовки
      const en = d.class_name;
      if (!showAll && !sel.has(en)) continue;

      const [x1, y1, x2, y2] = d.bbox_xyxy;
      const rx1 = offX + x1 * scale;
      const ry1 = offY + y1 * scale;
      const rw = (x2 - x1) * scale;
      const rh = (y2 - y1) * scale;

      const color = colorForClass(d);

      // маска (для сегментации) — рисуем до рамки
      if (modelKind === "seg" && drawMasks && d.mask && d.mask.length >= 3) {
        ctx.save();
        ctx.fillStyle = color as string;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        const [sx, sy] = d.mask[0];
        ctx.moveTo(offX + sx * scale, offY + sy * scale);
        for (let i = 1; i < d.mask.length; i++) {
          const [px, py] = d.mask[i];
          ctx.lineTo(offX + px * scale, offY + py * scale);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (drawBoxes) {
        ctx.strokeStyle = color as string;
        ctx.strokeRect(rx1, ry1, rw, rh);
      }

      const ru = (d.class_name_ru as string) || en;
      const confTxt = `${Number(d.confidence).toFixed(2)}`;

      if (drawLabels) {
        const txt = showConf ? `${ru} ${confTxt}` : ru;
        const padX = 6, padY = 4;
        const metrics = ctx.measureText(txt);
        const tw = Math.ceil(metrics.width);
        const th = Math.ceil(fontSize * 1.2);
        const bx = rx1;
        const by = Math.max(0, ry1 - th - padY * 2);

        ctx.fillStyle = color as string;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(bx, by, tw + padX * 2, th + padY * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff";
        ctx.fillText(txt, bx + padX, by + padY + th * 0.8);
      } else if (showConf) {
        const padX = 4, padY = 3;
        const th = Math.ceil(fontSize * 0.9);
        const metrics = ctx.measureText(confTxt);
        const tw = Math.ceil(metrics.width);
        const bx = rx1 + stroke;
        const by = ry1 + stroke;

        ctx.fillStyle = color as string;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(bx, by, tw + padX * 2, th + padY * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff";
        ctx.fillText(confTxt, bx + padX, by + padY + th * 0.8);
      }
    }
  };

  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, selectedClasses, drawBoxes, drawLabels, showConf, renderThr, modelKind, drawMasks]);

  /* ============ Рендер ============ */
  return (
    <Grid container spacing={2}>
      {/* Левая панель (инференс) */}
      <Grid id="col-left" item xs={12} md={3} lg={3}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" fontWeight={800} sx={{ mb: 1.5 }}>
            Параметры
          </Typography>

          <Stack spacing={2}>
            <TextField
              label="Табельный номер"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Например, Tab111222"
              required
            />

            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Модель
              </Typography>
              <Select
                size="small"
                fullWidth
                value={modelKind}
                onChange={(e) => setModelKind(e.target.value as "det" | "seg")}
              >
                <MenuItem value="det">Детекция (основная)</MenuItem>
                <MenuItem value="seg">Сегментация (test)</MenuItem>
              </Select>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Порог проверки: <b>{checkThr}%</b>
              </Typography>
              <Slider value={checkThr} min={0} max={100} onChange={(_, v) => setCheckThr(v as number)} />
            </Box>

            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Формат отчёта
              </Typography>
              <Select size="small" fullWidth value={report} onChange={(e) => setReport(e.target.value as ReportFormat)}>
                <MenuItem value="none">Без отчёта</MenuItem>
                <MenuItem value="json">JSON</MenuItem>
                <MenuItem value="csv">CSV</MenuItem>
              </Select>
            </Box>

            <Divider />

            <Box>
              <Button variant="outlined" component="label" fullWidth>
                Загрузить изображения
                <input
                  hidden
                  type="file"
                  multiple
                  accept="image/*,.jpg,.jpeg,.png,.bmp,.tif,.tiff,.webp,.heic,.heif"
                  onChange={onInput}
                />
              </Button>

              <Box
                sx={{
                  border: "1px dashed",
                  borderColor: (t) => t.palette.divider,
                  borderRadius: 2,
                  p: 4,
                  mt: 1,
                  textAlign: "center",
                  color: "text.secondary",
                  minHeight: 120,
                  position: "relative",
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
              >
                {zipLoading ? (
                  <Stack spacing={1} alignItems="center">
                    <CircularProgress />
                    <Typography variant="caption">Распаковываем архив...</Typography>
                  </Stack>
                ) : (
                  <>
                    Перетащите сюда файлы или <b>папку</b> с фото
                    <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                      Поддержка: JPG, JPEG, PNG, BMP, TIFF, WEBP, HEIC/HEIF, ZIP
                    </Typography>
                  </>
                )}
              </Box>
            </Box>

            <Stack direction="row" spacing={1}>
              <Button onClick={processAll} disabled={!items.length || batchRunning || !employeeId.trim()}>
                Обработать
              </Button>
              <Button variant="outlined" onClick={resetAll}>
                Сбросить
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Grid>

      {/* Центр: изображение + канвас */}
      <Grid id="col-center" item xs={12} md={6} lg={6}>
        <Paper
          sx={{
            p: 2,
            mb: 2,
            minHeight: 480,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {!cur ? (
            <Typography variant="body2" color="text.secondary">
              Загрузите изображения, введите табельный номер и нажмите «Обработать»
            </Typography>
          ) : (
            <Box
              ref={wrapRef}
              sx={{
                width: "100%",
                height: 480,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {cur.loading && (
                <LinearProgress sx={{ mb: 1, position: "absolute", left: 16, right: 16, top: 16, zIndex: 2 }} />
              )}
              {/* Базовое изображение */}
              <img
                ref={imgRef}
                src={cur.url}
                alt="preview"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  borderRadius: 12,
                  display: "block",
                }}
                onLoad={() => redraw()}
              />
              {/* Оверлей */}
              <canvas ref={canvasRef} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }} />
              {cur.error && (
                <Typography color="error" sx={{ mt: 1 }}>
                  {cur.error}
                </Typography>
              )}
            </Box>
          )}
        </Paper>

        {/* Лента превью */}
        {items.length > 0 && (
          <>
            <Paper sx={{ p: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton onClick={() => scrollByOne(-1)} disabled={!items.length}>
                  <ChevronLeftIcon />
                </IconButton>

                <Box
                  ref={stripRef}
                  sx={{
                    display: "flex",
                    gap: `8px`,
                    overflowX: "auto",
                    scrollBehavior: "smooth",
                    px: 1,
                    maxWidth: `calc(7.5 * 84px + 6.5 * 8px)`,
                    "&::-webkit-scrollbar": { height: 6 },
                    "&::-webkit-scrollbar-thumb": { background: "#d1d5db", borderRadius: 8 },
                  }}
                >
                  {urls.map((u, i) => {
                    const active = i === current;
                    return (
                      <button
                        key={i}
                        data-idx={i}
                        onClick={() => setCurrent(i)}
                        title={`Фото ${i + 1}`}
                        style={{
                          width: 84,
                          height: 84,
                          boxSizing: "border-box",
                          borderRadius: 10,
                          overflow: "hidden",
                          border: active ? `2px solid ${thumbBorderActive}` : `1px solid ${thumbBorder}`,
                          padding: 0,
                          background: "transparent",
                          cursor: "pointer",
                          flex: "0 0 auto",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <img
                          src={u}
                          alt={`thumb-${i}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      </button>
                    );
                  })}
                </Box>

                <IconButton onClick={() => scrollByOne(1)} disabled={!items.length}>
                  <ChevronRightIcon />
                </IconButton>
              </Stack>
            </Paper>

            <Typography variant="caption" align="center" sx={{ mt: 0.75, display: "block", color: "text.secondary" }}>
              Фото {items.length ? current + 1 : 0} из {items.length} • Загружено: {items.length}
            </Typography>
          </>
        )}
      </Grid>

      {/* Правая сводка + настройки отображения */}
      <Grid id="col-right" item xs={12} md={3} lg={3}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" fontWeight={800} sx={{ mb: 1.5 }}>
            Сводка
          </Typography>

          {!cur?.result ? (
            <Typography variant="body2" color="text.secondary">
              Нет данных — обработайте изображение
            </Typography>
          ) : (
            <Stack spacing={1.2}>
              <Row k="Всего детекций" v={cur.result.detections.length} />
              <Row k="Все 11 на месте" v={cur.result.summary.all_tools_present ? "Да" : "Нет"} />
              <Row k="Мин. уверенность" v={`${(cur.result.summary.min_confidence * 100).toFixed(1)}%`} />
              <Row k="Ручная проверка" v={cur.result.summary.manual_check_required ? "Нужна" : "Не нужна"} />

              {cur.result.summary.missing_tools.length > 0 && (
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: warnBg, border: `1px solid ${warnBorder}` }}>
                  <Typography variant="body2">
                    Отсутствуют: {cur.result.summary.missing_tools.join(", ")}
                  </Typography>
                </Box>
              )}
              {cur.result.summary.extras_or_duplicates.length > 0 && (
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: errBg, border: `1px solid ${errBorder}` }}>
                  <Typography variant="body2">
                    Лишние/дубли: {cur.result.summary.extras_or_duplicates.join(", ")}
                  </Typography>
                </Box>
              )}

              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Отображение
              </Typography>

              {/* Порог отрисовки — динамический */}
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Порог отрисовки: <b>{renderThr}%</b>
                </Typography>
                <Slider value={renderThr} min={0} max={100} onChange={(_, v) => setRenderThr(v as number)} />
              </Box>

              {/* Фильтр классов */}
              <Autocomplete
                multiple
                options={classOptions}
                value={classOptions.filter((o) => selectedClasses.includes(o.en))}
                getOptionLabel={(o) => o.ru}
                onChange={(_, val) => setSelectedClasses(val.map((v) => v.en))}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip variant="outlined" label={option.ru} {...getTagProps({ index })} key={option.en} />
                  ))
                }
                renderInput={(params) => <TextField {...params} label="Классы" size="small" placeholder="Все" />}
              />

              <FormControlLabel
                control={<Switch checked={drawBoxes} onChange={(e) => setDrawBoxes(e.target.checked)} />}
                label="Рисовать боксы"
              />
              <FormControlLabel
                control={<Switch checked={drawLabels} onChange={(e) => setDrawLabels(e.target.checked)} />}
                label="Подписывать названия"
              />
              <FormControlLabel
                control={<Switch checked={showConf} onChange={(e) => setShowConf(e.target.checked)} />}
                label="Показывать уверенность"
              />
              {modelKind === "seg" && (
                <FormControlLabel
                  control={<Switch checked={drawMasks} onChange={(e) => setDrawMasks(e.target.checked)} />}
                  label="Отрисовывать маски"
                />
              )}

              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={redraw} disabled={!cur?.result}>
                  Применить отображение
                </Button>
                {report !== "none" && (
                  <Button variant="outlined" onClick={downloadReport}>
                    Скачать отчёт ({report.toUpperCase()})
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
        </Paper>
      </Grid>

      {/* Модалка прогресса */}
      <Backdrop open={batchRunning} sx={{ color: "#fff", zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress color="inherit" />
          <Typography>
            Обработка: {batchDone}/{batchTotal} {eta && `(~${eta})`}
          </Typography>
        </Stack>
      </Backdrop>
    </Grid>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="body2" color="text.secondary">
        {k}
      </Typography>
      <Typography variant="body2" fontWeight={700}>
        {v}
      </Typography>
    </Box>
  );
}
