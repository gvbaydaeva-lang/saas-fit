import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        const u = session?.user ?? null;
        setUser(u);
        if (u) void loadData(u.id);
        else {
          setProfile(null);
          setVisits([]);
        }
      })
      .catch((err) => {
        console.error("[FitCRM] dashboard getSession:", err);
        if (!cancelled) {
          setUser(null);
          setProfile(null);
          setVisits([]);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) void loadData(u.id);
      else {
        setProfile(null);
        setVisits([]);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadData]);

  const handleCheckIn = async () => {
    if (!user) {
      setMessage({ text: "Войдите, чтобы отметить визит.", tone: "err" });
      navigate("/login");
      return;
    }
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
      <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center text-[#6F7B84]">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#333333]">
      <header className="bg-white/80 backdrop-blur border-b border-[#E7EAEE]/50 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Личный кабинет</h1>
            <p className="text-xs text-[#6F7B84]">Клиент студии</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xs text-[#6F7B84] hover:text-[#333333]">
              CRM
            </Link>
            {user ? (
              <button
                type="button"
                onClick={() => void logout()}
                className="text-sm text-[#D4A757] font-medium"
              >
                Выйти
              </button>
            ) : (
              <Link to="/login" className="text-sm text-[#D4A757] font-medium">
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {!user && (
          <div className="rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-sm px-4 py-3">
            Вы просматриваете страницу без входа. Чтобы видеть баланс, визиты и отмечаться,{" "}
            <Link className="text-[#D4A757] font-medium underline" to="/login">
              войдите
            </Link>
            .
          </div>
        )}

        <section className="bg-white rounded-2xl border border-[#E7EAEE]/60 p-5 shadow-sm">
          <p className="text-sm text-[#6F7B84] mb-1">Здравствуйте</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {user ? profile?.full_name || "Клиент" : "Гость"}
          </h2>
          {user && profile?.phone && (
            <p className="text-sm text-[#515154] mt-1">{formatPhoneDisplay(profile.phone)}</p>
          )}
          <div className="mt-4 flex items-end gap-2">
            <span className="text-4xl font-bold text-[#D4A757] tabular-nums">
              {user ? profile?.balance ?? 0 : "—"}
            </span>
            <span className="text-sm text-[#6F7B84] pb-1">занятий на балансе</span>
          </div>
          {user && !profile && (
            <p className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
              Профиль не найден — выполните SQL-миграцию в Supabase и зарегистрируйтесь.
            </p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-[#E7EAEE]/60 p-5 shadow-sm">
          <button
            type="button"
            disabled={loading || !user || (profile?.balance ?? 0) <= 0}
            onClick={() => void handleCheckIn()}
            className="w-full rounded-xl bg-[#D4A757] text-white font-semibold py-3.5 hover:bg-[#E2B768] disabled:opacity-50 transition-colors"
          >
            {loading ? "Сохранение…" : "Отметиться на занятие"}
          </button>
          <p className="text-xs text-[#6F7B84] mt-2 text-center leading-relaxed">
            Сохраняет визит в Supabase и списывает занятие (только для вошедших пользователей).
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

        <section className="bg-white rounded-2xl border border-[#E7EAEE]/60 p-5 shadow-sm">
          <h3 className="font-semibold mb-3">Последние визиты</h3>
          {!user ? (
            <p className="text-sm text-[#6F7B84]">Войдите, чтобы увидеть историю посещений.</p>
          ) : visits.length === 0 ? (
            <p className="text-sm text-[#6F7B84]">Пока нет посещений</p>
          ) : (
            <ul className="space-y-2">
              {visits.map((v) => (
                <li
                  key={v.id}
                  className="flex justify-between text-sm py-2 border-b border-[#f5f5f7] last:border-0"
                >
                  <span className="text-[#515154]">Визит #{v.id}</span>
                  <span className="text-[#6F7B84] tabular-nums">{fmtDateTime(v.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
