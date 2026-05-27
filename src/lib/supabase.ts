import { createClient } from "@supabase/supabase-js";

/** Реальный URL попадает в бандл из VITE_SUPABASE_URL при сборке */
export const SUPABASE_URL =
  String(import.meta.env.VITE_SUPABASE_URL || "").trim() || "https://placeholder.url";
export const SUPABASE_ANON_KEY =
  String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim() || "placeholder-key";

export const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
