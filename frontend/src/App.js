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
import InsightsPage from "./pages/InsightsPage";
import FormsPage from "./pages/FormsPage";
import FormSubmissionsPage from "./pages/FormSubmissionsPage";
import UnderDevelopmentPage from "./pages/UnderDevelopmentPage";
import UserStatisticsPage from "./pages/UserStatisticsPage";
import FeedbackPage from "./pages/FeedbackPage";
import DefinitionsPage from "./pages/DefinitionsPage";
import MobileApp from "./mobile/MobileApp";
import QRScanPage from "./pages/QRScanPage";
import { useEffect } from "react";
import "./App.css";

// Current frontend version - update with each release
const APP_VERSION = "3.0.0";

// Version check hook - compares frontend version with backend
const useVersionCheck = () => {
  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Remove trailing slash from backend URL if present
        const backendUrl = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');
        const response = await fetch(`${backendUrl}/api/health`);
        const data = await response.json();
        const backendVersion = data.version;
        
        // Store the last known version
        const storedVersion = localStorage.getItem('app_version');
        
        if (storedVersion && storedVersion !== APP_VERSION) {
          // Version changed - clear caches and reload
          console.log(`Version changed: ${storedVersion} → ${APP_VERSION}`);
          
          // Clear service worker caches
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
          }
          
          // Update stored version
          localStorage.setItem('app_version', APP_VERSION);
          
          // Force reload to get fresh assets
          window.location.reload(true);
          return;
        }
        
        // Store current version
        localStorage.setItem('app_version', APP_VERSION);
        
        // Log version info
        console.log(`App Version: ${APP_VERSION}, API Version: ${backendVersion}`);
      } catch (error) {
        console.log('Version check failed:', error);
      }
    };
    
    checkVersion();
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
                  <ChangePasswordDialog />
                  <Layout />
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
                <Route path="decision-engine" element={<UnderDevelopmentPage />} />
                
                {/* Settings Layout with nested routes */}
                <Route path="settings" element={<SettingsPage />}>
                  <Route index element={<Navigate to="/settings/preferences" replace />} />
                  <Route path="preferences" element={<SettingsPreferencesPage />} />
                  <Route path="general" element={<SettingsGeneralPage />} />
                  <Route path="user-management" element={<SettingsUserManagementPage />} />
                  <Route path="permissions" element={<SettingsPermissionsPage />} />
                  <Route path="qr" element={<SettingsQRPage />} />
                  <Route path="notifications" element={<SettingsNotificationsPage />} />
                  <Route path="risk-calculation" element={<SettingsRiskCalculationPage />} />
                  <Route path="ai-usage" element={<SettingsAIUsagePage />} />
                  <Route path="server-performance" element={<SettingsServerPerformancePage />} />
                  <Route path="database" element={<SettingsDatabasePage />} />
                  <Route path="insights" element={<InsightsPage />} />
                  <Route path="statistics" element={<UserStatisticsPage />} />
                  <Route path="criticality-definitions" element={<DefinitionsPage />} />
                  <Route path="feedback" element={<FeedbackPage />} />
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
