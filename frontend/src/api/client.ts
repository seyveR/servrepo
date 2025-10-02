import type { InferenceResponse, AuditListResponse, ExportRequest } from "./types";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function absUrl(path?: string) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function inferImage(
  file: File,
  optsOrEmployeeId:
    | string
    | {
        employeeId: string;
        modelKind?: "det" | "seg";
        checkThr?: number;  
        renderThr?: number;  
        drawBoxes?: boolean;
        drawLabels?: boolean;
        drawMasks?: boolean; // только для сегментации
      },
  confPercentLegacy?: number,
  drawBoxesLegacy?: boolean,
  drawLabelsLegacy?: boolean
): Promise<InferenceResponse & { processed_url_abs?: string; original_url_abs?: string }> {
 
  let employeeId: string;
  let confPercent = typeof confPercentLegacy === "number" ? confPercentLegacy : 5;
  let drawBoxes = typeof drawBoxesLegacy === "boolean" ? drawBoxesLegacy : true;
  let drawLabels = typeof drawLabelsLegacy === "boolean" ? drawLabelsLegacy : true;

  // Доп.поля нового API (если передан объект)
  let modelKind: "det" | "seg" | undefined;
  let checkThr: number | undefined;
  let renderThr: number | undefined;
  let drawMasks: boolean | undefined;

  if (typeof optsOrEmployeeId === "string") {
    employeeId = optsOrEmployeeId;
  } else {
    employeeId = optsOrEmployeeId.employeeId;
    modelKind = optsOrEmployeeId.modelKind;
    checkThr = optsOrEmployeeId.checkThr;
    renderThr = optsOrEmployeeId.renderThr;
    drawBoxes = optsOrEmployeeId.drawBoxes ?? drawBoxes;
    drawLabels = optsOrEmployeeId.drawLabels ?? drawLabels;
    drawMasks = optsOrEmployeeId.drawMasks;

    // Если пришёл renderThr (логика нового UI), то не даём фронту
    // случайно задрать conf на бэке — фиксируем низкий порог детекции.
    if (typeof renderThr === "number") confPercent = 5;
  }

  const fd = new FormData();
  fd.append("image", file);
  fd.append("employee_id", employeeId);

  // Старые поля (работают на обоих бэках)
  fd.append("conf", String(confPercent / 100));
  fd.append("draw_boxes", String(drawBoxes));
  fd.append("draw_labels", String(drawLabels));

  // Новые поля (бэкенд v2; старый просто проигнорирует)
  if (modelKind) fd.append("model_kind", modelKind);
  if (typeof checkThr === "number") fd.append("check_thr", String(checkThr));     // ожидается 0..1
  if (typeof renderThr === "number") fd.append("render_thr", String(renderThr));  // 0..1, для информации
  if (modelKind === "seg" && typeof drawMasks === "boolean") {
    fd.append("draw_masks", String(drawMasks));
  }

  const res = await fetch(`${BASE}/infer`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Infer failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as InferenceResponse;

  return {
    ...data,
    processed_url_abs: absUrl(data.processed_url),
    original_url_abs: absUrl(data.original_url),
  };
}

// ==== Аудит ====
export async function listAudits(params: {
  page: number;
  employee_id?: string;
  date?: string;
  manual?: "yes" | "no";
}): Promise<AuditListResponse> {
  const url = new URL(`${BASE}/audits`);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("size", "20");
  if (params.employee_id) url.searchParams.set("employee_id", params.employee_id);
  if (params.date) url.searchParams.set("date", params.date);
  if (params.manual) url.searchParams.set("manual", params.manual);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getAuditDates(): Promise<string[]> {
  const res = await fetch(`${BASE}/audit-dates`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteAudit(id: number): Promise<void> {
  const res = await fetch(`${BASE}/audits/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function clearAudits(): Promise<{ ok: boolean; deleted: number }> {
  const res = await fetch(`${BASE}/audits?confirm=YES`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportAudits(payload: ExportRequest): Promise<Blob> {
  const res = await fetch(`${BASE}/audits/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- визуализация ---------- */
export type StatsFilters = {
  date?: string;
  date_from?: string;
  date_to?: string;
  manual?: "yes" | "no" | "all";
  employee_ids?: string[]; // список
  search?: string;
};

export async function getAuditFacets(): Promise<{ dates: string[]; employees: string[] }> {
  const r = await fetch(`${BASE}/audits/facets`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getAuditStats(filters: StatsFilters) {
  const p = new URLSearchParams();
  if (filters.date) p.set("date", filters.date);
  if (filters.date_from) p.set("date_from", filters.date_from);
  if (filters.date_to) p.set("date_to", filters.date_to);
  if (filters.manual && filters.manual !== "all") p.set("manual", filters.manual);
  if (filters.employee_ids?.length) p.set("employee_ids", filters.employee_ids.join(","));
  if (filters.search) p.set("search", filters.search);

  const r = await fetch(`${BASE}/audits/stats?${p.toString()}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    total: number;
    detections: { avg: number; min: number; max: number };
    manual: { required: number; not_required: number };
    all_tools_present: { yes: number; no: number };
    by_date: { date: string; count: number; manual: number; avg_min_conf: number }[];
    by_employee: { employee_id: string; count: number; last: string }[];
    min_conf_hist: { bucket: string; count: number }[];
    missing_top: { name: string; count: number }[];
    extras_top: { name: string; count: number }[];
    date_span: { from: string; to: string } | null;
  }>;
}




