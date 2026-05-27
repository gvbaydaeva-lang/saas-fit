import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const rawSupabaseAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

const FALLBACK_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

export const SUPABASE_URL = rawSupabaseUrl || FALLBACK_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  rawSupabaseAnon || "sb_publishable_dummy.missing-env-build-time";

export const supabaseConfigured = Boolean(rawSupabaseUrl && rawSupabaseAnon);

if (!supabaseConfigured) {
  console.warn(
    "[FitCRM] Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env (см. .env.example)."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
