import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const rawSupabaseAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const SUPABASE_URL = rawSupabaseUrl;
export const SUPABASE_ANON_KEY = rawSupabaseAnon;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!supabaseConfigured) {
  throw new Error(
    "[FitCRM] Supabase не настроен. Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env (локально) или передайте их в GitHub Actions перед npm run build."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
