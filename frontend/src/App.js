import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PermissionsProvider, usePermissions } from "./contexts/PermissionsContext";
import { UndoProvider } from "./contexts/UndoContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Layout from "./components/Layout";
import ChangePasswordDialog from "./components/ChangePasswordDialog";
import TermsAcceptanceDialog from "./components/TermsAcceptanceDialog";
import FirstLoginFlow from "./components/FirstLoginFlow";
import LandscapeBlocker from "./components/LandscapeBlocker";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import ThreatsPage from "./pages/ThreatsPage";
import ThreatDetailPage from "./pages/ThreatDetailPage";
import FailureModesPage from "./pages/FailureModesPage";
import EquipmentManagerPage from "./pages/EquipmentManagerPage";
import CausalEnginePage from "./pages/CausalEnginePage";
import ActionsPage from "./pages/ActionsPage";
import ActionDetailPage from "./pages/ActionDetailPage";
import TaskSchedulerPage from "./pages/TaskSchedulerPage";
import MyTasksPage from "./pages/MyTasksPage";
import SettingsUserManagementPage from "./pages/SettingsUserManagementPage";
import SettingsPermissionsPage from "./pages/SettingsPermissionsPage";
import SettingsAIUsagePage from "./pages/SettingsAIUsagePage";
import SettingsRiskCalculationPage from "./pages/SettingsRiskCalculationPage";
import SettingsServerPerformancePage from "./pages/SettingsServerPerformancePage";
import SettingsDatabasePage from "./pages/SettingsDatabasePage";
import SettingsPreferencesPage from "./pages/SettingsPreferencesPage";
import SettingsPage from "./pages/SettingsPage";
import SettingsGeneralPage from "./pages/SettingsGeneralPage";
import SettingsQRPage from "./pages/SettingsQRPage";
import SettingsNotificationsPage from "./pages/SettingsNotificationsPage";
import SettingsLogIngestionPage from "./pages/SettingsLogIngestionPage";
import SettingsPrivacyPage from "./pages/SettingsPrivacyPage";
import SettingsDeletionRequestsPage from "./pages/SettingsDeletionRequestsPage";
import SettingsConsentManagementPage from "./pages/SettingsConsentManagementPage";
import LabelsPage from "./pages/LabelsPage";import InsightsPage from "./pages/InsightsPage";
import FormsPage from "./pages/FormsPage";
import FormSubmissionsPage from "./pages/FormSubmissionsPage";
import UnderDevelopmentPage from "./pages/UnderDevelopmentPage";
import UserStatisticsPage from "./pages/UserStatisticsPage";
import FeedbackPage from "./pages/FeedbackPage";
import DefinitionsPage from "./pages/DefinitionsPage";
import MobileApp from "./mobile/MobileApp";
import QRScanPage from "./pages/QRScanPage";
import { useEffect } from "react";
import { getBackendUrl } from "./lib/apiConfig";
import "./App.css";

// Current frontend version - update with each release
const APP_VERSION = "3.6.2";

// Parse a semver string "A.B.C" into comparable tuple [A, B, C]
const parseVersion = (v) => {
  if (!v || typeof v !== "string") return [0, 0, 0];
  const parts = v.split(".").map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts;
};

// Returns true if remote > local
const isRemoteNewer = (remote, local) => {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  for (let i = 0; i < 3; i += 1) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
};

// Controlled reload: never reload the app automatically (avoid disrupting typing).
// Keep the mechanism simple and user-driven.
const requestReload = (remoteVersion) => {
  localStorage.setItem("app_version", remoteVersion || APP_VERSION);
  const url = new URL(window.location.href);
  url.searchParams.set("v", remoteVersion || APP_VERSION);
  window.location.replace(url.toString());
};

// Version check hook - polls backend and forces refresh when a newer version is deployed
const useVersionCheck = () => {
  useEffect(() => {
    const backendUrl = getBackendUrl().replace(/\/$/, "");
    let cancelled = false;
    let promptedFor = null;

    const checkVersion = async () => {
      if (cancelled) return;
      try {
        if (!backendUrl) return;
        const response = await fetch(`${backendUrl}/api/health`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;
        const data = await response.json();
        const backendVersion = data?.version;

        if (backendVersion && isRemoteNewer(backendVersion, APP_VERSION)) {
          if (promptedFor === backendVersion) return; // already prompted in this tab
          promptedFor = backendVersion;
          console.log(`[VersionCheck] Newer version available: ${APP_VERSION} → ${backendVersion}. Update available.`);
          // Inline banner (user-initiated reload)
          try {
            const existing = document.getElementById("app-update-banner");
            if (!existing) {
              const banner = document.createElement("div");
              banner.id = "app-update-banner";
              banner.setAttribute("data-testid", "app-update-banner");
              banner.style.cssText = [
                "position:fixed",
                "top:0",
                "left:0",
                "right:0",
                "z-index:2147483647",
                "background:linear-gradient(90deg,#2563eb,#1d4ed8)",
                "color:#fff",
                "padding:10px 16px",
                "font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
                "text-align:center",
                "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
              ].join(";");
              banner.innerHTML = `A new version (${backendVersion}) is available. <button id="app-update-reload-btn" style="margin-left:10px;padding:6px 10px;border-radius:8px;border:0;background:#fff;color:#1d4ed8;font-weight:700;cursor:pointer">Reload</button>`;
              document.body.appendChild(banner);

              const btn = document.getElementById("app-update-reload-btn");
              if (btn) {
                btn.addEventListener("click", () => requestReload(backendVersion));
              }
            }
          } catch (_) {}
          return;
        }

        localStorage.setItem("app_version", APP_VERSION);
      } catch (error) {
        console.log("[VersionCheck] failed:", error);
      }
    };

    // First check shortly after mount so auth/init aren't disturbed
    const initialId = setTimeout(checkVersion, 1500);
    // Poll every 60 seconds
    const intervalId = setInterval(checkVersion, 60_000);
    // Re-check when the tab regains focus (common case for long-idle tabs)
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkVersion();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(initialId);
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const { canAccessRoute, loading: permissionsLoading } = usePermissions();
  const location = useLocation();
  
  if (loading || permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }
  
  if (!user) {
    // Save the intended destination for post-login redirect
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  
  // Check if user has permission to access this route
  if (!canAccessRoute(location.pathname)) {
    // Redirect to dashboard if no permission
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }
  
  if (user) {
    // Redirect to the saved destination or default to dashboard
    const from = location.state?.from || "/";
    return <Navigate to={from} replace />;
  }
  
  return children;
};

// Mobile Layout wrapper with auth
const MobileLayout = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#fff'
      }}>
        Loading...
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  
  return <MobileApp />;
};

function App() {
  // Check for version updates on app load
  useVersionCheck();
  
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <PermissionsProvider>
              <UndoProvider>
                <BrowserRouter>
                  <Toaster 
                    position="top-center" 
                    richColors 
                    closeButton
                    toastOptions={{
                    style: {
                    fontFamily: 'Inter, sans-serif',
                  },
                }}
              />
              <LandscapeBlocker />
            <Routes>
              <Route path="/mobile" element={<MobileLayout />} />
              <Route path="/login" element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              } />
              <Route path="/register" element={
                <PublicRoute>
                  <RegisterPage />
                </PublicRoute>
              } />
              <Route path="/forgot-password" element={
                <PublicRoute>
                  <ForgotPasswordPage />
                </PublicRoute>
              } />
              <Route path="/reset-password" element={
                <PublicRoute>
                  <ResetPasswordPage />
                </PublicRoute>
              } />
              {/* QR Code Scan Landing Page */}
              <Route path="/qr/:qrId" element={<QRScanPage />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <FirstLoginFlow>
                    <Layout />
                  </FirstLoginFlow>
                </ProtectedRoute>
              }>
                <Route index element={<DashboardPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="production" element={<DashboardPage initialTab="production" />} />
                <Route path="definitions" element={<DefinitionsPage />} />
                <Route path="threats" element={<ThreatsPage />} />
                <Route path="threats/:id" element={<ThreatDetailPage />} />
                <Route path="actions" element={<ActionsPage />} />
                <Route path="actions/:actionId" element={<ActionDetailPage />} />
                <Route path="library" element={<FailureModesPage />} />
                <Route path="equipment-manager" element={<EquipmentManagerPage />} />
                <Route path="causal-engine" element={<CausalEnginePage />} />
                <Route path="tasks" element={<TaskSchedulerPage />} />
                <Route path="my-tasks" element={<MyTasksPage />} />
                <Route path="forms" element={<Navigate to="/tasks?tab=forms" replace />} />
                <Route path="form-submissions" element={<FormSubmissionsPage />} />
                <Route path="labels" element={<Navigate to="/settings/labels" replace />} />
                <Route path="decision-engine" element={<UnderDevelopmentPage />} />
                <Route path="feedback" element={<FeedbackPage />} />
                
                {/* Settings Layout with nested routes */}
                <Route path="settings" element={<SettingsPage />}>
                  <Route index element={<Navigate to="/settings/preferences" replace />} />
                  <Route path="preferences" element={<SettingsPreferencesPage />} />
                  <Route path="general" element={<SettingsGeneralPage />} />
                  <Route path="user-management" element={<SettingsUserManagementPage />} />
                  <Route path="permissions" element={<SettingsPermissionsPage />} />
                  <Route path="qr" element={<SettingsQRPage />} />
                  <Route path="labels" element={<LabelsPage />} />
                  <Route path="notifications" element={<SettingsNotificationsPage />} />
                  <Route path="risk-calculation" element={<SettingsRiskCalculationPage />} />
                  <Route path="ai-usage" element={<SettingsAIUsagePage />} />
                  <Route path="server-performance" element={<SettingsServerPerformancePage />} />
                  <Route path="database" element={<SettingsDatabasePage />} />
                  <Route path="insights" element={<InsightsPage />} />
                  <Route path="statistics" element={<UserStatisticsPage />} />
                  <Route path="criticality-definitions" element={<DefinitionsPage />} />
                  <Route path="feedback" element={<FeedbackPage />} />
                  <Route path="log-ingestion" element={<SettingsLogIngestionPage />} />
                  <Route path="privacy" element={<SettingsPrivacyPage />} />
                  <Route path="deletion-requests" element={<SettingsDeletionRequestsPage />} />
                  <Route path="consent-management" element={<SettingsConsentManagementPage />} />
                </Route>
                
                <Route path="user-statistics" element={<UserStatisticsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </UndoProvider>
      </PermissionsProvider>
      </AuthProvider>
    </LanguageProvider>
  </ThemeProvider>
  </QueryClientProvider>
  );
}

export default App;
