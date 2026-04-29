import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { MotionConfig } from "framer-motion";
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
import { useEffect } from "react";
import { getBackendUrl } from "./lib/apiConfig";
import { debugLog } from "./lib/debug";
import "./App.css";
import { AppShell } from "./components/AppShell";
import { CapabilitiesProvider, useCapabilities } from "./core/performance";
import { ProductionReleaseToast } from "./components/ProductionReleaseToast";

// iOS Safari can feel slower with too many small lazy chunks (waterfall + parse overhead).
// Keep core routes eagerly loaded; lazy-load heavier/rare routes.
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import ThreatsPage from "./pages/ThreatsPage";
import FailureModesPage from "./pages/FailureModesPage";
import ActionsPage from "./pages/ActionsPage";
import TaskSchedulerPage from "./pages/TaskSchedulerPage";
import MyTasksPage from "./pages/MyTasksPage";
import FormSubmissionsPage from "./pages/FormSubmissionsPage";
import QRScanPage from "./pages/QRScanPage";

const ThreatDetailPage = lazy(() => import("./pages/ThreatDetailPage"));
const ActionDetailPage = lazy(() => import("./pages/ActionDetailPage"));
const EquipmentManagerPage = lazy(() => import("./pages/EquipmentManagerPage"));
const CausalEnginePage = lazy(() => import("./pages/CausalEnginePage"));
const UnderDevelopmentPage = lazy(() => import("./pages/UnderDevelopmentPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const DefinitionsPage = lazy(() => import("./pages/DefinitionsPage"));
const UserStatisticsPage = lazy(() => import("./pages/UserStatisticsPage"));
const MobileApp = lazy(() => import("./mobile/MobileApp"));

const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SettingsPreferencesPage = lazy(() => import("./pages/SettingsPreferencesPage"));
const SettingsGeneralPage = lazy(() => import("./pages/SettingsGeneralPage"));
const SettingsUserManagementPage = lazy(() => import("./pages/SettingsUserManagementPage"));
const SettingsPermissionsPage = lazy(() => import("./pages/SettingsPermissionsPage"));
const SettingsQRPage = lazy(() => import("./pages/SettingsQRPage"));
const LabelsPage = lazy(() => import("./pages/LabelsPage"));
const SettingsNotificationsPage = lazy(() => import("./pages/SettingsNotificationsPage"));
const SettingsRiskCalculationPage = lazy(() => import("./pages/SettingsRiskCalculationPage"));
const SettingsAIUsagePage = lazy(() => import("./pages/SettingsAIUsagePage"));
const SettingsServerPerformancePage = lazy(() => import("./pages/SettingsServerPerformancePage"));
const SettingsDatabasePage = lazy(() => import("./pages/SettingsDatabasePage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const SettingsLogIngestionPage = lazy(() => import("./pages/SettingsLogIngestionPage"));
const SettingsPrivacyPage = lazy(() => import("./pages/SettingsPrivacyPage"));
const SettingsDeletionRequestsPage = lazy(() => import("./pages/SettingsDeletionRequestsPage"));
const SettingsConsentManagementPage = lazy(() => import("./pages/SettingsConsentManagementPage"));
const SettingsAuditLogPage = lazy(() => import("./pages/SettingsAuditLogPage"));

function RouteFallback() {
  return (
    <AppShell />
  );
}

function AuthExpiredListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = () => {
      try {
        debugLog("auth_expired_event", { path: window.location.pathname });
      } catch (_e) {}
      if (!window.location.pathname.includes("/login")) {
        navigate("/login", { replace: true });
      }
    };
    window.addEventListener("assetiq:auth-expired", handler);
    return () => window.removeEventListener("assetiq:auth-expired", handler);
  }, [navigate]);
  return null;
}

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document);
}

function MotionWithCapabilities({ children }) {
  const caps = useCapabilities();
  const reduceMotion = isIOSDevice() || caps.animations === false;
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>{children}</MotionConfig>
  );
}

// Current frontend version - update with each release
const APP_VERSION = "3.6.5";

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
  debugLog("request_reload", { remoteVersion: remoteVersion || APP_VERSION });
  window.location.replace(url.toString());
};

// Version check hook - polls backend and forces refresh when a newer version is deployed
const useVersionCheck = () => {
  useEffect(() => {
    const backendUrl = getBackendUrl().replace(/\/$/, "");
    let cancelled = false;
    let promptedFor = null;
    let timerId = null;

    const isMobileLike = () => {
      try {
        return (
          typeof navigator !== "undefined" &&
          (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "") || (typeof window !== "undefined" && window.innerWidth < 768))
        );
      } catch {
        return false;
      }
    };

    const getIntervalMs = () => {
      // Power efficiency: check less frequently on mobile.
      return isMobileLike() ? 15 * 60_000 : 5 * 60_000;
    };

    const checkVersion = async () => {
      if (cancelled) return;
      // Power efficiency: don't poll while tab is hidden.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
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
          debugLog("version_update_available", { from: APP_VERSION, to: backendVersion });
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
              // Avoid innerHTML to reduce XSS sink surface.
              banner.textContent = `Update available: ${APP_VERSION} → ${backendVersion}. `;
              const btn = document.createElement("button");
              btn.id = "app-update-reload-btn";
              btn.type = "button";
              btn.textContent = "Reload";
              btn.style.cssText = [
                "margin-left:10px",
                "padding:6px 10px",
                "border-radius:8px",
                "border:0",
                "background:#fff",
                "color:#1d4ed8",
                "font-weight:700",
                "cursor:pointer",
              ].join(";");
              btn.addEventListener("click", () => requestReload(backendVersion));
              banner.appendChild(btn);
              document.body.appendChild(banner);
            }
          } catch (_) {}
          return;
        }

        localStorage.setItem("app_version", APP_VERSION);
      } catch (error) {
        console.log("[VersionCheck] failed:", error);
        debugLog("version_check_failed", { error: String(error) });
      }
    };

    const scheduleNext = (delayMs) => {
      if (cancelled) return;
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(async () => {
        await checkVersion();
        scheduleNext(getIntervalMs());
      }, delayMs);
    };

    // First check shortly after mount so auth/init aren't disturbed
    scheduleNext(1500);

    // Re-check when the tab regains focus (common case for long-idle tabs).
    // Also restart the throttled timer (power efficient).
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        checkVersion();
        scheduleNext(getIntervalMs());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      // Power efficiency: avoid refetching on every focus on mobile Safari.
      // Users can pull-to-refresh (non-iOS) or navigate to refresh.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const { canAccessRoute, loading: permissionsLoading } = usePermissions();
  const location = useLocation();
  
  if (loading || permissionsLoading) {
    return (
      <AppShell />
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
      <AppShell />
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
      <CapabilitiesProvider>
        <MotionWithCapabilities>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <PermissionsProvider>
                <UndoProvider>
                  <BrowserRouter>
                    <AuthExpiredListener />
                    <ProductionReleaseToast />
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
                  <Suspense fallback={<RouteFallback />}>
                    <LoginPage />
                  </Suspense>
                </PublicRoute>
              } />
              <Route path="/register" element={
                <PublicRoute>
                  <Suspense fallback={<RouteFallback />}>
                    <RegisterPage />
                  </Suspense>
                </PublicRoute>
              } />
              <Route path="/forgot-password" element={
                <PublicRoute>
                  <Suspense fallback={<RouteFallback />}>
                    <ForgotPasswordPage />
                  </Suspense>
                </PublicRoute>
              } />
              <Route path="/reset-password" element={
                <PublicRoute>
                  <Suspense fallback={<RouteFallback />}>
                    <ResetPasswordPage />
                  </Suspense>
                </PublicRoute>
              } />
              {/* QR Code Scan Landing Page */}
              <Route path="/qr/:qrId" element={
                <Suspense fallback={<RouteFallback />}>
                  <QRScanPage />
                </Suspense>
              } />
              <Route path="/" element={
                <ProtectedRoute>
                  <FirstLoginFlow>
                    <Layout />
                  </FirstLoginFlow>
                </ProtectedRoute>
              }>
                <Route index element={<Suspense fallback={<RouteFallback />}><DashboardPage /></Suspense>} />
                <Route path="dashboard" element={<Suspense fallback={<RouteFallback />}><DashboardPage /></Suspense>} />
                <Route path="production" element={<Suspense fallback={<RouteFallback />}><DashboardPage initialTab="production" /></Suspense>} />
                <Route path="definitions" element={<Suspense fallback={<RouteFallback />}><DefinitionsPage /></Suspense>} />
                <Route path="threats" element={<Suspense fallback={<RouteFallback />}><ThreatsPage /></Suspense>} />
                <Route path="threats/:id" element={<Suspense fallback={<RouteFallback />}><ThreatDetailPage /></Suspense>} />
                <Route path="actions" element={<Suspense fallback={<RouteFallback />}><ActionsPage /></Suspense>} />
                <Route path="actions/:actionId" element={<Suspense fallback={<RouteFallback />}><ActionDetailPage /></Suspense>} />
                <Route path="library" element={<Suspense fallback={<RouteFallback />}><FailureModesPage /></Suspense>} />
                <Route path="equipment-manager" element={<Suspense fallback={<RouteFallback />}><EquipmentManagerPage /></Suspense>} />
                <Route path="causal-engine" element={<Suspense fallback={<RouteFallback />}><CausalEnginePage /></Suspense>} />
                <Route path="tasks" element={<Suspense fallback={<RouteFallback />}><TaskSchedulerPage /></Suspense>} />
                <Route path="my-tasks" element={<Suspense fallback={<RouteFallback />}><MyTasksPage /></Suspense>} />
                <Route path="forms" element={<Navigate to="/tasks?tab=forms" replace />} />
                <Route path="form-submissions" element={<Suspense fallback={<RouteFallback />}><FormSubmissionsPage /></Suspense>} />
                <Route path="labels" element={<Navigate to="/settings/labels" replace />} />
                <Route path="decision-engine" element={<Suspense fallback={<RouteFallback />}><UnderDevelopmentPage /></Suspense>} />
                <Route path="feedback" element={<Suspense fallback={<RouteFallback />}><FeedbackPage /></Suspense>} />
                
                {/* Settings Layout with nested routes */}
                <Route path="settings" element={<Suspense fallback={<RouteFallback />}><SettingsPage /></Suspense>}>
                  <Route index element={<Navigate to="/settings/preferences" replace />} />
                  <Route path="preferences" element={<Suspense fallback={<RouteFallback />}><SettingsPreferencesPage /></Suspense>} />
                  <Route path="general" element={<Suspense fallback={<RouteFallback />}><SettingsGeneralPage /></Suspense>} />
                  <Route path="user-management" element={<Suspense fallback={<RouteFallback />}><SettingsUserManagementPage /></Suspense>} />
                  <Route path="permissions" element={<Suspense fallback={<RouteFallback />}><SettingsPermissionsPage /></Suspense>} />
                  <Route path="qr" element={<Suspense fallback={<RouteFallback />}><SettingsQRPage /></Suspense>} />
                  <Route path="labels" element={<Suspense fallback={<RouteFallback />}><LabelsPage /></Suspense>} />
                  <Route path="notifications" element={<Suspense fallback={<RouteFallback />}><SettingsNotificationsPage /></Suspense>} />
                  <Route path="risk-calculation" element={<Suspense fallback={<RouteFallback />}><SettingsRiskCalculationPage /></Suspense>} />
                  <Route path="ai-usage" element={<Suspense fallback={<RouteFallback />}><SettingsAIUsagePage /></Suspense>} />
                  <Route path="server-performance" element={<Suspense fallback={<RouteFallback />}><SettingsServerPerformancePage /></Suspense>} />
                  <Route path="database" element={<Suspense fallback={<RouteFallback />}><SettingsDatabasePage /></Suspense>} />
                  <Route path="audit-log" element={<Suspense fallback={<RouteFallback />}><SettingsAuditLogPage /></Suspense>} />
                  <Route path="insights" element={<Suspense fallback={<RouteFallback />}><InsightsPage /></Suspense>} />
                  <Route path="statistics" element={<Suspense fallback={<RouteFallback />}><UserStatisticsPage /></Suspense>} />
                  <Route path="criticality-definitions" element={<Suspense fallback={<RouteFallback />}><DefinitionsPage /></Suspense>} />
                  <Route path="feedback" element={<Suspense fallback={<RouteFallback />}><FeedbackPage /></Suspense>} />
                  <Route path="log-ingestion" element={<Suspense fallback={<RouteFallback />}><SettingsLogIngestionPage /></Suspense>} />
                  <Route path="privacy" element={<Suspense fallback={<RouteFallback />}><SettingsPrivacyPage /></Suspense>} />
                  <Route path="deletion-requests" element={<Suspense fallback={<RouteFallback />}><SettingsDeletionRequestsPage /></Suspense>} />
                  <Route path="consent-management" element={<Suspense fallback={<RouteFallback />}><SettingsConsentManagementPage /></Suspense>} />
                </Route>
                
                <Route path="user-statistics" element={<Suspense fallback={<RouteFallback />}><UserStatisticsPage /></Suspense>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </BrowserRouter>
          </UndoProvider>
        </PermissionsProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
        </MotionWithCapabilities>
      </CapabilitiesProvider>
  </QueryClientProvider>
  );
}

export default App;
