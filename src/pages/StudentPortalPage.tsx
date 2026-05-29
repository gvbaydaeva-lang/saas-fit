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
      setError("Ссылка доступа недействительна");
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
        <div style={{ textAlign: "center", marginBottom: 20, paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Личный кабинет
          </div>
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
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {!loading && student && dashboard && (
          <>
            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: "20px 18px",
                marginBottom: 14,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{student.name}</div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Баланс занятий
              </div>
              <div style={{ fontSize: 48, fontWeight: 800, color: C.accent, lineHeight: 1, marginBottom: 16 }}>
                {balanceLabel(student)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, textAlign: "left" }}>
                <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Направление</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{student.direction || "—"}</div>
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Срок абонемента</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(student.until)}</div>
                </div>
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
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                QR для пропуска
              </div>
              <PortalQr studentId={student.id} />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>Покажите код администратору на ресепшене</div>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                История посещений
              </div>
              {dashboard.visits.length === 0 ? (
                <div style={{ fontSize: 13, color: C.muted }}>Пока нет записей</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th style={{ textAlign: "left", padding: "8px 4px", color: C.muted, fontWeight: 600 }}>Дата</th>
                      <th style={{ textAlign: "right", padding: "8px 4px", color: C.muted, fontWeight: 600 }}>Время</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.visits.map((v) => (
                      <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "10px 4px", display: "flex", alignItems: "center", gap: 6 }}>
                          <Clock size={13} style={{ color: C.accent, flexShrink: 0 }} />
                          {fmtDateTime(v.visited_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
