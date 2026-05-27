import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  CHECKIN_QR_PAYLOAD,
  fetchMyProfile,
  fetchMyVisits,
  recordCheckIn,
  type ProfileRow,
  type VisitRow,
} from "../lib/clientAuth";
import { formatPhoneDisplay } from "../lib/phone";

const QR_READER_ID = "client-checkin-qr-reader";

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
  const [qrOpen, setQrOpen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const loadData = useCallback(async (uid: string) => {
    const [p, v] = await Promise.all([fetchMyProfile(uid), fetchMyVisits(uid)]);
    setProfile(p);
    setVisits(v);
  }, []);

  const handleCheckIn = useCallback(async () => {
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
  }, [user, loadData]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setAuthLoading(false);
      if (!u) navigate("/login", { replace: true });
      else void loadData(u.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) navigate("/login", { replace: true });
      else void loadData(u.id);
    });

    return () => subscription.unsubscribe();
  }, [loadData, navigate]);

  useEffect(() => {
    if (!qrOpen || !user) {
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
        scannerRef.current = null;
      }
      return;
    }

    const scanner = new Html5Qrcode(QR_READER_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          const t = decoded.trim();
          if (t !== CHECKIN_QR_PAYLOAD) {
            setMessage({
              text: "Неверный QR-код. Отсканируйте код на стойке студии.",
              tone: "err",
            });
            return;
          }
          await scanner.stop().catch(() => {});
          setQrOpen(false);
          await handleCheckIn();
        },
        () => {}
      )
      .catch(() => {
        setMessage({
          text: "Не удалось открыть камеру. Разрешите доступ или используйте HTTPS.",
          tone: "err",
        });
        setQrOpen(false);
      });

    return () => {
      void scanner.stop().catch(() => {});
      scanner.clear();
    };
  }, [qrOpen, user, handleCheckIn]);

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
              Профиль не найден. Выполните SQL-миграцию и перерегистрируйтесь с типом account_type
              client.
            </p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-[#d2d2d7]/60 p-5 shadow-sm">
          <button
            type="button"
            disabled={loading || (profile?.balance ?? 0) <= 0}
            onClick={() => setQrOpen(true)}
            className="w-full rounded-xl bg-[#0071e3] text-white font-semibold py-3.5 hover:bg-[#0077ed] disabled:opacity-50 transition-colors"
          >
            {loading ? "Сохранение…" : "Отметиться"}
          </button>
          <p className="text-xs text-[#86868b] mt-2 text-center leading-relaxed">
            Откроется камера: отсканируйте QR на ресепшене (
            <code className="text-[10px]">{CHECKIN_QR_PAYLOAD}</code>
            ). Администратор может сгенерировать QR в CRM.
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

        <Link to="/" className="block text-center text-sm text-[#86868b] hover:text-[#1d1d1f] py-2">
          ← Вернуться в CRM студии
        </Link>
      </main>

      {qrOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-4 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-2">Сканирование QR</h3>
            <div id={QR_READER_ID} className="rounded-xl overflow-hidden min-h-[260px] bg-black" />
            <button
              type="button"
              className="mt-3 w-full py-2.5 rounded-xl border border-[#d2d2d7] text-sm font-medium"
              onClick={() => setQrOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
