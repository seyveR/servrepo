import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LandingPage from "./pages/LandingPage";
import IssuePage from "./pages/IssuePage";
import LogsPage from "./pages/LogsPage";
import Layout from "./components/Layout";
import ResultPage from "./pages/ResultPage";
import VisualPage from "./pages/VisualPage"; // ✅ NEW

const qc = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/issue" element={<IssuePage />} />
            <Route path="/result" element={<ResultPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/visual" element={<VisualPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
