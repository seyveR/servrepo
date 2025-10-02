import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  CssBaseline,
  useMediaQuery,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { NavLink, useLocation } from "react-router-dom";
import HomeIcon from "@mui/icons-material/Home";
import HandymanIcon from "@mui/icons-material/Handyman";
import ListAltIcon from "@mui/icons-material/ListAlt";
import InsightsIcon from "@mui/icons-material/Insights";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";

const drawerWidth = 220;
const collapsedWidth = 64;


type LayoutProps = { children: ReactNode };

const nav = [
  { to: "/", label: "Главная", icon: <HomeIcon /> },
  { to: "/issue", label: "Выдача", icon: <HandymanIcon /> },
  { to: "/logs", label: "Логи", icon: <ListAltIcon /> },
  { to: "/visual", label: "Визуализация", icon: <InsightsIcon /> },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [open, setOpen] = useState(true);

  // ====== ТЕМА ======
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [mode, setMode] = useState<"light" | "dark">(
    (localStorage.getItem("theme:mode") as "light" | "dark") || (prefersDark ? "dark" : "light")
  );
  const toggleMode = () => {
    setMode((m) => {
      const next = m === "light" ? "dark" : "light";
      localStorage.setItem("theme:mode", next);
      return next;
    });
  };

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          ...(mode === "light"
            ? {
                primary: { main: "#3b82f6" },
                secondary: { main: "#22c55e" },
                background: { default: "#f6f7fb", paper: "#ffffff" },
              }
            : {
                primary: { main: "#60a5fa" },
                secondary: { main: "#34d399" },
                background: { default: "#0f172a", paper: "#131a2b" }, // тёмная, но не «чёрная»
                divider: "rgba(255,255,255,0.1)",
                text: { primary: "#e5e7eb", secondary: "rgba(229,231,235,0.7)" },
              }),
        },
        shape: { borderRadius: 12 },
        components: {
          MuiPaper: {
            styleOverrides: { root: { borderRadius: 12 } },
          },
          MuiDrawer: {
            styleOverrides: { paper: { backgroundImage: "none" } },
          },
        },
      }),
    [mode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex" }}>
        {/* Боковое меню */}
        <Drawer
          variant="permanent"
          sx={{
            width: open ? drawerWidth : collapsedWidth,
            flexShrink: 0,
            transition: "width 0.3s",
            "& .MuiDrawer-paper": {
              width: open ? drawerWidth : collapsedWidth,
              transition: "width 0.3s",
              overflowX: "hidden",
              borderRight: `1px solid ${theme.palette.divider}`,
              boxSizing: "border-box",
              p: 0,
            },
          }}
        >
          {/* Верхняя строка: бренд + гамбургер */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: open ? "space-between" : "center",
              px: 1.5,
              py: 1,
            }}
          >
            {open && (
              <Box component={NavLink} to="/" style={{ textDecoration: "none", color: "inherit" }}>
                <Typography variant="h6" fontWeight={700} sx={{ color: "primary.main" }}>
                  Silex Core
                </Typography>
              </Box>
            )}
            <IconButton onClick={() => setOpen(!open)} size="small">
              <MenuIcon />
            </IconButton>
          </Box>

          {/* Пункты меню */}
          <List sx={{ pt: 0.5 }}>
            {nav.map((item) => {
              const active = location.pathname === item.to;
              return (
                <ListItemButton
                  key={item.to}
                  component={NavLink}
                  to={item.to}
                  selected={active}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    justifyContent: open ? "flex-start" : "center",
                    px: 2,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: open ? 1.5 : 0 }}>{item.icon}</ListItemIcon>
                  {open && <ListItemText primary={item.label} />}
                </ListItemButton>
              );
            })}
          </List>

          <Box sx={{ flexGrow: 1 }} />
          <Divider sx={{ my: 2 }} />

          {/* Пользователь (ужимается) */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: open ? 1 : 0,
              px: 1,
              justifyContent: open ? "flex-start" : "center",
              pb: 2,
            }}
          >
            <Avatar sx={{ width: 32, height: 32 }}>A</Avatar>
            {open && (
              <Box>
                <Typography variant="body2" fontWeight={700}>
                  Admin
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Operator
                </Typography>
              </Box>
            )}
          </Box>
        </Drawer>

        {/* Контент */}
        <Box component="main" sx={{ flexGrow: 1 }}>
          <AppBar position="sticky" elevation={0} color="transparent" sx={{ borderBottom: `1px solid ${theme.palette.divider}`, backdropFilter: "blur(4px)" }}>
            <Toolbar sx={{ gap: 2 }}>
              <Box sx={{ flexGrow: 1 }} />

              {/* Тумблер темы */}
              <IconButton onClick={toggleMode} title={mode === "light" ? "Тёмная тема" : "Светлая тема"}>
                {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
              </IconButton>

              <IconButton>
                <Avatar sx={{ width: 36, height: 36 }}>A</Avatar>
              </IconButton>
            </Toolbar>
          </AppBar>

          <Box sx={{ p: 3 }}>{children}</Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
