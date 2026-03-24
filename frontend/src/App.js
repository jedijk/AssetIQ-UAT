import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { UndoProvider } from "./contexts/UndoContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ThreatsPage from "./pages/ThreatsPage";
import ThreatDetailPage from "./pages/ThreatDetailPage";
import FailureModesPage from "./pages/FailureModesPage";
import EquipmentManagerPage from "./pages/EquipmentManagerPage";
import CausalEnginePage from "./pages/CausalEnginePage";
import ActionsPage from "./pages/ActionsPage";
import TaskSchedulerPage from "./pages/TaskSchedulerPage";
import AnalyticsDashboardPage from "./pages/AnalyticsDashboardPage";
import SettingsUserManagementPage from "./pages/SettingsUserManagementPage";
import FormsPage from "./pages/FormsPage";
import DecisionEnginePage from "./pages/DecisionEnginePage";
import UnderDevelopmentPage from "./pages/UnderDevelopmentPage";
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
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
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
    return <Navigate to="/" replace />;
  }
  
  return children;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
                <Route path="library" element={<FailureModesPage />} />
                <Route path="equipment-manager" element={<EquipmentManagerPage />} />
                <Route path="causal-engine" element={<CausalEnginePage />} />
                <Route path="tasks" element={<TaskSchedulerPage />} />
                <Route path="analytics" element={<AnalyticsDashboardPage />} />
                <Route path="forms" element={<FormsPage />} />
                <Route path="decision-engine" element={<DecisionEnginePage />} />
                <Route path="settings/user-management" element={<SettingsUserManagementPage />} />
                <Route path="settings/statistics" element={<AnalyticsDashboardPage />} />
                <Route path="settings/criticality-definitions" element={<UnderDevelopmentPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </UndoProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
  );
}

export default App;
