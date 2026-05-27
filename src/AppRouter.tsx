import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import ClientAuthPage from "./pages/ClientAuthPage";
import ClientDashboard from "./pages/ClientDashboard";
import PendingVerificationPage from "./pages/PendingVerificationPage";
import { getRouterBasename } from "./lib/resolveAppUrl";

const basename = getRouterBasename();

export default function AppRouter() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/login" element={<ClientAuthPage />} />
        <Route path="/auth/pending" element={<PendingVerificationPage />} />
        <Route path="/dashboard" element={<ClientDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
