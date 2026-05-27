import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import StudioApp from "./App";
import ClientAuthPage from "./pages/ClientAuthPage";
import ClientDashboard from "./pages/ClientDashboard";

export default function AppRouter() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
      <Routes>
        <Route path="/login" element={<ClientAuthPage />} />
        <Route path="/dashboard" element={<ClientDashboard />} />
        <Route path="/" element={<StudioApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
