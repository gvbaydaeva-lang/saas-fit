import { supabase } from "./supabase";
import { normalizePhone, phoneToAuthEmail } from "./phone";

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

export async function isPhoneAllowed(phone: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_phone_in_customers_db", {
    p_phone: normalizePhone(phone),
  });
  if (error) {
    console.warn("[FitCRM] is_phone_in_customers_db:", error.message);
    throw new Error(
      "Не удалось проверить номер. Убедитесь, что миграция 001_client_cabinet.sql выполнена в Supabase."
    );
  }
  return Boolean(data);
}

export async function registerWithPhone(
  phone: string,
  password: string
): Promise<void> {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 11) {
    throw new Error("Введите корректный номер телефона");
  }
  if (password.length < 6) {
    throw new Error("Пароль должен быть не короче 6 символов");
  }

  const allowed = await isPhoneAllowed(normalized);
  if (!allowed) {
    throw new Error(
      "Этот номер не в списке клиентов студии. Обратитесь к администратору."
    );
  }

  const { data: fullName } = await supabase.rpc("get_customer_name_by_phone", {
    p_phone: normalized,
  });

  const { error } = await supabase.auth.signUp({
    email: phoneToAuthEmail(normalized),
    password,
    options: {
      data: {
        account_type: "client",
        phone: normalized,
        full_name: typeof fullName === "string" ? fullName : "",
      },
    },
  });

  if (error) throw error;
}

export async function loginWithPhone(
  phone: string,
  password: string
): Promise<void> {
  const normalized = normalizePhone(phone);
  const { error } = await supabase.auth.signInWithPassword({
    email: phoneToAuthEmail(normalized),
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
