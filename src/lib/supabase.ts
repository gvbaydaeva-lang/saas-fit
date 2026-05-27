import { createClient } from "@supabase/supabase-js";

/** Supabase (Project Settings → API). Вшито в бандл для GitHub Pages без GitHub Actions. */
export const SUPABASE_URL = "https://jwisaxhushkyovfdpgpd.supabase.co";
export const SUPABASE_ANON_KEY =
  "sb_publishable_KHFW7KXLw_SjOIZUil_aug_MuguPM73";

export const supabaseConfigured = true;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
