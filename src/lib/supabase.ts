import { createClient } from "@supabase/supabase-js";

const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const key =
  String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim() ||
  String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

export const supabaseConfigured = Boolean(url && key);

if (!supabaseConfigured) {
  console.error(
    "[FitCRM] Нет VITE_SUPABASE_URL или ключа (VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY). " +
      "Проверьте .env локально или Secrets в GitHub Actions при сборке."
  );
}

/** Плейсхолдеры нужны только чтобы createClient не падал при старте приложения. */
const SAFE_URL = url || "https://placeholder.local.supabase.invalid";
const SAFE_KEY = key || "sb_publishable_placeholder_not_configured";

export const supabase = createClient(SAFE_URL, SAFE_KEY);
