import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { UndoProvider } from "./contexts/UndoContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Layout from "./components/Layout";
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
import AnalyticsDashboardPage from "./pages/AnalyticsDashboardPage";
import SettingsUserManagementPage from "./pages/SettingsUserManagementPage";
import FormsPage from "./pages/FormsPage";
import DecisionEnginePage from "./pages/DecisionEnginePage";
import UnderDevelopmentPage from "./pages/UnderDevelopmentPage";
import UserStatisticsPage from "./pages/UserStatisticsPage";
import FeedbackPage from "./pages/FeedbackPage";
import DefinitionsPage from "./pages/DefinitionsPage";
import MobileApp from "./mobile/MobileApp";
import "@/App.css";

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
  
  if (!user) {
    // Save the intended destination for post-login redirect
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
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
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
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
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<DashboardPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="threats" element={<ThreatsPage />} />
                <Route path="threats/:id" element={<ThreatDetailPage />} />
                <Route path="actions" element={<ActionsPage />} />
                <Route path="actions/:actionId" element={<ActionDetailPage />} />
                <Route path="library" element={<FailureModesPage />} />
                <Route path="equipment-manager" element={<EquipmentManagerPage />} />
                <Route path="causal-engine" element={<CausalEnginePage />} />
                <Route path="tasks" element={<TaskSchedulerPage />} />
                <Route path="my-tasks" element={<MyTasksPage />} />
                <Route path="analytics" element={<AnalyticsDashboardPage />} />
                <Route path="forms" element={<FormsPage />} />
                <Route path="decision-engine" element={<DecisionEnginePage />} />
                <Route path="settings/user-management" element={<SettingsUserManagementPage />} />
                <Route path="settings/statistics" element={<UserStatisticsPage />} />
                <Route path="user-statistics" element={<UserStatisticsPage />} />
                <Route path="settings/criticality-definitions" element={<DefinitionsPage />} />
                <Route path="settings/feedback" element={<FeedbackPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </UndoProvider>
      </AuthProvider>
    </LanguageProvider>
  </ThemeProvider>
  </QueryClientProvider>
  );
}

export default App;
