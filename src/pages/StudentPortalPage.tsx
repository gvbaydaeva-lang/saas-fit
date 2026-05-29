import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import {
  fetchPortalDashboard,
  portalCheckIn,
  type PortalDashboard,
} from "../lib/portal";
import { studentQrPayload } from "../lib/studentQr";

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

const INVALID_LINK_MSG =
  "Ошибка: ссылка недействительна. Пожалуйста, обратитесь в студию";

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

function PortalQr({ studentId }: { studentId: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      setSrc(null);
      return;
    }
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
      .catch(() => {
        if (!cancel) setSrc(null);
      });
    return () => {
      cancel = true;
    };
  }, [studentId]);

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

export default function StudentPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!token?.trim()) {
      setError(INVALID_LINK_MSG);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const r = await fetchPortalDashboard(token);
    if (r.ok) setDashboard(r.data);
    else setError(r.error);
    setLoading(false);
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
    const r = await portalCheckIn(token);
    setCheckingIn(false);
    if (r.ok) {
      setDashboard(r.data);
      setToast({ text: "Приход отмечен", ok: true });
    } else {
      setToast({ text: r.error, ok: false });
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
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
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
            <Loader2 size={28} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
            Загрузка…
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: 24,
              textAlign: "center",
              color: C.err,
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            {error}
          </div>
        )}

        {!loading && student && dashboard && (
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
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 12,
                }}
              >
                QR для пропуска
              </div>
              <PortalQr studentId={student.id} />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                Покажите код администратору на ресепшене
              </div>
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
                letterSpacing: "0.04em",
                cursor: canCheckIn && !checkingIn ? "pointer" : "not-allowed",
                background: canCheckIn ? C.accent : "#4a5560",
                color: canCheckIn ? "#1a2229" : C.muted,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {checkingIn ? (
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              ) : dashboard.checked_in_today ? (
                <>
                  <CheckCircle2 size={18} /> Сегодня уже отмечено
                </>
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
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 12,
                }}
              >
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
                      <Clock size={14} style={{ color: C.accent, flexShrink: 0 }} />
                      {fmtDateTime(v.visited_at)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
