/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** Legacy anon JWT или ключ `sb_publishable_…` из Supabase. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Новое имя в дашборде; если задан — используется, если ANON_KEY пустой. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
