import { Box, Typography, Grid, Paper } from "@mui/material";
// import BuildIcon from "@mui/icons-material/Build";
import ListAltIcon from "@mui/icons-material/ListAlt";
// import InventoryIcon from "@mui/icons-material/Inventory";
import HandymanIcon from "@mui/icons-material/Handyman";
import BarChartIcon from "@mui/icons-material/BarChart";

export default function LandingPage() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>
        Добро пожаловать в Silex Core
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Система автоматизации приёма и выдачи инструментов для авиаинженеров
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <HandymanIcon sx={{ fontSize: 40, color: "primary.main" }} />
            <Typography variant="h6" fontWeight={700}>Сканирование</Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              Быстрая проверка инструментов
            </Typography>
          </Paper>
        </Grid>

        {/* <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <BuildIcon sx={{ fontSize: 40, color: "secondary.main" }} />
            <Typography variant="h6" fontWeight={700}>Возврат</Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              Контроль возврата инструмента
            </Typography>
          </Paper>
        </Grid> */}

        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <ListAltIcon sx={{ fontSize: 40, color: "warning.main" }} />
            <Typography variant="h6" fontWeight={700}>Аудит</Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              История всех операций
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <BarChartIcon sx={{ fontSize: 40, color: "success.main" }} />
            <Typography variant="h6" fontWeight={700}>Визуализация</Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              Аналитика по использованию инструмента
            </Typography>
          </Paper>
        </Grid>

      </Grid>
    </Box>
  );
}
