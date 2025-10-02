// frontend/src/pages/VisualPage.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Grid,
  Stack,
  Typography,
  TextField,
  MenuItem,
  Button,
  Chip,
  Autocomplete,
  Divider,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material";
import {
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  LineChart,
  Area
} from "recharts";
import { getAuditFacets, getAuditStats, type StatsFilters } from "../api/client";

/* Цвета для круговых */
const PIE_COLORS = ["#34d399", "#60a5fa", "#fbbf24", "#f87171", "#a78bfa", "#f472b6", "#2dd4bf", "#fb7185"];

/** нормируем 0..1 → HSL красный->зелёный */
function colorFor01(x: number) {
  const t = Math.max(0, Math.min(1, x));
  const hue = 120 * t;
  return `hsl(${hue}deg 70% 50%)`;
}
function parseBucketMid(bucket: string): number {
  const m = bucket.match(/([\d.]+)\s*-\s*([\d.]+)/);
  if (!m) return 0.5;
  const a = parseFloat(m[1]),
    b = parseFloat(m[2]);
  if (!isFinite(a) || !isFinite(b)) return 0.5;
  return (a + b) / 2;
}

export default function VisualPage() {
  const theme = useTheme();

  const GRID = alpha(theme.palette.text.primary, theme.palette.mode === "light" ? 0.12 : 0.15);
  const PRIMARY = theme.palette.primary.main;
  const SUCCESS = theme.palette.success.main;

  const [facets, setFacets] = useState<{ dates: string[]; employees: string[] }>({ dates: [], employees: [] });
  const [filters, setFilters] = useState<StatsFilters>({ manual: "all" });
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // типы графиков
  const [typeByDate, setTypeByDate] = useState<"bar+line" | "lines">("bar+line");
  const [typeManual, setTypeManual] = useState<"pie" | "donut">("pie");
  const [typeAll, setTypeAll] = useState<"pie" | "donut">("pie");
  const [typeHist, setTypeHist] = useState<"bars" | "line">("bars");
  const [typeMissing, setTypeMissing] = useState<"bars" | "hbars">("bars");
  const [typeExtras, setTypeExtras] = useState<"bars" | "hbars">("bars");

  useEffect(() => {
    (async () => {
      const f = await getAuditFacets();
      setFacets(f);
    })();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const s = await getAuditStats(filters);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canClear = useMemo(
    () =>
      !!(
        filters.date ||
        filters.date_from ||
        filters.date_to ||
        (filters.employee_ids?.length ?? 0) ||
        (filters.manual && filters.manual !== "all")
      ),
    [filters]
  );

  const histData = useMemo(() => {
    const arr = stats?.min_conf_hist ?? [];
    return arr.map((b: any) => ({ ...b, _mid: parseBucketMid(b.bucket) }));
  }, [stats]);

  const missingData = (stats?.missing_top ?? []).slice(0, 8);
  const extrasData = (stats?.extras_top ?? []).slice(0, 8);

//   // ==== ⬇ фиксы: динамическая высота для горизонтальных баров ====
//   const H_ROW = 28;
//   const hMissing = useMemo(
//     () => (typeMissing === "hbars" ? Math.max(320, 56 + (missingData.length || 1) * H_ROW) : undefined),
//     [typeMissing, missingData.length]
//   );
//   const hExtras = useMemo(
//     () => (typeExtras === "hbars" ? Math.max(320, 56 + (extrasData.length || 1) * H_ROW) : undefined),
//     [typeExtras, extrasData.length]
//   );
//   // =================================================================

  return (
    <Grid container spacing={2}>
      {/* Фильтры */}
      <Grid item xs={12}>
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
            <TextField
              label="Дата (опц.)"
              type="date"
              value={filters.date || ""}
              onChange={(e) => setFilters({ ...filters, date: e.target.value || undefined })}
              InputLabelProps={{ shrink: true }}
              size="small"
            />
            <TextField
              label="С (дата)"
              type="date"
              value={filters.date_from || ""}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value || undefined })}
              InputLabelProps={{ shrink: true }}
              size="small"
            />
            <TextField
              label="По (дата)"
              type="date"
              value={filters.date_to || ""}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value || undefined })}
              InputLabelProps={{ shrink: true }}
              size="small"
            />

            <TextField
              select
              label="Ручная проверка"
              size="small"
              value={filters.manual || "all"}
              onChange={(e) => setFilters({ ...filters, manual: e.target.value as any })}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="yes">Нужна</MenuItem>
              <MenuItem value="no">Не нужна</MenuItem>
            </TextField>

            <Autocomplete
              multiple
              options={facets.employees}
              value={filters.employee_ids || []}
              onChange={(_, v) => setFilters({ ...filters, employee_ids: v })}
              renderTags={(value: readonly string[], getTagProps) =>
                value.map((option: string, index: number) => (
                  <Chip variant="outlined" label={option} {...getTagProps({ index })} key={option} />
                ))
              }
              renderInput={(params) => <TextField {...params} label="Сотрудники" size="small" placeholder="Выбрать…" />}
              sx={{ minWidth: 280 }}
            />

            <Stack direction="row" spacing={1}>
              <Button onClick={load} disabled={loading} variant="contained">
                Применить
              </Button>
              <Button
                onClick={() => {
                  setFilters({ manual: "all" });
                  setTimeout(load, 0);
                }}
                disabled={!canClear || loading}
                variant="outlined"
              >
                Сбросить
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Grid>

      {/* Краткая сводка */}
      <Grid item xs={12}>
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={4} useFlexGap flexWrap="wrap">
            <Stat title="Всего записей" value={stats?.total ?? 0} />
            <Stat title="Детекций (среднее)" value={stats?.detections?.avg ?? 0} />
            <Stat title="Детекций (мин/макс)" value={`${stats?.detections?.min ?? 0} / ${stats?.detections?.max ?? 0}`} />
            <Stat
              title="Диапазон дат"
              value={
                stats?.date_span ? `${stats.date_span.from.slice(0, 10)} → ${stats.date_span.to.slice(0, 10)}` : "—"
              }
            />
          </Stack>
        </Paper>
      </Grid>

      {/* По датам */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2, height: 420, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography fontWeight={700}>По датам (количество и средняя минимальная уверенность)</Typography>
            <TextField
              select
              size="small"
              value={typeByDate}
              onChange={(e) => setTypeByDate(e.target.value as any)}
              sx={{ width: 190 }}
              label="Тип графика"
            >
              <MenuItem value="bar+line">Столбцы + линия</MenuItem>
              <MenuItem value="lines">Две линии</MenuItem>
            </TextField>
          </Stack>

          <Box sx={{ flex: 1, minHeight: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              {typeByDate === "bar+line" ? (
                <ComposedChart data={stats?.by_date ?? []}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 1]} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" name="Записей" fill={PRIMARY} radius={[6, 6, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avg_min_conf"
                    name="Средняя мин. уверенность"
                    stroke={SUCCESS}
                    strokeWidth={2}
                    dot={{ r: 5 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              ) : (
                <ComposedChart data={stats?.by_date ?? []}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 1]} />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="count"
                    name="Кол-во записей"
                    stroke={PRIMARY}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="avg_min_conf"
                    name="Средняя мин. уверенность"
                    stroke={SUCCESS}
                    fill={alpha(SUCCESS, 0.2)}
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Grid>

      {/* Ручная проверка */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2, height: 420, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography fontWeight={700}>Ручная проверка</Typography>
            <TextField
              select
              size="small"
              value={typeManual}
              onChange={(e) => setTypeManual(e.target.value as any)}
              sx={{ width: 160 }}
              label="Тип"
            >
              <MenuItem value="pie">Круговая</MenuItem>
              <MenuItem value="donut">Кольцевая</MenuItem>
            </TextField>
          </Stack>

          <Box sx={{ flex: 1, minHeight: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  dataKey="value"
                  data={[
                    { name: "Нужна", value: stats?.manual?.required ?? 0 },
                    { name: "Не нужна", value: stats?.manual?.not_required ?? 0 },
                  ]}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  innerRadius={typeManual === "donut" ? 60 : 0}
                  label
                >
                  {[0, 1].map((i) => (
                    <Cell key={i} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Grid>

      {/* Все 11 на месте */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2, height: 420, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography fontWeight={700}>Все 11 на месте</Typography>
            <TextField
              select
              size="small"
              value={typeAll}
              onChange={(e) => setTypeAll(e.target.value as any)}
              sx={{ width: 160 }}
              label="Тип"
            >
              <MenuItem value="pie">Круговая</MenuItem>
              <MenuItem value="donut">Кольцевая</MenuItem>
            </TextField>
          </Stack>

          <Box sx={{ flex: 1, minHeight: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  dataKey="value"
                  data={[
                    { name: "Да", value: stats?.all_tools_present?.yes ?? 0 },
                    { name: "Нет", value: stats?.all_tools_present?.no ?? 0 },
                  ]}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  innerRadius={typeAll === "donut" ? 60 : 0}
                  label
                >
                  {[0, 1].map((i) => (
                    <Cell key={i} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Grid>

      {/* Распределение минимальной уверенности */}
    <Grid item xs={12} md={6}>
    <Paper sx={{ p: 2, height: 420, display: "flex", flexDirection: "column" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography fontWeight={700}>Распределение минимальной уверенности</Typography>
        <TextField
            select
            size="small"
            value={typeHist}
            onChange={(e) => setTypeHist(e.target.value as any)}
            sx={{ width: 160 }}
            label="Тип"
        >
            <MenuItem value="bars">Столбцы</MenuItem>
            <MenuItem value="line">Линия</MenuItem>
        </TextField>
        </Stack>

        <Box sx={{ flex: 1, minHeight: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
            {typeHist === "bars" ? (
            <BarChart data={histData}>
                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" name="Количество" radius={[6, 6, 0, 0]}>
                {histData.map((d: any, i: number) => (
                    <Cell key={`c-${i}`} fill={colorFor01(d._mid)} />
                ))}
                </Bar>
            </BarChart>
            ) : (
            <LineChart data={histData}>
                {/* градиент вдоль оси X по _mid (0..1) */}
                <defs>
                <linearGradient id="minConfStroke" x1="0" y1="0" x2="1" y2="0">
                    {(() => {
                    if (!histData?.length) return null;
                    const mins = histData.map((d: any) => d._mid ?? 0);
                    const min = Math.min(...mins);
                    const max = Math.max(...mins);
                    const span = max - min || 1;
                    return histData.map((d: any, i: number) => {
                        const pos = ((d._mid - min) / span) * 100; // 0..100%
                        return (
                        <stop key={i} offset={`${pos}%`} stopColor={colorFor01(d._mid)} />
                        );
                    });
                    })()}
                </linearGradient>
                </defs>

                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip />
                <Line
                type="monotone"
                dataKey="count"
                name="Количество"
                stroke="url(#minConfStroke)"
                strokeWidth={3}
                activeDot={{ r: 5 }}
                dot={(props: any) => {
                    const c = colorFor01(props?.payload?._mid ?? 0.5);
                    return (
                    <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={3.5}
                        fill={c}
                        stroke="#fff"
                        strokeWidth={1}
                    />
                    );
                }}
                />
            </LineChart>
            )}
        </ResponsiveContainer>
        </Box>
    </Paper>
    </Grid>


      {/* Часто отсутствуют */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2, height: 420, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography fontWeight={700}>Часто отсутствуют</Typography>
            <TextField
              select
              size="small"
              value={typeMissing}
              onChange={(e) => setTypeMissing(e.target.value as any)}
              sx={{ width: 210 }}
              label="Тип"
            >
              <MenuItem value="bars">Столбцы</MenuItem>
              <MenuItem value="line">Линия</MenuItem>
            </TextField>
          </Stack>

          <Box sx={{ flex: 1, minHeight: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              {typeMissing === "bars" ? (
                <BarChart data={missingData}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" name="Количество" fill={PRIMARY} radius={[6, 6, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={missingData}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" name="Количество" stroke={PRIMARY} strokeWidth={2} dot />
                </LineChart>
              )}
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Grid>

      {/* Лишние/дубли */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2, height: 420, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography fontWeight={700}>Лишние / дубли</Typography>
            <TextField
              select
              size="small"
              value={typeExtras}
              onChange={(e) => setTypeExtras(e.target.value as any)}
              sx={{ width: 210 }}
              label="Тип"
            >
              <MenuItem value="bars">Столбцы</MenuItem>
              <MenuItem value="line">Линия</MenuItem>
            </TextField>
          </Stack>

          <Box sx={{ flex: 1, minHeight: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              {typeExtras === "bars" ? (
                <BarChart data={extrasData}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" name="Количество" fill={PRIMARY} radius={[6, 6, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={extrasData}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" name="Количество" stroke={PRIMARY} strokeWidth={2} dot />
                </LineChart>
              )}
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Grid>

      {/* ТОП сотрудников */}
      <Grid item xs={12}>
        <Paper sx={{ p: 2 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>
            Топ сотрудников по числу записей
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 120px 200px", gap: 1 }}>
            <HeadCell>Сотрудник</HeadCell>
            <HeadCell>Записей</HeadCell>
            <HeadCell>Последняя</HeadCell>

            {(stats?.by_employee ?? []).length ? (
              (stats?.by_employee ?? []).map((r: any) => (
                <RowFragment key={r.employee_id} id={r.employee_id} count={r.count} last={r.last} />
              ))
            ) : (
              <Typography color="text.secondary">— нет данных —</Typography>
            )}
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
}

function RowFragment({ id, count, last }: { id: string; count: number; last: string }) {
  return (
    <>
      <RowCell>{id}</RowCell>
      <RowCell>{count}</RowCell>
      <RowCell>{last}</RowCell>
    </>
  );
}

function Stat({ title, value }: { title: string; value: string | number }) {
  return (
    <Box sx={{ p: 1.2, borderRadius: 1.5, bgcolor: "background.paper", border: (t) => `1px solid ${t.palette.divider}`, minWidth: 180 }}>
      <Typography variant="body2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h6" fontWeight={800}>
        {value}
      </Typography>
    </Box>
  );
}
function HeadCell({ children }: { children: any }) {
  return (
    <Box sx={{ fontSize: 13, color: "text.secondary", fontWeight: 700 }}>
      {children}
    </Box>
  );
}
function RowCell({ children }: { children: any }) {
  return <Box sx={{ py: 0.5 }}>{children}</Box>;
}
