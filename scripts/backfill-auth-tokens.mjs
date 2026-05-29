#!/usr/bin/env node
/**
 * Backfill auth_token в crm_studios.students (JSON) через Supabase API.
 *
 * Нужен service_role key (обходит RLS):
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Запуск из корня проекта:
 *   node scripts/backfill-auth-tokens.mjs
 *
 * Либо выполните supabase/RUN_IN_SQL_EDITOR.sql в SQL Editor (предпочтительно).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

function generateAuthToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function backfillStudents(students) {
  if (!Array.isArray(students)) return { students: students ?? [], changed: false };
  let changed = false;
  const next = students.map((s) => {
    if (s?.id === -8888) return s;
    if (!s?.auth_token?.trim()) {
      changed = true;
      return { ...s, auth_token: generateAuthToken() };
    }
    return s;
  });
  return { students: next, changed };
}

loadEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env\n" +
      "(Dashboard → Settings → API → service_role secret)\n\n" +
      "Или выполните SQL: supabase/RUN_IN_SQL_EDITOR.sql"
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: rows, error } = await supabase.from("crm_studios").select("user_id, students");

if (error) {
  console.error("Ошибка чтения crm_studios:", error.message);
  process.exit(1);
}

let studiosUpdated = 0;
let studentsUpdated = 0;

for (const row of rows ?? []) {
  const { students, changed } = backfillStudents(row.students);
  if (!changed) continue;

  const added = students.filter(
    (s, i) => s.auth_token && row.students?.[i]?.auth_token !== s.auth_token
  ).length;
  studentsUpdated += added;

  const { error: upErr } = await supabase
    .from("crm_studios")
    .update({ students })
    .eq("user_id", row.user_id);

  if (upErr) {
    console.error(`Ошибка обновления ${row.user_id}:`, upErr.message);
    continue;
  }
  studiosUpdated++;
}

console.log(
  `Готово: обновлено студий ${studiosUpdated}, учеников с новым auth_token ~${studentsUpdated}`
);
console.log(
  "Убедитесь, что выполнен supabase/RUN_IN_SQL_EDITOR.sql (функции portal_get_dashboard / portal_check_in)"
);
