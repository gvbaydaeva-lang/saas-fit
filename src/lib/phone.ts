/** Нормализация к 7XXXXXXXXXX (как в SQL normalize_phone). */
export function normalizePhone(input: string): string {
  let d = (input ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11 && (d[0] === "8" || d[0] === "7")) {
    if (d[0] === "8") d = "7" + d.slice(1);
  } else if (d.length === 10) {
    d = "7" + d;
  }
  return d;
}

/** Синтетический email для Supabase Auth (телефон + пароль). */
export function phoneToAuthEmail(phone: string): string {
  const n = normalizePhone(phone);
  return `${n}@phone.fitcrm.local`;
}

export function formatPhoneDisplay(normalized: string): string {
  const d = normalizePhone(normalized);
  if (d.length !== 11 || d[0] !== "7") return normalized;
  const local = d.slice(1);
  return `+7 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 8)}-${local.slice(8, 10)}`;
}

export function maskPhoneInput(val: string): string {
  let clean = val.replace(/\D/g, "");
  if (clean.startsWith("7") || clean.startsWith("8")) {
    clean = clean.substring(1);
  }
  clean = clean.substring(0, 10);

  let res = "";
  if (clean.length > 0) res = "+7 (" + clean.substring(0, 3);
  if (clean.length >= 3) res += ") " + clean.substring(3, 6);
  if (clean.length >= 6) res += "-" + clean.substring(6, 8);
  if (clean.length >= 8) res += "-" + clean.substring(8, 10);
  return res || val;
}
