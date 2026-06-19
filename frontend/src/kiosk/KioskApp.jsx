import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import KioskErrorBoundary from "../components/KioskErrorBoundary";
import KioskRouteFallback from "../components/KioskRouteFallback";
import DisplayPairingPage from "../pages/display/DisplayPairingPage";
import DisplayBoardPage from "../pages/display/DisplayBoardPage";
import VisualBoardDisplayPage from "../pages/visual-boards/VisualBoardDisplayPage";
import "../index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function KioskRoute({ children }) {
  return <KioskErrorBoundary>{children}</KioskErrorBoundary>;
}

export default function KioskApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<KioskRouteFallback />}>
          <Routes>
            <Route
              path="/tv"
              element={
                <KioskRoute>
                  <DisplayPairingPage />
                </KioskRoute>
              }
            />
            <Route
              path="/tv/board"
              element={
                <KioskRoute>
                  <DisplayBoardPage />
                </KioskRoute>
              }
            />
            <Route
              path="/vmb/:token"
              element={
                <KioskRoute>
                  <VisualBoardDisplayPage />
                </KioskRoute>
              }
            />
            <Route path="/display" element={<Navigate to="/tv" replace />} />
            <Route path="/display/*" element={<Navigate to="/tv" replace />} />
            <Route path="*" element={<Navigate to="/tv" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
