import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Убирает типичные ошибки копирования из GitHub Secrets / .env:
 * пробелы по краям и лишние кавычки.
 */
function normalizeEnvValue(raw: string): string {
  let v = (raw ?? "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/** Project URL (Settings → API). */
export const SUPABASE_URL = normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL ?? "");

/**
 * Publishable key (`sb_publishable_...`) или legacy anon JWT.
 * Поддерживаются оба имени env (как в документации Supabase).
 */
const rawKey =
  normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "") ||
  normalizeEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");

export const SUPABASE_ANON_KEY = rawKey;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

if (supabaseConfigured) {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else if (import.meta.env.DEV) {
  console.warn(
    "[FitCRM] Нет VITE_SUPABASE_URL или ключа (VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY). Создайте .env по .env.example."
  );
}

export const supabase = client as SupabaseClient;

export function requireSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      "Supabase не настроен: задайте VITE_SUPABASE_URL и ключ (anon или publishable) перед сборкой."
    );
  }
  return client;
}
