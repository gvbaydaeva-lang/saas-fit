import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import StudioApp from "./App";
import ClientAuthPage from "./pages/ClientAuthPage";
import ClientDashboard from "./pages/ClientDashboard";
import SupabaseConfigScreen from "./SupabaseConfigScreen";
import { supabaseConfigured } from "./lib/supabase";

/** basename для GitHub Pages: /saas-fit, локально: пусто или / */
const routerBasename =
  (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") || undefined;

export default function AppRouter() {
  if (!supabaseConfigured) {
    return <SupabaseConfigScreen />;
  }

  return (
    <BrowserRouter basename={routerBasename}>
      <Routes>
        <Route path="/login" element={<ClientAuthPage />} />
        <Route path="/dashboard" element={<ClientDashboard />} />
        <Route path="/" element={<StudioApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
