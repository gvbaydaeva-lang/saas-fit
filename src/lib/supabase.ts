import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const rawSupabaseAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const SUPABASE_URL = rawSupabaseUrl;
export const SUPABASE_ANON_KEY = rawSupabaseAnon;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!supabaseConfigured) {
  // Важно: не делаем никаких запросов в заглушечные домены.
  // В GitHub Pages переменные должны быть заданы на этапе сборки (Vite встраивает VITE_* в бандл).
  throw new Error(
    "[FitCRM] Supabase не настроен. Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env (локально) или в GitHub Actions Secrets/Variables (для npm run build)."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
