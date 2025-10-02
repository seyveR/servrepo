import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  listAudits,
  getAuditDates,
  deleteAudit,
  clearAudits,
  exportAudits,
  downloadBlob,
} from "../api/client";
import type { AuditRow, ExportRequest } from "../api/types";

const PAGE_SIZE = 20;

export default function LogsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // пагинация
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // фильтры
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [manual, setManual] = useState<"" | "yes" | "no">("");

  const [rows, setRows] = useState<AuditRow[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listAudits({
        page,
        employee_id: employeeQuery || undefined,
        date: date || undefined,
        manual: manual || undefined,
      });
      setRows(res.items);
      setTotal(res.total);
    } catch (e: any) {
      setError(e?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function loadDates() {
    try {
      const ds = await getAuditDates();
      setDates(ds);
      // если выбранной даты нет больше в списке — сбросим
      if (date && !ds.includes(date)) setDate(null);
    } catch {
      // не критично
    }
  }

  useEffect(() => {
    loadDates();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, employeeQuery, date, manual]);

  // удаление одной записи
  const [delId, setDelId] = useState<number | null>(null);
  async function doDelete() {
    if (!delId) return;
    try {
      await deleteAudit(delId);
      // если удалили последнюю на странице — возможно нужно сдвинуться назад
      const remainOnPage = rows.length - 1;
      const willBeEmpty = remainOnPage === 0 && page > 1;
      if (willBeEmpty) setPage(page - 1);
      else load();
    } catch (e: any) {
      setError(e?.message || "Не удалось удалить");
    } finally {
      setDelId(null);
    }
  }

  // очистка всех записей
  const [confirmClear, setConfirmClear] = useState(false);
  async function doClearAll() {
    try {
      await clearAudits();
      setPage(1);
      load();
      loadDates();
    } catch (e: any) {
      setError(e?.message || "Не удалось очистить");
    } finally {
      setConfirmClear(false);
    }
  }

  // экспорт
  const [exportOpen, setExportOpen] = useState(false);
  const [exportDate, setExportDate] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<"all" | "needed" | "not_needed">("all");
  const [exportPageFrom, setExportPageFrom] = useState<number | ''>('');
  const [exportPageTo, setExportPageTo] = useState<number | ''>('');
  const [exportEmployees, setExportEmployees] = useState<string>(""); // через запятую или перенос строки
  const [exportEmpSearch, setExportEmpSearch] = useState<string>("");

  async function doExport() {
    try {
      const req: ExportRequest = {
        date: exportDate || undefined,
        status: exportStatus,
        employee_search: exportEmpSearch || undefined,
      };
      if (exportEmployees.trim()) {
        const list = exportEmployees
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (list.length) req.employees = list;
      }
      if (exportPageFrom && exportPageTo) {
        req.page_from = Number(exportPageFrom);
        req.page_to = Number(exportPageTo);
        req.size = PAGE_SIZE;
      }
      const blob = await exportAudits(req);
      downloadBlob(blob, `audit_export_${Date.now()}.json`);
      setExportOpen(false);
    } catch (e: any) {
      setError(e?.message || "Ошибка экспорта");
    }
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          <TextField
            label="Поиск по табельному"
            placeholder="tab / Tab / 222..."
            value={employeeQuery}
            onChange={(e) => setEmployeeQuery(e.target.value)}
            size="small"
            sx={{ minWidth: 240 }}
          />
          <Autocomplete
            freeSolo
            options={dates}
            value={date}
            onChange={(_, v) => setDate(v)}
            onInputChange={(_, v) => setDate(v || null)}
            renderInput={(params) => <TextField {...params} label="Дата (YYYY-MM-DD)" size="small" />}
            sx={{ minWidth: 220 }}
          />
          <TextField
            label="Ручная проверка"
            select
            size="small"
            value={manual}
            onChange={(e) => setManual(e.target.value as any)}
            sx={{ width: 200 }}
          >
            <MenuItem value="">Все</MenuItem>
            <MenuItem value="yes">Нужна</MenuItem>
            <MenuItem value="no">Не нужна</MenuItem>
          </TextField>

          <Box sx={{ flex: 1 }} />

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              setPage(1);
              load();
              loadDates();
            }}
          >
            Обновить
          </Button>
          <Button
            color="secondary"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => setExportOpen(true)}
          >
            Выгрузить JSON
          </Button>
          <Button
            color="error"
            variant="outlined"
            startIcon={<CleaningServicesIcon />}
            onClick={() => setConfirmClear(true)}
          >
            Очистить всё
          </Button>
        </Stack>
      </Paper>

      <Paper>
        {loading && <LinearProgress />}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Табельный</TableCell>
                <TableCell>Дата</TableCell>
                <TableCell align="right">Детекции</TableCell>
                <TableCell align="center">Все 11</TableCell>
                <TableCell align="right">Мин. увер.</TableCell>
                <TableCell align="center">Ручная</TableCell>
                <TableCell>Отчёт</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.id}</TableCell>
                  <TableCell>{r.employee_id}</TableCell>
                  <TableCell>{r.created_at}</TableCell>
                  <TableCell align="right">{r.total_detections}</TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={r.all_tools_present ? "Да" : "Нет"}
                      color={r.all_tools_present ? "success" : "warning"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">{(r.min_confidence * 100).toFixed(1)}%</TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={r.manual_check_required ? "Нужна" : "Не нужна"}
                      color={r.manual_check_required ? "error" : "success"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {r.report_url ? (
                      <Button
                        href={import.meta.env.VITE_API_BASE
                          ? `${import.meta.env.VITE_API_BASE}${r.report_url}`
                          : r.report_url}
                        target="_blank"
                        size="small"
                      >
                        Скачать
                      </Button>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        нет
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Удалить запись">
                      <IconButton color="error" onClick={() => setDelId(r.id)} size="small">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Box sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
                      Нет записей по текущим фильтрам
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Всего: <b>{total}</b> • Страниц: <b>{pageCount}</b>
          </Typography>
          <Pagination
            page={page}
            onChange={(_, p) => setPage(p)}
            count={pageCount}
            siblingCount={1}
            boundaryCount={1}
            shape="rounded"
            color="primary"
          />
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Подтверждение удаления одной записи */}
      <Dialog open={!!delId} onClose={() => setDelId(null)}>
        <DialogTitle>Удалить запись #{delId}?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setDelId(null)}>Отмена</Button>
          <Button color="error" onClick={doDelete}>Удалить</Button>
        </DialogActions>
      </Dialog>

      {/* Подтверждение очистки всех */}
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)}>
        <DialogTitle>Очистить весь аудит?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Будут удалены все записи и связанные файлы (оригиналы, разметки, отчёты). Действие необратимо.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)}>Отмена</Button>
          <Button color="error" onClick={doClearAll}>Очистить</Button>
        </DialogActions>
      </Dialog>

      {/* Модалка экспорта */}
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Выгрузить JSON</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Autocomplete
              freeSolo
              options={dates}
              value={exportDate}
              onChange={(_, v) => setExportDate(v)}
              onInputChange={(_, v) => setExportDate(v || null)}
              renderInput={(params) => <TextField {...params} label="Дата (опционально)" placeholder="YYYY-MM-DD" />}
            />
            <TextField
              label="Статус"
              select
              value={exportStatus}
              onChange={(e) => setExportStatus(e.target.value as any)}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="needed">Нужна ручная проверка</MenuItem>
              <MenuItem value="not_needed">Не нужна</MenuItem>
            </TextField>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Стр. от"
                type="number"
                value={exportPageFrom}
                onChange={(e) => setExportPageFrom(e.target.value ? Number(e.target.value) : '')}
                sx={{ width: 120 }}
                inputProps={{ min: 1 }}
              />
              <TextField
                label="Стр. до"
                type="number"
                value={exportPageTo}
                onChange={(e) => setExportPageTo(e.target.value ? Number(e.target.value) : '')}
                sx={{ width: 120 }}
                inputProps={{ min: 1 }}
              />
            </Stack>
            <TextField
              label="Список табельных (через запятую/пробел)"
              multiline
              minRows={2}
              value={exportEmployees}
              onChange={(e) => setExportEmployees(e.target.value)}
              placeholder="Tab111222, Tab222333 ..."
            />
            <TextField
              label="Поиск по табельному (подстрока)"
              value={exportEmpSearch}
              onChange={(e) => setExportEmpSearch(e.target.value)}
              placeholder="1222"
            />
            <Typography variant="caption" color="text.secondary">
              Если не указаны «Стр. от/до» — выгружаются все записи, подходящие под фильтры.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)}>Отмена</Button>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={doExport}>
            Выгрузить
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
