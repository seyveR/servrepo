import Grid from "@mui/material/Grid";
import {
  Container,
  Typography,
  Paper,
  Chip,
  Stack,
  Button,
  List,
  ListItem,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type Result = {
  image_url?: string;
  texts?: string[];
  scratchesFound?: boolean;
  className?: string;
};

export default function ResultPage() {
  const [result, setResult] = useState<Result | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("lastResult");
    if (stored) setResult(JSON.parse(stored));
  }, []);

  if (!result) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Typography>Нет данных — загрузите фото на странице «Выдача».</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h5" fontWeight={800}>Результаты анализа</Typography>
            <Button variant="outlined" onClick={() => navigate("/issue")}>
              Загрузить другое фото
            </Button>
          </Stack>
        </Grid>

        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2 }}>
            {result.image_url ? (
              <img
                src={`${import.meta.env.VITE_API_BASE}${result.image_url}`}
                alt="processed"
                style={{ maxWidth: "100%", borderRadius: 8 }}
              />
            ) : (
              <Typography color="text.secondary">Изображение не возвращено</Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, display: "grid", gap: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>Детали</Typography>

            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip label={`Класс: ${result.className ?? "—"}`} />
              <Chip label={`Царапины: ${result.scratchesFound ? "да" : "нет"}`} color={result.scratchesFound ? "warning" : "default"} />
            </Stack>

            <Typography variant="subtitle2" sx={{ mt: 1 }}>Распознанные тексты:</Typography>
            {result.texts?.length ? (
              <List dense>
                {result.texts.map((t, i) => <ListItem key={i}>• {t}</ListItem>)}
              </List>
            ) : (
              <Typography color="text.secondary">Нет</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
