import { supabase } from "./supabase";

/** Публичный домен личного кабинета (ссылки для клиентов) */
export const PORTAL_PUBLIC_ORIGIN =
  (import.meta.env.VITE_PORTAL_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://saas-fit-crm.netlify.app";

export function generateAuthToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getPortalPublicUrl(authToken: string): string {
  const token = encodeURIComponent(authToken.trim());
  return `${PORTAL_PUBLIC_ORIGIN}/portal/${token}`;
}

export function getMaxSendPortalMessage(authToken: string): string {
  return `Здравствуйте! Вот ваш личный кабинет: ${getPortalPublicUrl(authToken)}`;
}

export function getMaxSendPortalUrl(authToken: string): string {
  return `agent://send?text=${encodeURIComponent(getMaxSendPortalMessage(authToken))}`;
}

export async function copyPortalPublicLink(authToken: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(getPortalPublicUrl(authToken));
    return true;
  } catch {
    return false;
  }
}

export function tryOpenMaxSendPortal(authToken: string): void {
  const message = getMaxSendPortalMessage(authToken);
  const agentUrl = getMaxSendPortalUrl(authToken);

  let cancelled = false;
  const timer = window.setTimeout(() => {
    if (cancelled) return;
    if (window.confirm("Скопировать ссылку для вставки в Макс вручную?")) {
      void navigator.clipboard.writeText(message).catch(() => {
        alert("Не удалось скопировать текст");
      });
    }
  }, 900);

  const onBlur = () => {
    cancelled = true;
    window.clearTimeout(timer);
    window.removeEventListener("blur", onBlur);
  };
  window.addEventListener("blur", onBlur);

  try {
    window.location.href = agentUrl;
  } catch {
    cancelled = true;
    window.clearTimeout(timer);
    window.removeEventListener("blur", onBlur);
    if (window.confirm("Скопировать ссылку для вставки в Макс вручную?")) {
      void navigator.clipboard.writeText(message);
    }
  }
}

export function backfillStudentsWithAuthTokens<T extends { id: number; auth_token?: string }>(
  students: T[]
): { students: T[]; changed: boolean } {
  let changed = false;
  const next = students.map((s) => {
    if (s.id === -8888) return s;
    if (!s.auth_token?.trim()) {
      changed = true;
      return { ...s, auth_token: generateAuthToken() };
    }
    return s;
  });
  return { students: next, changed };
}

export type PortalVisitRow = {
  id: number;
  visited_at: string;
};

export type PortalStudentView = {
  id: number;
  name: string;
  direction: string;
  until: string;
  count: number;
  abon: string;
  classType: string;
};

export type PortalDashboard = {
  student: PortalStudentView;
  visits: PortalVisitRow[];
  checked_in_today: boolean;
  ownerUserId?: string;
};

const PORTAL_ERRORS: Record<string, string> = {
  INVALID_TOKEN: "Ошибка: ссылка недействительна. Пожалуйста, обратитесь в студию",
  NOT_FOUND: "Ошибка: ссылка недействительна. Пожалуйста, обратитесь в студию",
  ALREADY_TODAY: "Сегодня посещение уже отмечено",
  NO_LESSONS: "На абонементе не осталось занятий",
  EXPIRED: "Срок абонемента истёк",
};

function mapStudent(raw: Record<string, unknown>): PortalStudentView {
  return {
    id: Number(raw.id) || 0,
    name: String(raw.name ?? ""),
    direction: String(raw.direction ?? ""),
    until: String(raw.until ?? ""),
    count: Number(raw.count) || 0,
    abon: String(raw.abon ?? "count"),
    classType: String(raw.classType ?? "group"),
  };
}

function formatDbError(prefix: string, message: string, hint?: string): string {
  const extra = hint ? ` ${hint}` : "";
  return `Ошибка БД: ${prefix} — ${message}${extra}`;
}

function isRpcMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("portal_get_dashboard") ||
    m.includes("schema cache") ||
    m.includes("could not find the function") ||
    m.includes("function") && m.includes("does not exist")
  );
}

/** Поиск ученика по auth_token в JSON crm_studios.students (без отдельной таблицы students) */
function findStudentInCrmStudiosRows(
  rows: { user_id: string; students: unknown }[],
  token: string
): { ownerUserId: string; raw: Record<string, unknown> } | null {
  const needle = token.trim().toLowerCase();
  console.log("[portal] parsing crm_studios JSON, studios count:", rows.length);

  for (const row of rows) {
    const list = Array.isArray(row.students) ? row.students : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      if (String(s.id) === "-8888") continue;
      const t = String(s.auth_token ?? "")
        .trim()
        .toLowerCase();
      if (t && t === needle) {
        console.log("[portal] student found in crm_studios:", {
          ownerUserId: row.user_id,
          studentId: s.id,
          name: s.name,
        });
        return { ownerUserId: row.user_id, raw: s };
      }
    }
  }
  console.log("[portal] no student with auth_token in crm_studios.students");
  return null;
}

async function loadVisitsForStudent(
  ownerUserId: string,
  studentId: number
): Promise<{ visits: PortalVisitRow[]; checked_in_today: boolean; error?: string }> {
  console.log("[portal] loading visits from crm_visits:", { ownerUserId, studentId });

  const { data, error } = await supabase
    .from("crm_visits")
    .select("id, visited_at")
    .eq("user_id", ownerUserId)
    .eq("student_id", studentId)
    .order("visited_at", { ascending: false })
    .limit(5);

  console.log("[portal] crm_visits result:", { count: data?.length ?? 0, error });

  if (error) {
    return {
      visits: [],
      checked_in_today: false,
      error: error.message,
    };
  }

  const visits = (data ?? []) as PortalVisitRow[];
  const today = new Date().toISOString().slice(0, 10);
  const checked_in_today = visits.some((v) => {
    try {
      return new Date(v.visited_at).toISOString().slice(0, 10) === today;
    } catch {
      return false;
    }
  });

  return { visits, checked_in_today };
}

/** Запасной путь: читаем crm_studios и парсим JSON (если RPC ещё не создан в Supabase) */
async function fetchPortalDashboardFromCrmStudios(
  token: string
): Promise<{ ok: true; data: PortalDashboard } | { ok: false; error: string }> {
  console.log("[portal] fallback: SELECT user_id, students FROM crm_studios");

  const { data: rows, error } = await supabase.from("crm_studios").select("user_id, students");

  console.log("[portal] crm_studios response:", {
    error: error?.message ?? null,
    rows: rows?.length ?? 0,
  });

  if (error) {
    const hint =
      error.message.includes("permission") || error.code === "42501"
        ? "Нужны функции portal_get_dashboard в SQL (файл supabase/RUN_IN_SQL_EDITOR.sql) или политика RLS на чтение."
        : "";
    return {
      ok: false,
      error: formatDbError("crm_studios", error.message, hint),
    };
  }

  if (!rows?.length) {
    return {
      ok: false,
      error: "Ошибка БД: в таблице crm_studios нет записей студий",
    };
  }

  const found = findStudentInCrmStudiosRows(
    rows as { user_id: string; students: unknown }[],
    token
  );

  if (!found) {
    return { ok: false, error: PORTAL_ERRORS.NOT_FOUND };
  }

  const student = mapStudent(found.raw);
  const visitInfo = await loadVisitsForStudent(found.ownerUserId, student.id);

  if (visitInfo.error) {
    console.warn("[portal] visits load warning:", visitInfo.error);
  }

  return {
    ok: true,
    data: {
      student,
      visits: visitInfo.visits,
      checked_in_today: visitInfo.checked_in_today,
      ownerUserId: found.ownerUserId,
    },
  };
}

export async function fetchPortalDashboard(
  token: string
): Promise<{ ok: true; data: PortalDashboard } | { ok: false; error: string }> {
  const trimmed = token.trim();
  console.log("[portal] === fetchPortalDashboard ===");
  console.log("[portal] token from URL:", trimmed);

  if (!trimmed || trimmed.length < 8) {
    return { ok: false, error: PORTAL_ERRORS.INVALID_TOKEN };
  }

  console.log("[portal] step 1: RPC portal_get_dashboard");
  const { data, error } = await supabase.rpc("portal_get_dashboard", {
    p_token: trimmed,
  });

  console.log("[portal] RPC response:", { data, error: error?.message ?? null });

  if (error) {
    if (isRpcMissingError(error.message)) {
      console.log("[portal] RPC not deployed → fallback crm_studios JSON");
      return fetchPortalDashboardFromCrmStudios(trimmed);
    }
    console.log("[portal] RPC error → trying fallback crm_studios JSON");
    const fallback = await fetchPortalDashboardFromCrmStudios(trimmed);
    if (fallback.ok) return fallback;
    return {
      ok: false,
      error: formatDbError("portal_get_dashboard", error.message, fallback.error),
    };
  }

  const payload = data as {
    ok?: boolean;
    error?: string;
    student?: Record<string, unknown>;
    visits?: PortalVisitRow[];
    checked_in_today?: boolean;
    owner_id?: string;
  } | null;

  if (!payload?.ok || !payload.student) {
    const code = payload?.error ?? "NOT_FOUND";
    console.log("[portal] RPC NOT_FOUND, trying JSON fallback:", code);
    const fallback = await fetchPortalDashboardFromCrmStudios(trimmed);
    if (fallback.ok) return fallback;
    return { ok: false, error: PORTAL_ERRORS[code] ?? PORTAL_ERRORS.NOT_FOUND };
  }

  console.log("[portal] success via RPC");
  return {
    ok: true,
    data: {
      student: mapStudent(payload.student),
      visits: Array.isArray(payload.visits) ? payload.visits : [],
      checked_in_today: Boolean(payload.checked_in_today),
      ownerUserId: payload.owner_id,
    },
  };
}

export async function portalCheckIn(
  token: string
): Promise<{ ok: true; data: PortalDashboard } | { ok: false; error: string }> {
  const trimmed = token.trim();
  console.log("[portal] portalCheckIn, token:", trimmed);

  const { data, error } = await supabase.rpc("portal_check_in", {
    p_token: trimmed,
  });

  console.log("[portal] portal_check_in response:", { data, error: error?.message ?? null });

  if (error) {
    if (isRpcMissingError(error.message)) {
      return {
        ok: false,
        error: formatDbError(
          "portal_check_in",
          error.message,
          "Выполните supabase/RUN_IN_SQL_EDITOR.sql в Supabase SQL Editor"
        ),
      };
    }
    return { ok: false, error: formatDbError("portal_check_in", error.message) };
  }

  const payload = data as {
    ok?: boolean;
    error?: string;
    student?: Record<string, unknown>;
    visits?: PortalVisitRow[];
    checked_in_today?: boolean;
  } | null;

  if (!payload?.ok || !payload.student) {
    const code = payload?.error ?? "UNKNOWN";
    return { ok: false, error: PORTAL_ERRORS[code] ?? "Не удалось отметить приход" };
  }

  return {
    ok: true,
    data: {
      student: mapStudent(payload.student),
      visits: Array.isArray(payload.visits) ? payload.visits : [],
      checked_in_today: Boolean(payload.checked_in_today),
    },
  };
}
