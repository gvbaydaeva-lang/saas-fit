import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import ClientAuthPage from "./pages/ClientAuthPage";
import ClientDashboard from "./pages/ClientDashboard";

const basename =
  (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") || undefined;

function useSession(): { ready: boolean; session: Session | null } {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { ready, session };
}

/** / — не вошёл → на форму входа, вошёл → в кабинет */
function RootRedirect() {
  const { ready, session } = useSession();
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] text-[#86868b]">
        Загрузка…
      </div>
    );
  }
  if (!session?.user) return <Navigate to="/login" replace />;
  return <Navigate to="/dashboard" replace />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { ready, session } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!session?.user) navigate("/login", { replace: true });
  }, [ready, session, navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] text-[#86868b]">
        Загрузка…
      </div>
    );
  }
  if (!session?.user) return null;
  return <>{children}</>;
}

export default function AppRouter() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<ClientAuthPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <ClientDashboard />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
