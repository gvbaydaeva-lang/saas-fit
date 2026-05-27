import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

if (supabaseConfigured) {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else if (import.meta.env.DEV) {
  console.warn(
    "[FitCRM] Нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Создайте .env по .env.example."
  );
}

/** Клиент Supabase; null, если ключи не были встроены при сборке. */
export const supabase = client as SupabaseClient;

export function requireSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      "Supabase не настроен: задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в GitHub Actions Secrets перед npm run build."
    );
  }
  return client;
}
