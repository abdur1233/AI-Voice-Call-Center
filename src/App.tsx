import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import { LanguageProvider } from "./LanguageContext";
import { SoftphoneProvider } from "./context/SoftphoneContext";
import ProtectedRoute from "./ProtectedRoute";
import AppLayout from "./AppLayout";
import LoginPage from "./LoginPage";
import SetupPage from "./SetupPage";
import DashboardPage from "./pages/DashboardPage";
import LiveCallsPage from "./pages/LiveCallsPage";
import CallHistoryPage from "./pages/CallHistoryPage";
import CustomersPage from "./pages/CustomersPage";
import TeamPage from "./pages/TeamPage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";
import HandoffQueuePage from "./pages/HandoffQueuePage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <SoftphoneProvider>
            <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="live-calls" element={<LiveCallsPage />} />
              <Route path="handoff-queue" element={<HandoffQueuePage />} />
              <Route path="call-history" element={<CallHistoryPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route
                path="knowledge-base"
                element={<KnowledgeBasePage />}
              />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
          </SoftphoneProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
