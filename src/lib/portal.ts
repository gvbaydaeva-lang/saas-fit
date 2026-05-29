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

/** Пробует открыть Mail.ru Агент; при неудаче — confirm + копирование текста */
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

/** UUID для всех учеников без auth_token */
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

export async function fetchPortalDashboard(
  token: string
): Promise<{ ok: true; data: PortalDashboard } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("portal_get_dashboard", {
    p_token: token.trim(),
  });

  if (error) {
    console.warn("portal_get_dashboard:", error.message);
    return {
      ok: false,
      error: "Ошибка: ссылка недействительна. Пожалуйста, обратитесь в студию",
    };
  }

  const payload = data as {
    ok?: boolean;
    error?: string;
    student?: Record<string, unknown>;
    visits?: PortalVisitRow[];
    checked_in_today?: boolean;
  } | null;

  if (!payload?.ok || !payload.student) {
    const code = payload?.error ?? "NOT_FOUND";
    return { ok: false, error: PORTAL_ERRORS[code] ?? PORTAL_ERRORS.NOT_FOUND };
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

export async function portalCheckIn(
  token: string
): Promise<{ ok: true; data: PortalDashboard } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("portal_check_in", {
    p_token: token.trim(),
  });

  if (error) {
    console.warn("portal_check_in:", error.message);
    return { ok: false, error: "Не удалось отметить приход. Попробуйте позже." };
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
