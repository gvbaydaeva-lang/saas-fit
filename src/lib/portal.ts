import { supabase } from "./supabase";
import { getPortalUrl } from "./resolveAppUrl";
import { normalizePhone } from "./phone";

export function generateAuthToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export { getPortalUrl };

export function getPortalAccessMessage(authToken: string): string {
  return `Ваш личный кабинет студии: ${getPortalUrl(authToken)}`;
}

export async function copyPortalAccessMessage(authToken: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(getPortalAccessMessage(authToken));
    return true;
  } catch {
    return false;
  }
}

/** Ссылка Mail.ru Агент (Макс) для чата по номеру */
export function getMaxAgentChatUrl(phone: string): string | null {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return `agent:chat?phone=${digits}`;
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
  INVALID_TOKEN: "Некорректная ссылка доступа",
  NOT_FOUND: "Кабинет не найден. Проверьте ссылку или обратитесь в студию",
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
    return { ok: false, error: "Не удалось загрузить кабинет. Проверьте подключение к Supabase." };
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
    return { ok: false, error: PORTAL_ERRORS[code] ?? "Кабинет недоступен" };
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
