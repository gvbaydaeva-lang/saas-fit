import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  fetchMyProfile,
  fetchMyVisits,
  recordCheckIn,
  type ProfileRow,
  type VisitRow,
} from "../lib/clientAuth";
import { formatPhoneDisplay } from "../lib/phone";

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function ClientDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  const loadData = useCallback(async (uid: string) => {
    const [p, v] = await Promise.all([fetchMyProfile(uid), fetchMyVisits(uid)]);
    setProfile(p);
    setVisits(v);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setAuthLoading(false);
      if (u) void loadData(u.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) void loadData(u.id);
    });

    return () => subscription.unsubscribe();
  }, [loadData]);

  const handleCheckIn = async () => {
    if (!user) return;
    setLoading(true);
    setMessage(null);
    try {
      await recordCheckIn(user.id);
      await loadData(user.id);
      setMessage({ text: "Визит отмечен. С баланса списано 1 занятие.", tone: "ok" });
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Не удалось отметить визит",
        tone: "err",
      });
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center text-[#86868b]">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <header className="bg-white/80 backdrop-blur border-b border-[#d2d2d7]/50 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Личный кабинет</h1>
            <p className="text-xs text-[#86868b]">Клиент студии</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm text-[#0071e3] font-medium"
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <section className="bg-white rounded-2xl border border-[#d2d2d7]/60 p-5 shadow-sm">
          <p className="text-sm text-[#86868b] mb-1">Здравствуйте</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {profile?.full_name || "Клиент"}
          </h2>
          {profile?.phone && (
            <p className="text-sm text-[#515154] mt-1">{formatPhoneDisplay(profile.phone)}</p>
          )}
          <div className="mt-4 flex items-end gap-2">
            <span className="text-4xl font-bold text-[#0071e3] tabular-nums">
              {profile?.balance ?? 0}
            </span>
            <span className="text-sm text-[#86868b] pb-1">занятий на балансе</span>
          </div>
          {!profile && (
            <p className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
              Профиль не найден или таблица не создана — выполните SQL-миграцию в Supabase и зарегистрируйтесь снова.
            </p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-[#d2d2d7]/60 p-5 shadow-sm">
          <button
            type="button"
            disabled={loading || (profile?.balance ?? 0) <= 0}
            onClick={() => void handleCheckIn()}
            className="w-full rounded-xl bg-[#0071e3] text-white font-semibold py-3.5 hover:bg-[#0077ed] disabled:opacity-50 transition-colors"
          >
            {loading ? "Сохранение…" : "Отметиться на занятие"}
          </button>
          <p className="text-xs text-[#86868b] mt-2 text-center leading-relaxed">
            Добавляет запись в таблицу посещений и списывает одно занятие с баланса.
          </p>
          {message && (
            <p
              className={`mt-3 text-sm rounded-xl px-3 py-2 border ${
                message.tone === "ok"
                  ? "text-emerald-800 bg-emerald-50 border-emerald-100"
                  : "text-red-700 bg-red-50 border-red-100"
              }`}
            >
              {message.text}
            </p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-[#d2d2d7]/60 p-5 shadow-sm">
          <h3 className="font-semibold mb-3">Последние визиты</h3>
          {visits.length === 0 ? (
            <p className="text-sm text-[#86868b]">Пока нет посещений</p>
          ) : (
            <ul className="space-y-2">
              {visits.map((v) => (
                <li
                  key={v.id}
                  className="flex justify-between text-sm py-2 border-b border-[#f5f5f7] last:border-0"
                >
                  <span className="text-[#515154]">Визит #{v.id}</span>
                  <span className="text-[#86868b] tabular-nums">{fmtDateTime(v.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
