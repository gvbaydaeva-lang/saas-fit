import React, { useCallback, useEffect, useState, Component, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import {
  fetchPortalDashboard,
  portalCheckIn,
  type PortalDashboard,
} from "../lib/portal";
import { studentQrPayload } from "../lib/studentQr";
import { supabaseConfigured } from "../lib/supabase";

const C = {
  bg: "#1a2229",
  card: "#243038",
  border: "#3a4a55",
  text: "#f0f2f5",
  muted: "#9aa8b5",
  accent: "#D4A757",
  ok: "#34c759",
  err: "#ff453a",
};

function fmtDate(s: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function balanceLabel(student: PortalDashboard["student"]) {
  if (student.abon === "unlim") return "∞";
  return String(student.count);
}

class PortalErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Ошибка приложения: ${msg}` };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: C.bg,
            color: C.err,
            padding: 24,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>Не удалось открыть кабинет</h1>
          <p style={{ lineHeight: 1.5 }}>{this.state.error}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function PortalQr({ studentId }: { studentId: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancel = false;
    QRCode.toDataURL(studentQrPayload(studentId), {
      width: 200,
      margin: 1,
      color: { dark: "#f0f2f5", light: "#243038" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancel) setSrc(url);
      })
      .catch((e) => {
        if (!cancel) setQrError(e instanceof Error ? e.message : "QR error");
      });
    return () => {
      cancel = true;
    };
  }, [studentId]);

  if (qrError) {
    return <div style={{ color: C.muted, fontSize: 12 }}>QR: {qrError}</div>;
  }
  if (!src) {
    return (
      <div
        style={{
          width: 200,
          height: 200,
          margin: "0 auto",
          borderRadius: 12,
          background: C.bg,
          border: `1px solid ${C.border}`,
        }}
      />
    );
  }
  return (
    <img
      src={src}
      width={200}
      height={200}
      alt="QR для пропуска"
      style={{ display: "block", margin: "0 auto", borderRadius: 12 }}
    />
  );
}

function StudentPortalContent() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    document.body.classList.add("portal-page-active");
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    document.body.style.background = C.bg;
    return () => {
      document.body.classList.remove("portal-page-active");
      document.body.style.overflow = "";
      document.body.style.height = "";
      document.body.style.background = "";
    };
  }, []);

  const load = useCallback(async () => {
    console.log("[portal page] route param token:", token);

    if (!token?.trim()) {
      setError("Ошибка: в ссылке нет токена доступа");
      setLoading(false);
      return;
    }

    if (!supabaseConfigured) {
      setError(
        "Ошибка БД: не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY при сборке сайта"
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("[portal page] starting fetchPortalDashboard");
      const r = await fetchPortalDashboard(token);
      console.log("[portal page] fetchPortalDashboard finished:", r.ok ? "ok" : r);

      if (r.ok) {
        setDashboard(r.data);
        setError(null);
      } else {
        setDashboard(null);
        setError(r.error);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[portal page] uncaught load error:", e);
      setError(`Ошибка БД: ${msg}`);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleCheckIn = async () => {
    if (!token?.trim() || checkingIn) return;
    setCheckingIn(true);
    try {
      const r = await portalCheckIn(token);
      if (r.ok) {
        setDashboard(r.data);
        setToast({ text: "Приход отмечен", ok: true });
      } else {
        setToast({ text: r.error, ok: false });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setToast({ text: `Ошибка БД: ${msg}`, ok: false });
    } finally {
      setCheckingIn(false);
    }
  };

  const student = dashboard?.student;
  const canCheckIn =
    dashboard &&
    !dashboard.checked_in_today &&
    student &&
    (student.abon === "unlim" || student.count > 0) &&
    (!student.until || student.until >= new Date().toISOString().slice(0, 10));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "16px 16px 32px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 16, fontSize: 11, color: C.accent }}>
          Личный кабинет · FitCRM
        </div>

        {toast && (
          <div
            style={{
              marginBottom: 14,
              padding: "12px 14px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
              background: toast.ok ? "rgba(52, 199, 89, 0.15)" : "rgba(255, 69, 58, 0.15)",
              color: toast.ok ? C.ok : C.err,
              border: `1px solid ${toast.ok ? "rgba(52,199,89,0.35)" : "rgba(255,69,58,0.35)"}`,
            }}
          >
            {toast.text}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: 48, color: C.muted }}>
            <Loader2
              size={28}
              style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px", display: "block" }}
            />
            Загрузка данных…
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.err}`,
              borderRadius: 14,
              padding: 24,
              color: C.text,
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            <div style={{ color: C.err, fontWeight: 700, marginBottom: 10 }}>Не удалось загрузить кабинет</div>
            <div>{error}</div>
            <button
              type="button"
              onClick={() => void load()}
              style={{
                marginTop: 16,
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: C.accent,
                color: "#1a2229",
                fontWeight: 600,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Повторить
            </button>
          </div>
        )}

        {!loading && !error && student && dashboard && (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                textAlign: "center",
                margin: "8px 0 18px",
                lineHeight: 1.3,
              }}
            >
              Здравствуйте, {student.name}!
            </h1>

            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 16,
                marginBottom: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                <span style={{ color: C.muted }}>Направление</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{student.direction || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                <span style={{ color: C.muted }}>Остаток занятий</span>
                <span style={{ fontWeight: 700, color: C.accent, fontSize: 18 }}>{balanceLabel(student)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                <span style={{ color: C.muted }}>Срок абонемента</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{fmtDate(student.until)}</span>
              </div>
            </div>

            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 16,
                marginBottom: 14,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 12 }}>QR для пропуска</div>
              <PortalQr studentId={student.id} />
            </div>

            <button
              type="button"
              disabled={!canCheckIn || checkingIn}
              onClick={() => void handleCheckIn()}
              style={{
                width: "100%",
                padding: "16px 20px",
                borderRadius: 12,
                border: "none",
                fontSize: 15,
                fontWeight: 800,
                cursor: canCheckIn && !checkingIn ? "pointer" : "not-allowed",
                background: canCheckIn ? C.accent : "#4a5560",
                color: canCheckIn ? "#1a2229" : C.muted,
                marginBottom: 14,
              }}
            >
              {checkingIn ? (
                "Отправка…"
              ) : dashboard.checked_in_today ? (
                "Сегодня уже отмечено"
              ) : (
                "ОТМЕТИТЬ ПРИХОД"
              )}
            </button>

            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 12 }}>
                История посещений
              </div>
              {dashboard.visits.length === 0 ? (
                <div style={{ fontSize: 13, color: C.muted }}>Пока нет записей</div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {dashboard.visits.map((v) => (
                    <li
                      key={v.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 0",
                        borderBottom: `1px solid ${C.border}`,
                        fontSize: 13,
                      }}
                    >
                      <Clock size={14} style={{ color: C.accent }} />
                      {fmtDateTime(v.visited_at)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {!loading && !error && !student && (
          <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>
            Нет данных для отображения
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/** Страница портала: React Router /portal/:token (аналог app/portal/[token]/page.tsx в Next.js) */
export default function StudentPortalPage() {
  return (
    <PortalErrorBoundary>
      <StudentPortalContent />
    </PortalErrorBoundary>
  );
}
