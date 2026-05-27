import { supabase } from "./supabase";
import { normalizePhone } from "./phone";

export type ProfileRow = {
  id: string;
  phone: string;
  full_name: string;
  role: "client" | "admin";
  balance: number;
};

export type VisitRow = {
  id: number;
  user_id: string;
  created_at: string;
};

export type PaymentRow = {
  id: number;
  user_id: string;
  amount: number;
  created_at: string;
};

/** QR на ресепшене: клиент сканирует этот код перед отметкой. */
export const CHECKIN_QR_PAYLOAD = "fitcrm-client-checkin";

function isValidEmail(email: string): boolean {
  const t = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export async function isPhoneAllowed(phone: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_phone_in_customers_db", {
    p_phone: normalizePhone(phone),
  });
  if (error) {
    console.warn("[FitCRM] is_phone_in_customers_db:", error.message);
    throw new Error(
      "Не удалось проверить номер. Убедитесь, что в Supabase выполнена миграция (RPC is_phone_in_customers_db)."
    );
  }
  return Boolean(data);
}

/**
 * Регистрация: реальный email для Supabase Auth + телефон в user_metadata и проверка whitelist.
 * @returns needsEmailConfirmation — true, если Supabase не выдал сессию сразу (включено подтверждение почты).
 */
export async function registerWithEmailPhone(
  email: string,
  phone: string,
  password: string
): Promise<{ needsEmailConfirmation: boolean }> {
  const em = email.trim();
  if (!isValidEmail(em)) {
    throw new Error("Введите корректный email");
  }
  const normalized = normalizePhone(phone);
  if (normalized.length !== 11) {
    throw new Error("Введите корректный номер телефона");
  }
  if (password.length < 6) {
    throw new Error("Пароль должен быть не короче 6 символов");
  }

  let allowed: boolean;
  try {
    allowed = await isPhoneAllowed(normalized);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка проверки телефона";
    throw new Error(msg);
  }

  if (!allowed) {
    throw new Error(
      "Этот номер не в списке клиентов студии. Обратитесь к администратору."
    );
  }

  let fullName: unknown;
  try {
    const { data, error } = await supabase.rpc("get_customer_name_by_phone", {
      p_phone: normalized,
    });
    if (error) {
      console.warn("[FitCRM] get_customer_name_by_phone:", error.message);
    } else {
      fullName = data;
    }
  } catch {
    /* имя опционально */
  }

  const basePath = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "");

  const { data, error } = await supabase.auth.signUp({
    email: em,
    password,
    options: {
      // После перехода из письма — на /login (там сессия подхватится из URL).
      emailRedirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}${basePath}/login`
          : undefined,
      data: {
        account_type: "client",
        phone: normalized,
        phone_raw: phone.trim(),
        email: em,
        full_name: typeof fullName === "string" ? fullName : "",
      },
    },
  });

  if (error) throw error;
  return { needsEmailConfirmation: !data.session };
}

export async function loginWithEmail(email: string, password: string): Promise<void> {
  const em = email.trim();
  if (!em) {
    throw new Error("Укажите email");
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: em,
    password,
  });
  if (error) throw error;
}

export async function fetchMyProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, phone, full_name, role, balance")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[FitCRM] profiles:", error.message);
    return null;
  }
  return data as ProfileRow | null;
}

export async function fetchMyVisits(userId: string, limit = 20): Promise<VisitRow[]> {
  const { data, error } = await supabase
    .from("visits")
    .select("id, user_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[FitCRM] visits:", error.message);
    return [];
  }
  return (data as VisitRow[]) ?? [];
}

export async function recordCheckIn(userId: string): Promise<void> {
  const { error } = await supabase.from("visits").insert({ user_id: userId });
  if (!error) return;

  if (error.message.includes("INSUFFICIENT_BALANCE")) {
    throw new Error("На балансе нет занятий для отметки");
  }
  throw new Error(error.message);
}
