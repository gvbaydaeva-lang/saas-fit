import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { 
  Users, 
  GraduationCap, 
  CalendarDays, 
  BarChart2, 
  Home, 
  Plus, 
  Trash2, 
  CheckSquare, 
  X, 
  QrCode, 
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  AlertTriangle, 
  TrendingUp, 
  Settings,
  CircleDot,
  Check,
  Building,
  UserCheck,
  Database,
  LogOut,
  Copy,
  Server,
  Lock,
  Cloud,
  Zap,
  ShieldAlert,
  History,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createClient } from "@supabase/supabase-js";
import { Html5Qrcode } from "html5-qrcode";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from "./lib/supabase";
import { getEmailRedirectLoginUrl } from "./lib/resolveAppUrl";

export { supabase };

const SK = "fitcrm_pro_v3_supabase";

const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const fmtDate = (s: string) => { if(!s) return "—"; const [y,m,d]=s.split("-"); return `${d}.${m}.${y}`; };
/** Дата и время для таймлайна визитов (UTC → локаль) */
const fmtDateTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
};
const fmtMoney = (n: number) => n.toLocaleString("ru-RU") + " ₽";

const STUDENT_QR_PREFIX = "fitcrm-student-";
function studentQrPayload(studentId: number) {
  return `${STUDENT_QR_PREFIX}${studentId}`;
}

function parseStudentIdFromQr(text: string): number | null {
  const t = text.trim();
  const m = new RegExp(`^${STUDENT_QR_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`, "i").exec(t);
  if (m) return parseInt(m[1], 10);
  if (/^\d{10,}$/.test(t)) return parseInt(t, 10);
  try {
    const j = JSON.parse(t) as { student_id?: number | string };
    const sid = j.student_id;
    if (typeof sid === "number" && Number.isFinite(sid)) return sid;
    if (typeof sid === "string" && /^\d+$/.test(sid)) return parseInt(sid, 10);
  } catch { /* ignore */ }
  return null;
}

const dirColors: Record<string, string> = {
  "Йога": "#8b5cf6",       // Violet 500
  "Фитнес": "#3b82f6",     // Blue 500
  "Бокс": "#ef4444",       // Red 500
  "Танцы": "#ec4899",      // Pink 500
  "Растяжка": "#06b6d4",   // Cyan 500
  "Пилатес": "#10b981",    // Emerald 500
  "Английский": "#d97706",  // Amber 600
  "Немецкий": "#ea580c",    // Orange 600
  "Китайский": "#dc2626",   // Red 600
  "Испанский": "#e11d48",   // Rose 600
  "Французский": "#4f46e5", // Indigo 600
  "Русский язык": "#0891b2", // Cyan 600
  "Рисование": "#fb923c",   // Orange 400
  "Лепка": "#db2777",       // Pink 600
  "Подготовка к школе": "#84cc16", // Lime 500
  "Логопед": "#a855f7",    // Purple 500
  "Шахматы": "#15803d",    // Green 700
  "Музыка": "#a21caf",     // Fuchsia 700
  "Другое": "#64748b"      // Slate 500
};

const getColor = (d: string) => {
  if (dirColors[d]) return dirColors[d];
  let hash = 0;
  for (let i = 0; i < d.length; i++) {
    hash = d.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = ["#8b5cf6", "#3b82f6", "#ef4444", "#ec4899", "#10b981", "#d97706", "#f97316", "#06b6d4", "#65a30d", "#4f46e5", "#0891b2", "#db2777", "#a21caf"];
  return palette[Math.abs(hash) % palette.length];
};

interface Student {
  id: number;
  name: string;
  phone: string;
  classType: string;
  abon: string;
  count: number;
  until: string;
  sum: number;
  payment: string;
  visits: number;
  direction: string;
}

interface Teacher {
  id: number;
  name: string;
  phone: string;
  direction: string;
  rate: number;
}

interface SchedItem {
  id: number;
  day: number;
  time: string;
  subject: string;
  teacherId: number | null;
  classType: string;
}

interface StaffMember {
  id: number;
  name: string;
  email: string;
  phone?: string;
  uid?: string;
  role: "staff";
  createdAt: string;
}

interface CrmVisitRow {
  id: number;
  student_id: number;
  visited_at: string;
  created_at: string;
}

interface ExpenseItem {
  id: number;
  sum: number;
  category: "Аренда" | "Зарплата" | "Реклама" | "Инвентарь" | "Маркетинг" | "Хоз.нужды" | "Другое";
  /** Произвольная подпись категории, если в форме выбрано «Другое» */
  categoryCustom?: string;
  date: string;
  comment?: string;
}

interface DB {
  students: Student[];
  teachers: Teacher[];
  schedule: SchedItem[];
  studioType: string;
  studioName?: string;
  directions: string[];
  team?: StaffMember[];
  expenses?: ExpenseItem[];
}

function isExpired(c: Student) {
  if (c.abon === "count" && c.count <= 0) return true;
  if (c.until) { const d = new Date(c.until); d.setHours(0,0,0,0); if (d < today()) return true; }
  return false;
}

function isAlmost(c: Student) {
  if (isExpired(c)) return false;
  if (c.abon === "count" && c.count > 0 && c.count < 3) return true;
  if (c.until) { const d = new Date(c.until); d.setHours(0,0,0,0); const diff = Math.ceil((d.getTime()-today().getTime())/86400000); if (diff>=0&&diff<3) return true; }
  return false;
}

const getDefaultDirections = (type: string): string[] => {
  if (type === "sport") return ["Йога", "Фитнес", "Бокс", "Танцы", "Растяжка", "Пилатес"];
  if (type === "language") return ["Английский", "Немецкий", "Китайский", "Испанский", "Французский", "Русский язык"];
  if (type === "kids") return ["Рисование", "Лепка", "Подготовка к школе", "Логопед", "Шахматы", "Музыка"];
  return ["Йога", "Фитнес"];
};

const getStudioTitle = (type: string, name?: string) => {
  if (name && name.trim()) return name.trim();
  return "Моя Студия";
};

// Templates for recommended directions selection
const allDirectionsPresets: Record<string, string[]> = {
  sport: ["Йога", "Фитнес", "Бокс", "Танцы", "Растяжка", "Пилатес", "Кроссфит", "Тренажерный зал", "Аэробика", "Плавание"],
  language: ["Английский", "Немецкий", "Китайский", "Испанский", "Французский", "Русский язык", "Подготовка к ЕГЭ", "Разговорный клуб", "Итальянский"],
  kids: ["Рисование", "Лепка", "Подготовка к школе", "Логопед", "Шахматы", "Музыка", "Арифметика", "Робототехника", "Творчество"]
};

const migrateDirectionsOnTypeChange = (type: string, currentData: DB) => {
  const newDirs = getDefaultDirections(type);
  const mapDir = (d: string): string => {
    if (newDirs.includes(d)) return d;
    if (type === "sport") {
      if (["Английский", "Немецкий", "Китайский", "Испанский", "Французский", "Русский язык", "Рисование", "Лепка", "Подготовка к школе", "Логопед", "Шахматы", "Музыка"].includes(d)) {
        if (["Английский", "Рисование"].includes(d)) return "Йога";
        if (["Немецкий", "Лепка"].includes(d)) return "Фитнес";
        if (["Китайский", "Подготовка к школе"].includes(d)) return "Бокс";
        if (["Испанский", "Логопед"].includes(d)) return "Танцы";
        if (["Французский", "Шахматы"].includes(d)) return "Растяжка";
        if (["Русский язык", "Музыка"].includes(d)) return "Пилатес";
      }
      return "Йога";
    }
    if (type === "language") {
      if (["Йога", "Фитнес", "Бокс", "Танцы", "Растяжка", "Пилатес", "Рисование", "Лепка", "Подготовка к школе", "Логопед", "Шахматы", "Музыка"].includes(d)) {
        if (["Йога", "Рисование"].includes(d)) return "Английский";
        if (["Фитнес", "Лепка"].includes(d)) return "Немецкий";
        if (["Бокс", "Подготовка к школе"].includes(d)) return "Китайский";
        if (["Танцы", "Логопед"].includes(d)) return "Испанский";
        if (["Растяжка", "Шахматы"].includes(d)) return "Французский";
        if (["Пилатес", "Музыка"].includes(d)) return "Русский язык";
      }
      return "Английский";
    }
    if (type === "kids") {
      if (["Йога", "Фитнес", "Бокс", "Танцы", "Растяжка", "Пилатес", "Английский", "Немецкий", "Китайский", "Испанский", "Французский", "Русский язык"].includes(d)) {
        if (["Йога", "Английский"].includes(d)) return "Рисование";
        if (["Фитнес", "Немецкий"].includes(d)) return "Лепка";
        if (["Бокс", "Китайский"].includes(d)) return "Подготовка к школе";
        if (["Танцы", "Испанский"].includes(d)) return "Логопед";
        if (["Растяжка", "Французский"].includes(d)) return "Шахматы";
        if (["Пилатес", "Русский язык"].includes(d)) return "Музыка";
      }
      return "Рисование";
    }
    return newDirs[0] || "Другое";
  };

  const students = currentData.students.map(s => ({ ...s, direction: mapDir(s.direction) }));
  const teachers = currentData.teachers.map(t => ({ ...t, direction: mapDir(t.direction) }));
  const schedule = currentData.schedule.map(sc => ({ ...sc, subject: mapDir(sc.subject) }));

  return { students, teachers, schedule };
};

function seed(): DB {
  const b = Date.now();
  const fut = new Date(); fut.setMonth(fut.getMonth()+2); const fd = fut.toISOString().split("T")[0];
  const past = new Date(); past.setMonth(past.getMonth()-1); const pd = past.toISOString().split("T")[0];
  const near = new Date(); near.setDate(near.getDate()+2); const nd = near.toISOString().split("T")[0];
  return {
    students: [
      {id:b+1,name:"Анна Смирнова",phone:"+7 (916) 123-45-67",classType:"group",abon:"count",count:8,until:fd,sum:3500,payment:"paid",visits:2,direction:"Йога"},
      {id:b+2,name:"Игорь Петров",phone:"+7 (903) 987-65-43",classType:"group",abon:"count",count:2,until:nd,sum:2800,payment:"paid",visits:8,direction:"Фитнес"},
      {id:b+3,name:"Мария Козлова",phone:"+7 (926) 555-00-11",classType:"individual",abon:"unlim",count:999,until:fd,sum:5000,payment:"debt",visits:5,direction:"Растяжка"},
      {id:b+4,name:"Дмитрий Волков",phone:"+7 (999) 222-33-44",classType:"group",abon:"count",count:0,until:pd,sum:1500,payment:"paid",visits:10,direction:"Бокс"},
      {id:b+5,name:"Светлана Орлова",phone:"+7 (912) 444-55-66",classType:"individual",abon:"count",count:5,until:fd,sum:4500,payment:"paid",visits:3,direction:"Пилатес"},
    ],
    teachers: [
      {id:b+10,name:"Елена Васильева",phone:"+7 (915) 100-20-30",direction:"Йога",rate:800},
      {id:b+11,name:"Константин Морозов",phone:"+7 (925) 200-30-40",direction:"Фитнес",rate:700},
      {id:b+12,name:"Ольга Зайцева",phone:"+7 (935) 300-40-50",direction:"Растяжка",rate:1000},
    ],
    schedule: [
      {id:b+20,day:0,time:"09:00",subject:"Йога",teacherId:b+10,classType:"group"},
      {id:b+21,day:2,time:"11:00",subject:"Растяжка",teacherId:b+12,classType:"individual"},
      {id:b+22,day:1,time:"18:00",subject:"Фитнес",teacherId:b+11,classType:"group"},
      {id:b+23,day:4,time:"10:00",subject:"Йога",teacherId:b+10,classType:"group"},
    ],
    studioType: "sport",
    studioName: "Моя Студия",
    directions: ["Йога","Фитнес","Бокс","Танцы","Растяжка","Пилатес"],
    team: [],
    expenses: []
  };
}

function loadData(userId?: string): DB {
  try {
    const key = userId ? `${SK}_${userId}` : SK;
    const d = localStorage.getItem(key);
    if (d) {
      const parsed = JSON.parse(d);
      if (!parsed.studioType) parsed.studioType = "sport";
      if (!parsed.studioName) parsed.studioName = getStudioTitle(parsed.studioType);
      if (!parsed.directions || parsed.directions.length === 0) parsed.directions = getDefaultDirections(parsed.studioType);
      
      const rawStudents = Array.isArray(parsed.students) ? parsed.students : [];
      const metadataItem = rawStudents.find((s: any) => s.id === -8888);
      const actualStudents = rawStudents.filter((s: any) => s.id !== -8888);
      
      parsed.students = actualStudents;
      if (!parsed.team) parsed.team = metadataItem?.team || [];
      if (!parsed.expenses) parsed.expenses = metadataItem?.expenses || [];
      return parsed;
    }
  } catch {}
  return seed();
}

function LiveStudentQr({ studentId, size = 180 }: { studentId: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const id = parseInt(studentId, 10);
    if (!id) {
      setSrc(null);
      return;
    }
    let cancel = false;
    QRCode.toDataURL(studentQrPayload(id), {
      width: size,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M"
    })
      .then((url) => { if (!cancel) setSrc(url); })
      .catch(() => { if (!cancel) setSrc(null); });
    return () => { cancel = true; };
  }, [studentId, size]);
  if (!studentId || !parseInt(studentId, 10)) {
    return <div style={{ width: size, height: size, borderRadius: 8, background: "#e8e8ed", display: "flex", alignItems: "center", justifyContent: "center", color: "#86868b", fontSize: 12, margin: "0 auto" }}>Нет ученика</div>;
  }
  if (!src) {
    return <div style={{ width: size, height: size, margin: "0 auto", borderRadius: 8, background: "#2c2c2e", border: "1px solid #3a3a3c" }} />;
  }
  return <img src={src} width={size} height={size} alt={`QR ученика ${studentId}`} style={{ display: "block", margin: "0 auto", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }} />;
}


function Badge({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string; label: string; border: string }> = {
    paid: { bg: "rgba(48, 209, 88, 0.15)", color: "#30d158", label: "Оплачено", border: "rgba(48, 209, 88, 0.3)" },     // Green
    debt: { bg: "rgba(255, 159, 10, 0.15)", color: "#ff9f0a", label: "Долг", border: "rgba(255, 159, 10, 0.3)" },      // Orange
    expired: { bg: "rgba(255, 69, 58, 0.15)", color: "#ff453a", label: "Истёк", border: "rgba(255, 69, 58, 0.3)" },    // Red
    active: { bg: "rgba(10, 132, 255, 0.15)", color: "#0aa4ff", label: "Активен", border: "rgba(10, 132, 255, 0.3)" },  // Blue
    almost: { bg: "rgba(255, 214, 10, 0.15)", color: "#ffd60a", label: "На исходе", border: "rgba(255, 214, 10, 0.3)" } // Yellow
  };
  const item = map[type] || { bg: "rgba(255, 214, 10, 0.15)", color: "#ffd60a", label: type, border: "rgba(255, 214, 10, 0.3)" };
  return (
    <span style={{
      background: item.bg,
      color: item.color,
      border: `1px solid ${item.border}`,
      borderRadius: 20,
      padding: "2px 10px",
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: "nowrap",
      display: "inline-flex",
      alignItems: "center"
    }}>
      {item.label}
    </span>
  );
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.6)", // Sleek dark overlay
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: 16
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#2c2c2e",
        border: "1px solid #3a3a3c",
        borderRadius: 16,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
        padding: 24,
        maxWidth: 420,
        width: "100%",
        color: "#f5f5f7",
        position: "relative"
      }}>
        <button onClick={onClose} style={{
          position: "absolute",
          top: 14,
          right: 14,
          background: "none",
          border: "none",
          color: "#8e8e93",
          cursor: "pointer",
          padding: 4,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s"
        }} className="hover:bg-white/10 hover:text-white">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color="#0071e3" }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  const appleColor = color === "#cb5d43" ? "#0aa4ff" : color;
  return (
    <div style={{
      background: "#2c2c2e",
      border: "1px solid #3a3a3c",
      borderRadius: 14,
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#8e8e93", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        <span style={{ color: appleColor, background: `${appleColor}20`, padding: 7, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>{label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#f5f5f7", letterSpacing: "-0.5px" }}>{value}</div>
    </div>
  );
}

function Input({ label, value, onChange, type="text", placeholder="", options=null, disabled=false }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; options?: { value: string; label: string }[] | null; disabled?: boolean }) {
  const [isFocused, setIsFocused] = useState(false);
  const s = {
    background: disabled ? "#252528" : "#1e1e20",
    border: `1px solid ${isFocused ? "#0a84ff" : "#3a3a3c"}`,
    borderRadius: 8,
    color: disabled ? "#8e8e93" : "#f5f5f7",
    padding: "8px 12px",
    fontSize: 13,
    width: "100%",
    outline: "none",
    boxShadow: isFocused ? "0 0 0 3.5px rgba(10, 132, 255, 0.25)" : "none",
    transition: "all 0.15s ease-in-out",
    fontFamily: "inherit"
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, color: "#8e8e93", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
      {options ? (
        <select 
          style={{ ...s, height: 38 }} 
          value={value} 
          onChange={e => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input 
          style={s} 
          type={type} 
          value={value} 
          onChange={e => onChange(e.target.value)} 
          placeholder={placeholder} 
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function Btn({ children, onClick, color="default", small=false, type="button", disabled=false, style={}, title }: { children: React.ReactNode; onClick?: (e: any) => void; color?: string; small?: boolean; type?: "button" | "submit" | "reset"; disabled?: boolean; style?: React.CSSProperties; title?: string }) {
  const colors: Record<string, { bg: string; border: string; text: string; hover: string }> = {
    default: { bg: "#2c2c2e", border: "#3a3a3c", text: "#f5f5f7", hover: "#3a3a3c" },
    green: { bg: "#30d158", border: "#30d158", text: "#ffffff", hover: "#2db34f" },
    blue: { bg: "#0a84ff", border: "#0a84ff", text: "#ffffff", hover: "#0062c3" },
    red: { bg: "#ff453a", border: "#ff453a", text: "#ffffff", hover: "#e03128" },
    yellow: { bg: "#ffd60a", border: "#ffd60a", text: "#1d1d1f", hover: "#e08200" },
  };
  const c = colors[color] || colors.default;
  const isDefault = color === "default";
  
  return (
    <button 
      type={type}
      title={title}
      onClick={onClick} 
      disabled={disabled}
      style={{
        background: c.bg,
        border: isDefault ? `1px solid ${c.border}` : "1px solid transparent",
        borderRadius: 8,
        color: c.text,
        padding: small ? "6px 12px" : "10px 18px",
        fontSize: small ? 12 : 13,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        fontWeight: 500,
        boxShadow: isDefault ? "0 1px 2px rgba(0,0,0,0.15)" : "0 2px 4px rgba(0,0,0,0.2)",
        transition: "all 0.12s ease-in-out",
        ...style
      }} 
      className={disabled ? "" : "hover:brightness-110 active:scale-98"}
    >
      {children}
    </button>
  );
}

const STUDENT_PAGE_QR_READER_EL = "student-page-qr-reader";

/** Модальное окно камеры для сканирования QR ученика (html5-qrcode) */
function StudentQrScannerModal({
  open,
  onClose,
  C,
  onStudentIdDecoded
}: {
  open: boolean;
  onClose: () => void;
  C: { card: string; border: string; muted: string; text: string };
  onStudentIdDecoded: (id: number) => void;
}) {
  const decodeHandler = useRef(onStudentIdDecoded);
  decodeHandler.current = onStudentIdDecoded;

  useEffect(() => {
    if (!open) return;
    let scanner: Html5Qrcode | null = null;
    let done = false;
    const timer = window.setTimeout(() => {
      scanner = new Html5Qrcode(STUDENT_PAGE_QR_READER_EL);
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (done) return;
            const sid = parseStudentIdFromQr(text);
            if (sid == null) return;
            done = true;
            scanner
              ?.stop()
              .then(() => scanner?.clear())
              .catch(() => {})
              .finally(() => {
                decodeHandler.current(sid);
              });
          },
          () => {}
        )
        .catch((e) => console.warn("html5-qrcode:", e));
    }, 150);
    return () => {
      done = true;
      window.clearTimeout(timer);
      if (scanner) {
        scanner.stop().catch(() => {}).finally(() => {
          try { scanner?.clear(); } catch { /* ignore */ }
        });
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(5px)",
        zIndex: 10002,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 20,
          maxWidth: 440,
          width: "100%",
          color: C.text
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 750, marginBottom: 6 }}>Сканировать QR</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.45 }}>
          Разрешите доступ к камере. Код содержит ID ученика (например, <span style={{ fontFamily: "var(--font-mono)", color: C.text }}>{STUDENT_QR_PREFIX}</span><span style={{ fontFamily: "var(--font-mono)", color: C.text }}>1234567890123</span>).
        </div>
        <div id={STUDENT_PAGE_QR_READER_EL} style={{ borderRadius: 12, overflow: "hidden", minHeight: 260, background: "#000" }} />
        <Btn onClick={onClose} style={{ width: "100%", marginTop: 16 }}>Закрыть</Btn>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<"ok" | "no_table" | "error" | "logged_out">("logged_out");
  const [syncing, setSyncing] = useState(false);

  // Default seed while loading user profile
  const [data, setData] = useState<DB>(() => seed());
  const [page, setPage] = useState("dashboard");
  const [qrOpen, setQrOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ t: string; m: string } | null>(null);
  const [scanId, setScanId] = useState("");
  /** Боковая панель развёрнута (true) или свернута в узкую полосу (false) */
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Auth modal states
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState("");

  const triggerAuthModal = (reason: string) => {
    setAuthModalReason(reason);
    setAuthModalOpen(true);
  };

  // Auth screen states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [trialExtended, setTrialExtended] = useState(() => {
    return localStorage.getItem("fitcrm_trial_extended") === "true";
  });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Masked Russian phone format helper
  const handlePhoneChange = (val: string) => {
    let clean = val.replace(/\D/g, "");
    if (clean.substring(0, 1) === "7" || clean.substring(0, 1) === "8") {
      clean = clean.substring(1);
    }
    clean = clean.substring(0, 10);
    
    let res = "";
    if (clean.length > 0) {
      res = "+7 (" + clean.substring(0, 3);
    }
    if (clean.length >= 3) {
      res += ") " + clean.substring(3, 6);
    }
    if (clean.length >= 6) {
      res += "-" + clean.substring(6, 8);
    }
    if (clean.length >= 8) {
      res += "-" + clean.substring(8, 10);
    }
    setPhone(res || val);
  };

  // Trial Days Calculator (5 days limit)
  const getTrialDaysLeft = () => {
    if (!user) return 5;
    const createdAtStr = user.created_at || user.user_metadata?.created_at;
    if (!createdAtStr) return 5;
    const createdDate = new Date(createdAtStr);
    const now = new Date();
    const diffTime = now.getTime() - createdDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    const remaining = 5 - diffDays;
    return Math.max(0, Math.ceil(remaining));
  };

  const firstDir = useMemo(() => data.directions?.[0] || "Другое", [data.directions]);

  const [showStudentForm, setShowStudentForm] = useState(false);
  const [sf, setSf] = useState({name:"",phone:"",classType:"group",abon:"count",count:"10",until:todayStr(),sum:"",payment:"paid",direction:firstDir});

  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [tf, setTf] = useState({name:"",phone:"",direction:firstDir,rate:""});

  const [showSchedForm, setShowSchedForm] = useState(false);
  const [schf, setSchf] = useState({day:"0",time:"10:00",subject:firstDir,teacherId:"",classType:"group"});

  // Listen to Auth State Changes
  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        setUser(session?.user ?? null);
        setAuthLoading(false);
        if (session?.user) {
          fetchStudioData(session.user.id);
          setAuthModalOpen(false);
        }
      })
      .catch((err) => {
        console.error("[FitCRM] getSession:", err);
        if (!cancelled) setAuthLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        fetchStudioData(currentUser.id);
        setAuthModalOpen(false);
      } else {
        setDbStatus("logged_out");
        setData(seed());
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const getTargetUserId = (currentUser: any) => {
    if (!currentUser) return null;
    if (currentUser.user_metadata?.role === "staff" && currentUser.user_metadata?.owner_id) {
      return currentUser.user_metadata.owner_id;
    }
    return currentUser.id;
  };

  const fetchStudioData = async (userId: string) => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user;
      const targetId = getTargetUserId(currentUser) || userId;

      const { data: row, error } = await supabase
        .from("crm_studios")
        .select("*")
        .eq("user_id", targetId)
        .maybeSingle();

      if (error) {
        console.warn("Supabase crm_studios table missing, using isolated localStorage:", error);
        setDbStatus("no_table");
        setData(loadData(targetId));
      } else if (row) {
        setDbStatus("ok");
        const rawStudents = Array.isArray(row.students) ? row.students : [];
        const metadataItem = rawStudents.find((s: any) => s.id === -8888);
        const actualStudents = rawStudents.filter((s: any) => s.id !== -8888);

        let directions = Array.isArray(row.directions) ? row.directions : getDefaultDirections(row.studio_type || "sport");
        const { data: extraDirs, error: dirFetchErr } = await supabase
          .from("crm_directions")
          .select("name")
          .eq("user_id", targetId);
        if (!dirFetchErr && Array.isArray(extraDirs)) {
          const names = extraDirs.map((r: { name: string }) => r.name).filter(Boolean);
          directions = [...new Set([...directions, ...names])];
        }

        setData({
          students: actualStudents,
          teachers: Array.isArray(row.teachers) ? row.teachers : [],
          schedule: Array.isArray(row.schedule) ? row.schedule : [],
          studioType: row.studio_type || "sport",
          studioName: row.studio_name || "Моя Студия",
          directions,
          team: metadataItem?.team || [],
          expenses: metadataItem?.expenses || []
        });
      } else {
        const defaultData = loadData(targetId);
        const systemItem = {
          id: -8888,
          name: "__SYSTEM_METADATA__",
          phone: "",
          classType: "",
          abon: "",
          count: 0,
          until: "",
          sum: 0,
          payment: "",
          visits: 0,
          direction: "",
          team: defaultData.team || [],
          expenses: defaultData.expenses || []
        };
        const studentsToSave = [...defaultData.students, systemItem as any];

        const { error: insertError } = await supabase
          .from("crm_studios")
          .insert({
            user_id: targetId,
            studio_name: defaultData.studioName || "Моя Студия",
            studio_type: defaultData.studioType || "sport",
            directions: defaultData.directions,
            students: studentsToSave,
            teachers: defaultData.teachers,
            schedule: defaultData.schedule
          });
        if (insertError) {
          console.error("Upsert seed error:", insertError);
          setDbStatus("no_table");
          setData(defaultData);
        } else {
          setDbStatus("ok");
          setData(defaultData);
        }
      }
    } catch (err) {
      console.error("Fetch DB generic Error:", err);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const targetId = getTargetUserId(session?.user) || userId;
        setDbStatus("error");
        setData(loadData(targetId));
      } catch {
        setDbStatus("error");
        setData(loadData(userId));
      }
    } finally {
      setSyncing(false);
    }
  };

  const saveToSupabase = async (updatedDb: DB, currentUser: any) => {
    if (!currentUser) return;
    const targetUserId = getTargetUserId(currentUser);

    const actualStudents = (updatedDb.students || []).filter(s => s.id !== -8888);
    const systemItem = {
      id: -8888,
      name: "__SYSTEM_METADATA__",
      phone: "",
      classType: "",
      abon: "",
      count: 0,
      until: "",
      sum: 0,
      payment: "",
      visits: 0,
      direction: "",
      team: updatedDb.team || [],
      expenses: updatedDb.expenses || []
    };
    const studentsToSave = [...actualStudents, systemItem as any];

    setData(updatedDb);
    localStorage.setItem(`${SK}_${targetUserId}`, JSON.stringify(updatedDb));
    
    setSyncing(true);
    try {
      const { error } = await supabase
        .from("crm_studios")
        .upsert({
          user_id: targetUserId,
          studio_name: updatedDb.studioName || "Моя Студия",
          studio_type: updatedDb.studioType || "sport",
          directions: updatedDb.directions,
          students: studentsToSave,
          teachers: updatedDb.teachers,
          schedule: updatedDb.schedule,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error("Supabase Sync Error:", error);
        setDbStatus("no_table");
      } else {
        setDbStatus("ok");
      }
    } catch (err) {
      console.error("Save generic error:", err);
      setDbStatus("error");
    } finally {
      setSyncing(false);
    }
  };

  const save = (d: DB) => {
    if (user) {
      saveToSupabase(d, user);
    } else {
      setData(d);
      localStorage.setItem(SK, JSON.stringify(d));
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setAuthError("Укажите адрес электронной почты и ваш пароль");
      return;
    }
    if (password.length < 6) {
      setAuthError("Пароль должен состоять минимум из 6 символов");
      return;
    }
    if (authMode === "register") {
      if (!phone.trim()) {
        setAuthError("Пожалуйста, укажите номер телефона");
        return;
      }
      if (!consent) {
        setAuthError("Необходимо дать согласие на обработку персональных данных");
        return;
      }
    }
    setFormLoading(true);
    setAuthError("");
    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (error) throw error;
      } else {
        const emailRedirectTo = getEmailRedirectLoginUrl();

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            emailRedirectTo,
            data: {
              phone_number: phone,
              created_at: new Date().toISOString(),
            }
          }
        });
        if (error) throw error;
        alert("Регистрация успешна! Если на вашем аккаунте Supabase включено подтверждение почты, перейдите по ссылке из присланного письма. Теперь вы можете войти в систему.");
        setAuthMode("login");
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Ошибка входа в систему");
    } finally {
      setFormLoading(false);
    }
  };

  const logout = async () => {
    if (confirm("Вы действительно хотите выйти из системы?")) {
      await supabase.auth.signOut();
    }
  };

  useEffect(() => {
    if (data.directions?.length > 0) {
      const currentFirst = data.directions[0];
      setSf(prev => ({...prev, direction: data.directions.includes(prev.direction) ? prev.direction : currentFirst}));
      setTf(prev => ({...prev, direction: data.directions.includes(prev.direction) ? prev.direction : currentFirst}));
      setSchf(prev => ({...prev, subject: data.directions.includes(prev.subject) ? prev.subject : currentFirst}));
    }
  }, [data.directions]);

  useEffect(()=>{ if(data.students?.length>0&&!scanId) setScanId(String(data.students[0].id)); },[data.students, scanId]);

  const insertCrmVisitRow = async (ownerUid: string, studentId: number, visitedAtIso: string) => {
    const { error } = await supabase.from("crm_visits").insert({
      user_id: ownerUid,
      student_id: studentId,
      visited_at: visitedAtIso
    });
    if (error) console.warn("crm_visits insert:", error.message);
  };

  const fetchVisitsForStudent = useCallback(async (studentId: number): Promise<CrmVisitRow[]> => {
    const uid = user ? getTargetUserId(user) : null;
    if (!uid) return [];
    const { data, error } = await supabase
      .from("crm_visits")
      .select("id, student_id, visited_at, created_at")
      .eq("user_id", uid)
      .eq("student_id", studentId)
      .order("visited_at", { ascending: false });
    if (error) {
      console.warn("crm_visits fetch:", error.message);
      return [];
    }
    return (data as CrmVisitRow[]) || [];
  }, [user]);

  type VisitProcessResult = { ok: true; message: string; tone: "ok" | "warn" } | { ok: false; message: string; tone: "err" };

  const processStudentVisit = (studentId: number, visitedAt: Date = new Date()): VisitProcessResult => {
    if (!user) {
      triggerAuthModal("Чтобы сохранять посещения и историю визитов в облаке, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return { ok: false, message: "Требуется вход в аккаунт", tone: "err" };
    }
    const c = data.students.find(x => x.id === studentId);
    if (!c) return { ok: false, message: "Ученик не найден", tone: "err" };
    if (isExpired(c)) return { ok: false, message: `Абонемент «${c.name}» истёк`, tone: "err" };

    const students = data.students.map(x =>
      x.id !== studentId
        ? x
        : {
            ...x,
            count: x.abon === "count" ? Math.max(0, x.count - 1) : x.count,
            visits: (x.visits || 0) + 1
          }
    );
    save({ ...data, students });

    const ownerUid = getTargetUserId(user);
    if (ownerUid) void insertCrmVisitRow(ownerUid, studentId, visitedAt.toISOString());

    const leftNum = c.abon === "count" ? Math.max(0, c.count - 1) : null;
    if (c.abon === "count" && (c.count || 0) - 1 <= 0) {
      return { ok: true, message: `Визит записан. У ${c.name} закончились занятия по абонементу.`, tone: "warn" };
    }
    if (c.abon === "count" && (c.count || 0) - 1 < 3) {
      return { ok: true, message: `Визит записан. У ${c.name} осталось ${leftNum} зан.`, tone: "warn" };
    }
    return {
      ok: true,
      message: `Визит записан · ${c.name} · осталось: ${c.abon === "unlim" ? "∞" : `${leftNum} зан.`}`,
      tone: "ok"
    };
  };

  const deleteStudent = (id: number) => {
    if (!user) {
      triggerAuthModal("Чтобы вносить изменения в списки и настраивать свою личную облачную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    if(!confirm("Удалить ученика?")) return;
    save({...data,students:data.students.filter(c=>c.id!==id)});
  };
  const deleteTeacher = (id: number) => {
    if (!user) {
      triggerAuthModal("Чтобы вносить изменения в списки и настраивать свою личную облачную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    if(!confirm("Удалить преподавателя?")) return;
    save({...data,teachers:data.teachers.filter(t=>t.id!==id)});
  };
  const deleteSched = (id: number) => {
    if (!user) {
      triggerAuthModal("Чтобы вносить изменения в расписание и настраивать свою личную облачную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    if(!confirm("Удалить занятие?")) return;
    save({...data,schedule:data.schedule.filter(s=>s.id!==id)});
  };

  const addStudent = () => {
    if (!user) {
      triggerAuthModal("Чтобы сохранить изменения и создать свою личную облачную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    if(!sf.name.trim()){alert("Введите имя");return;}
    const actualDir = data.directions.includes(sf.direction) ? sf.direction : firstDir;
    const s = {id:Date.now(),name:sf.name.trim(),phone:sf.phone.trim(),classType:sf.classType,abon:sf.abon,count:sf.abon==="count"?(parseInt(sf.count)||0):999,until:sf.until,sum:parseFloat(sf.sum)||0,payment:sf.payment,visits:0,direction:actualDir};
    save({...data,students:[...data.students,s]});
    setSf({name:"",phone:"",classType:"group",abon:"count",count:"10",until:todayStr(),sum:"",payment:"paid",direction:firstDir});
    setShowStudentForm(false);
  };

  const addTeacher = () => {
    if (!user) {
      triggerAuthModal("Чтобы сохранить изменения и создать свою личную облачную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    if(!tf.name.trim()){alert("Введите ФИО");return;}
    const actualDir = data.directions.includes(tf.direction) ? tf.direction : firstDir;
    const t = {id:Date.now(),name:tf.name.trim(),phone:tf.phone.trim(),direction:actualDir,rate:parseFloat(tf.rate)||0};
    save({...data,teachers:[...data.teachers,t]});
    setTf({name:"",phone:"",direction:firstDir,rate:""});
    setShowTeacherForm(false);
  };

  const addSched = () => {
    if (!user) {
      triggerAuthModal("Чтобы сохранить изменения и создать свою личную облачную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    const actualSubj = data.directions.includes(schf.subject) ? schf.subject : firstDir;
    const s = {id:Date.now(),day:parseInt(schf.day),time:schf.time,subject:actualSubj,teacherId:schf.teacherId?parseInt(schf.teacherId):null,classType:schf.classType};
    save({...data,schedule:[...data.schedule,s]});
    setSchf({day:"0",time:"10:00",subject:firstDir,teacherId:"",classType:"group"});
    setShowSchedForm(false);
  };

  const simulateScan = () => {
    const id = parseInt(scanId, 10);
    if (!scanId.trim() || !Number.isFinite(id)) {
      setScanMsg({ t: "err", m: "Выберите ученика в списке" });
      return;
    }
    const r = processStudentVisit(id, new Date());
    if (r.ok) setScanMsg({ t: r.tone === "warn" ? "warn" : "ok", m: r.message });
    else setScanMsg({ t: "err", m: r.message });
  };

  const userRole = user?.user_metadata?.role || "owner";
  const isOwner = userRole === "owner";
  const isStaff = userRole === "staff";

  // Redirect staff away from restricted tabs
  useEffect(() => {
    if (isStaff && page !== "students" && page !== "schedule") {
      setPage("students");
    }
  }, [isStaff, page]);

  const stats = useMemo(()=>({
    total: data.students ? data.students.length : 0,
    active: data.students ? data.students.filter(c=>!isExpired(c)).length : 0,
    debt: data.students ? data.students.filter(c=>c.payment==="debt").length : 0,
    teachers: data.teachers ? data.teachers.length : 0,
    revenue: data.students ? data.students.reduce((s,c)=>s+(c.sum||0),0) : 0,
    almost: data.students ? data.students.filter(c=>!isExpired(c)&&isAlmost(c)).length : 0,
  }),[data]);

  const navItems = [
    {id:"dashboard",icon:<Home size={18}/>,label:"Главная"},
    {id:"students",icon:<Users size={18}/>,label:"Ученики"},
    {id:"teachers",icon:<GraduationCap size={18}/>,label:"Преподаватели"},
    {id:"schedule",icon:<CalendarDays size={18}/>,label:"Расписание"},
    {id:"finances",icon:<TrendingUp size={18}/>,label:"Финансы"},
    {id:"analytics",icon:<BarChart2 size={18}/>,label:"Аналитика"},
    {id:"team",icon:<Users size={18}/>,label:"Команда"},
    {id:"settings",icon:<Settings size={18}/>,label:"⚙️ Настройки студии"}
  ].filter(n => {
    if (isStaff) {
      return n.id === "students" || n.id === "schedule";
    }
    // For local demo, hide Finances/Team since they are premium cloud features
    if (!user) {
      if (n.id === "team" || n.id === "finances") return false;
    }
    return true;
  });

  const trialDaysLeft = getTrialDaysLeft();
  const isTrialExpired = !isStaff && !!user && trialDaysLeft <= 0 && !trialExtended;

  if (authLoading) {
    return (
      <div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"#f5f5f7",flexDirection:"column",gap:16}}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "3px solid #e8e8ed",
          borderTopColor: "#0071e3",
          animation: "spin 1s linear infinite"
        }} />
        <div style={{fontSize:13,color:"#86868b",fontWeight:500,fontFamily:"inherit"}}>Синхронизация с облаком Supabase...</div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const C = {
    bg: "#1c1c1e",        // Elegant Apple Dark Gray (Space Gray) background
    side: "#18181a",      // Crisp Deeper Dark for Sidebar
    main: "#1c1c1e",     
    card: "#2c2c2e",      // Sleek Charcoal for Container Cards
    border: "#3a3a3c",    // Apple System Gray 4 for Dark Dividers
    text: "#f5f5f7",      // Crisp Off-White Text
    muted: "#8e8e93",     // System Gray (iOS Secondary Text)
    accent: "#0a84ff",    // Radiating iOS Mode Blue
    activeSide: "#2a2a2d" // Active selection background
  };

  const getEmojiIcon = (type: string) => {
    if (type === "sport") return "🏋️";
    if (type === "language") return "🏫";
    if (type === "kids") return "👶";
    return "✨";
  };

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",background:C.bg,color:C.text,fontSize:14, fontFamily: "inherit"}}>
      
      {/* SIDEBAR */}
      <div style={{
        width: isSidebarOpen ? 240 : 64,
        minWidth: isSidebarOpen ? 240 : 64,
        background: C.side,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        transition: "width 0.22s ease, min-width 0.22s ease",
        overflow: "hidden"
      }}>
        <div style={{
          padding: isSidebarOpen ? "14px 12px" : "10px 6px",
          display: "flex",
          flexDirection: isSidebarOpen ? "row" : "column",
          alignItems: "center",
          gap: isSidebarOpen ? 8 : 6,
          borderBottom: `1px solid ${C.border}`,
          minHeight: 56,
          background: C.side,
          flexShrink: 0
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, border: `1px solid ${C.border}`, flexShrink: 0
          }}>
            {getEmojiIcon(data.studioType)}
          </div>
          {isSidebarOpen && (
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.text,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
              fontFamily: "inherit",
              flex: 1,
              minWidth: 0
            }} title={data.studioName || getStudioTitle(data.studioType)}>
              {data.studioName || getStudioTitle(data.studioType)}
            </span>
          )}
          <button
            type="button"
            aria-expanded={isSidebarOpen}
            aria-label={isSidebarOpen ? "Свернуть меню" : "Развернуть меню"}
            onClick={() => setIsSidebarOpen(v => !v)}
            style={{
              marginLeft: isSidebarOpen ? "auto" : 0,
              background: "none",
              border: "none",
              color: C.muted,
              cursor: "pointer",
              padding: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              flexShrink: 0,
              transition: "color 0.15s ease, background 0.15s ease"
            }}
            className="hover:bg-white/10 hover:text-white"
          >
            {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
        <nav style={{flex:1,padding:"12px 8px", display:"flex", flexDirection:"column", gap: 3}}>
          {navItems.map(n=>(
            <button 
              key={n.id} 
              onClick={()=>setPage(n.id)} 
              style={{
                width:"100%",
                display:"flex",
                alignItems:"center",
                gap:12,
                padding:"10px 14px",
                background: page===n.id ? C.activeSide : "transparent",
                border:"none",
                color: page===n.id ? C.accent : "#aeaeb2",
                cursor:"pointer",
                fontSize:13,
                fontFamily:"inherit",
                borderRadius: 8, 
                textAlign:"left",
                whiteSpace:"nowrap",
                transition:"all 0.15s ease", 
                fontWeight: page===n.id ? 600 : 500
              }}
              className={page===n.id ? "" : "hover:bg-white/10 hover:text-white"}
            >
              <span style={{color: page===n.id ? C.accent : "#8e8e93", display: "flex", alignItems: "center"}}>{n.icon}</span>{isSidebarOpen&&<span>{n.label}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: "10px 8px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
          <Link
            to="/login"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.accent,
              textDecoration: "none",
              padding: "8px 10px",
              borderRadius: 8,
              background: "transparent",
            }}
          >
            {isSidebarOpen ? "Клиент: вход / регистрация" : "⇄"}
          </Link>
          <Link
            to="/dashboard"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#aeaeb2",
              textDecoration: "none",
              padding: "8px 10px",
              borderRadius: 8,
            }}
          >
            {isSidebarOpen ? "Личный кабинет" : "◉"}
          </Link>
        </div>
        <div style={{padding:"12px 10px", borderTop:`1px solid ${C.border}`, display:"flex", flexDirection:"column", gap:8, background: C.side}}>
          {/* Supabase status display in Sidebar */}
          {isSidebarOpen && (
            <div style={{
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}>
              <div style={{display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: C.text}}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%", 
                  background: !user ? "#0a84ff" : dbStatus === "ok" ? "#30d158" : dbStatus === "no_table" ? "#ffd60a" : "#ff453a"
                }} />
                <span style={{fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px"}}>
                  {!user ? "Режим: Демо (Локально)" : dbStatus === "ok" ? "База: Активна" : dbStatus === "no_table" ? "База: Нужна настройка" : "База: Ошибка"}
                </span>
                {syncing && (
                  <span style={{width: 8, height: 8, border: "1.5px solid #0a84ff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.5s linear infinite", marginLeft: "auto"}} />
                )}
              </div>
              <div style={{fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}} title={user?.email || "Просмотр без авторизации"}>
                {user?.email || "Просмотр без авторизации"}
              </div>
            </div>
          )}

          {/* Tariff status display in Sidebar */}
          {user && isSidebarOpen && (
            <div style={{
              background: "linear-gradient(135deg, rgba(0, 113, 227, 0.04) 0%, rgba(175, 82, 222, 0.04) 100%)",
              border: "1px solid rgba(0, 113, 227, 0.12)",
              borderRadius: 8,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}>
              {isStaff ? (
                <>
                  <div style={{display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#8b5cf6"}}>
                    <UserCheck size={13} style={{color: "#8b5cf6"}} />
                    <span style={{textTransform: "uppercase", letterSpacing: "0.5px", fontSize: 10}}>Доступ: Сотрудник</span>
                  </div>
                  <div style={{fontSize: 12, fontWeight: 500, color: C.text}}>
                     Преподаватель студии
                  </div>
                </>
              ) : (
                <>
                  <div style={{display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#0071e3"}}>
                    <Zap size={13} style={{color: "#0071e3"}} />
                    <span style={{textTransform: "uppercase", letterSpacing: "0.5px", fontSize: 10}}>Тариф: Пробный</span>
                  </div>
                  <div style={{fontSize: 12, fontWeight: 600, color: C.text, display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                    <span>Осталось:</span>
                    <span style={{color: getTrialDaysLeft() <= 1 ? "#ff453a" : C.text}}>{getTrialDaysLeft()} дней</span>
                  </div>
                  <div style={{width: "100%", background: C.bg, height: 4, borderRadius: 2, overflow: "hidden", marginTop: 2}}>
                    <div style={{width: `${Math.min(100, (getTrialDaysLeft() / 5) * 100)}%`, background: getTrialDaysLeft() <= 1 ? "#ff453a" : "#0071e3", height: "100%", borderRadius: 2}} />
                  </div>
                </>
              )}
            </div>
          )}

          {!user ? (
            <button 
              onClick={() => triggerAuthModal("Чтобы сохранить изменения и создать свою личную облачную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт")}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: isSidebarOpen ? 12 : 0,
                justifyContent: isSidebarOpen ? "flex-start" : "center",
                padding: "10px 14px",
                background: "#0071e3",
                border: "none",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
                borderRadius: 8, 
                transition: "all 0.15s ease", 
                fontWeight: 600,
                boxShadow: "0 2px 8px rgba(0,113,227,0.15)"
              }}
              className="hover:opacity-95 active:scale-98"
              title="Войти в личный кабинет"
            >
              <UserCheck size={16} />
              {isSidebarOpen && <span>Войти в личный кабинет</span>}
            </button>
          ) : (
            <button 
              onClick={logout}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: isSidebarOpen ? 12 : 0,
                justifyContent: isSidebarOpen ? "flex-start" : "center",
                padding: "8px 14px",
                background: "transparent",
                border: "none",
                color: "#ff453a",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
                borderRadius: 8, 
                transition: "all 0.15s ease", 
                fontWeight: 600
              }}
              className="hover:bg-red-950/20 hover:text-red-500"
              title="Выйти из системы"
            >
              <LogOut size={16} />
              {isSidebarOpen && <span>Выйти из кабинета</span>}
            </button>
          )}
        </div>
        {isSidebarOpen && <div style={{padding:"8px 14px",borderTop:`1px solid ${C.border}`,fontSize:10,color:C.muted, textAlign: "center", background: C.card} } className="font-semibold tracking-wider uppercase text-[9px]">✨ CRM СТУДИЯ v3.0 · SaaS</div>}
      </div>

      {/* MAIN */}
      <div style={{flex:1,overflow:"auto",padding:"30px", background: C.bg}}>
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.12 }}
          >
            {/* DASHBOARD */}
            {page==="dashboard"&&(
              <div>
                <div style={{display: "flex", gap: 12, alignItems: "center", marginBottom: 20}}>
                   <div style={{fontSize: 24, fontStyle: "normal", flex: 1}}>
                    <h1 style={{fontSize:22,fontWeight:700,color:C.text, display:"inline-flex", gap:6, alignItems:"center"}}>
                      <span className="text-xl">{getEmojiIcon(data.studioType)}</span> {data.studioName || getStudioTitle(data.studioType)} · Панель управления
                    </h1>
                  </div>
                </div>
                
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:20}}>
                  <StatCard icon={<Users size={16}/>} label="Всего учеников" value={stats.total} color="#0071e3"/>
                  <StatCard icon={<CheckSquare size={16}/>} label="Активных" value={stats.active} color="#34c759"/>
                  <StatCard icon={<AlertTriangle size={16}/>} label="Должников" value={stats.debt} color="#ff9500"/>
                  <StatCard icon={<GraduationCap size={16}/>} label="Преподавателей" value={stats.teachers} color="#af52de"/>
                  <StatCard icon={<TrendingUp size={16}/>} label="Выручка" value={fmtMoney(stats.revenue)} color="#ff2d55"/>
                </div>

                {stats.almost>0&& (
                  <motion.div initial={{scale:0.98, opacity:0}} animate={{scale:1, opacity:1}} style={{background:"rgba(255, 153, 10, 0.15)",border:"1px solid rgba(255, 153, 10, 0.3)",borderRadius:10,padding:"12px 16px",marginBottom:16,color:"#ff9500",fontSize:13,display:"flex",alignItems:"center",gap:10, fontWeight: 500, boxShadow: "0 1px 2px rgba(0,0,0,0.15)"}}><AlertTriangle size={16} style={{color: "#ff9500"}}/><span>Внимание: у <strong>{stats.almost}</strong> учеников абонементы на исходе или скоро истекут!</span></motion.div>
                )}

                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20,marginBottom:16, boxShadow: "0 1px 3px rgba(0,0,0,0.01)"}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.5px"}}>⚡ Быстрые действия</div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <Btn onClick={()=>setQrOpen(true)} color="blue"><QrCode size={15}/> Открыть сканер визитов</Btn>
                    <Btn onClick={()=>setPage("students")} color="green"><Plus size={15}/> Добавить ученика</Btn>
                    <Btn onClick={()=>setPage("schedule")}><CalendarDays size={15}/> Расписание занятий</Btn>
                    <Btn onClick={()=>setPage("settings")} color="yellow"><Settings size={15}/> Настройки CRM</Btn>
                  </div>
                </div>

                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20, boxShadow: "0 1px 3px rgba(0,0,0,0.01)"}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.5px"}}>📋 Свежие ученики</div>
                  {data.students.length === 0 ? (
                    <div style={{textAlign: "center", padding: "24px 0", color: C.muted}}>Нет учеников в системе. Нажмите «Добавить ученика» выше!</div>
                  ) : (
                    <div style={{display: "flex", flexDirection: "column", gap: 3}}>
                      {data.students.slice(-5).reverse().map(c=>(
                        <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderBottom:`1px solid #f1f5f9`}}>
                          <div style={{width:34,height:34,borderRadius:"50%",background:`${getColor(c.direction)}12`,border:`1px solid ${getColor(c.direction)}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:getColor(c.direction),fontWeight:700,flexShrink:0}}>{c.name[0]}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13,color:C.text, overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                            <div style={{fontSize:11,color:C.muted, fontWeight:500}}>{c.direction} · {c.abon === "unlim" ? "Безлимитный абонемент" : `Осталось: ${c.count} зан.`}</div>
                          </div>
                          <Badge type={isExpired(c)?"expired":isAlmost(c)?"almost":c.payment==="debt"?"debt":"active"}/>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STUDENTS */}
            {page==="students"&&(
              <StudentPage
                data={data}
                processStudentVisit={processStudentVisit}
                fetchVisitsForStudent={fetchVisitsForStudent}
                deleteStudent={deleteStudent}
                showForm={showStudentForm}
                setShowForm={setShowStudentForm}
                sf={sf}
                setSf={setSf}
                addStudent={addStudent}
                C={C}
                getColor={getColor}
                firstDir={firstDir}
                user={user}
              />
            )}

            {/* TEACHERS */}
            {page==="teachers"&&(
              <TeacherPage data={data} save={save} deleteTeacher={deleteTeacher}
                showForm={showTeacherForm} setShowForm={setShowTeacherForm}
                tf={tf} setTf={setTf} addTeacher={addTeacher} C={C} getColor={getColor} firstDir={firstDir}/>
            )}

            {/* SCHEDULE */}
            {page==="schedule"&&(
              <SchedulePage data={data} save={save} deleteSched={deleteSched}
                showForm={showSchedForm} setShowForm={setShowSchedForm}
                schf={schf} setSchf={setSchf} addSched={addSched} C={C} getColor={getColor} firstDir={firstDir}/>
            )}

            {/* FINANCES */}
            {page==="finances"&&<FinancesPage data={data} save={save} C={C} />}

            {/* ANALYTICS */}
            {page==="analytics"&&<AnalyticsPage data={data} stats={stats} C={C} getColor={getColor}/>}

            {/* TEAM */}
            {page==="team"&&<TeamPage data={data} save={save} C={C} user={user} getTrialDaysLeft={getTrialDaysLeft} triggerAuthModal={triggerAuthModal}/>}

            {/* SETTINGS */}
            {page==="settings"&&<SettingsPage data={data} save={save} C={C} getColor={getColor} dbStatus={dbStatus} syncing={syncing} user={user} triggerAuthModal={triggerAuthModal} ownerIdForDirections={user ? getTargetUserId(user) : null}/>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* QR MODAL */}
      {qrOpen&&(
        <Modal onClose={()=>{setQrOpen(false);setScanMsg(null);}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:750,color:C.text,marginBottom:4}}>📱 QR-код отметки визитов</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:16}}>Разместите на ресепшн для быстрой отметки визитов</div>
            <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><LiveStudentQr studentId={scanId} size={180}/></div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16,lineHeight:1.4}}>На коде закодирован ID выбранного ученика (строка <span style={{fontFamily:"var(--font-mono)",color:C.text}}>{STUDENT_QR_PREFIX}…</span>) — тем же содержимым пользуется камера на странице «Ученики».</div>
            <div style={{fontSize:12,fontWeight:700,color:C.accent,background:`${C.accent}12`, display:"inline-block", padding: "4px 12px", borderRadius: 8, marginBottom:18}}>{data.studioName || getStudioTitle(data.studioType)}</div>
            
            <div style={{borderTop:`1px solid #e2e8f0`,paddingTop:16,textAlign:"left"}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:8}}>Симулятор сканирования смартфона</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <select style={{background:"#ffffff",border:`1.5px solid #cbd5e1`,borderRadius:10,color:C.text,padding:"8px 12px",fontSize:13,outline:"none", width:"100%"}} value={scanId} onChange={e=>setScanId(e.target.value)}>
                  {data.students.length===0 ? <option value="">Ученики отсутствуют</option> : data.students.map(c=><option key={c.id} value={String(c.id)}>{c.name} ({c.direction})</option>)}
                </select>
                <Btn onClick={simulateScan} color="blue"><QrCode size={15}/> Считать QR-код</Btn>
                {scanMsg&& (
                  <motion.div initial={{opacity:0, y: 5}} animate={{opacity:1, y: 0}} style={{padding:"10px 12px",borderRadius:10,fontSize:13,fontWeight:500,background:scanMsg.t==="ok"?"#f0fdf4":scanMsg.t==="warn"?"#fffbeb":"#fef2f2",color:scanMsg.t==="ok"?"#16a34a":scanMsg.t==="warn"?"#b45309":"#dc2626",border:`1px solid ${scanMsg.t==="ok"?"#bbf7d0":scanMsg.t==="warn"?"#fde68a":"#fecaca"}`}}>{scanMsg.m}</motion.div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* AUTH MODAL */}
      {authModalOpen&&(
        <Modal onClose={()=>{setAuthModalOpen(false); setAuthError("");}}>
          <div style={{textAlign:"center", marginBottom: 20}}>
            <div style={{width:54,height:54,borderRadius:12,background:"linear-gradient(135deg, #0071e3 0%, #af52de 100%)",margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",color:"#ffffff",boxShadow:"0 4px 12px rgba(0,113,227,0.2)"}}>
              <Cloud size={28} />
            </div>
            <h1 style={{fontSize:20,fontWeight:800,color:"#1d1d1f",letterSpacing:"-0.5px",marginBottom:4,fontFamily:"inherit"}}>CRM Конструктор Студий</h1>
            <p style={{fontSize:12,color:"#86868b",fontWeight:500,fontFamily:"inherit"}}>Облачный SaaS-кабинет для ваших сотрудников</p>
          </div>

          {authModalReason && (
            <div style={{fontSize:12,color:"#0071e3",background:"rgba(0,113,227,0.06)",border:"1.5px solid rgba(0,113,227,0.12)",padding:"10px 14px",borderRadius:10,lineHeight:1.44,fontWeight:500,marginBottom:16,textAlign:"center"}}>
              🔒 {authModalReason}
            </div>
          )}

          <form onSubmit={handleAuth} style={{display:"flex",flexDirection:"column",gap:14}}>
            <Input 
              label="Электронная почта (Email)" 
              value={email} 
              onChange={setEmail} 
              type="email" 
              placeholder="example@yourstudio.ru" 
            />
            
            <Input 
              label="Пароль" 
              value={password} 
              onChange={setPassword} 
              type="password" 
              placeholder="Минимум 6 символов" 
            />

            {authMode === "register" && (
              <Input 
                label="Номер телефона" 
                value={phone} 
                onChange={handlePhoneChange} 
                type="text" 
                placeholder="+7 (999) 999-99-99" 
              />
            )}

            {authMode === "register" && (
              <label style={{display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer", userSelect:"none", margin: "4px 0"}}>
                <input 
                  type="checkbox" 
                  checked={consent} 
                  onChange={(e) => setConsent(e.target.checked)}
                  style={{cursor:"pointer", width: 16, height: 16, border: "1px solid #cbd5e1", borderRadius: 4, accentColor: "#0071e3", marginTop: 2}}
                />
                <span style={{fontSize:11, color: C.muted, lineHeight: 1.35}}>
                  Я согласен на <a href="#" onClick={(e) => { e.preventDefault(); alert("Согласие на обработку персональных данных: данные собираются исключительно для функционирования CRM-системы и облачной синхронизации в соответствии с ФЗ №152."); }} style={{color:"#0071e3", textDecoration:"underline"}}>обработку персональных данных</a>
                </span>
              </label>
            )}

            {authError && (
              <div style={{fontSize:12,color:"#ff3b30",background:"#fff2f1",border:"1px solid #ffccd0",padding:"10px 12px",borderRadius:8,lineHeight:1.4,fontWeight:500}}>
                ⚠️ {authError}
              </div>
            )}

            <button 
              type="submit" 
              disabled={formLoading || (authMode === "register" && (!consent || !phone.trim() || phone.length < 18))}
              style={{
                background: (authMode === "register" && (!consent || !phone.trim() || phone.length < 18)) ? "#a5d1ff" : "#0071e3",
                color:"#ffffff",
                border:"none",
                borderRadius:8,
                padding:"12px",
                fontSize:13,
                fontWeight:600,
                cursor: (formLoading || (authMode === "register" && (!consent || !phone.trim() || phone.length < 18))) ? "not-allowed" : "pointer",
                boxShadow:"0 2px 8px rgba(0,113,227,0.15)",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                gap:6,
                marginTop:6,
                fontFamily:"inherit"
              }}
              className="hover:opacity-95 active:scale-98"
            >
              {formLoading ? (
                <span style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.6s linear infinite"}} />
              ) : (
                <Lock size={15} />
              )}
              {authMode === "login" ? "Войти в систему" : "Зарегистрировать аккаунт"}
            </button>
          </form>

          <div style={{textAlign:"center",marginTop:24,borderTop:"1px solid #e8e8ed",paddingTop:20}}>
            <button 
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setAuthError("");
              }}
              style={{background:"none",border:"none",color:"#0071e3",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}
              className="hover:underline"
            >
              {authMode === "login" ? "Создать новый аккаунт (Регистрация)" : "Уже есть аккаунт? Войти"}
            </button>
          </div>

          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:20,fontSize:10,color:"#86868b",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>
            <Server size={11} style={{color:"#34c759"}}/>
            <span>Supabase Cloud Integration Active</span>
          </div>
        </Modal>
      )}

      {/* EXPIRED BLOCKER OVERLAY */}
      {isTrialExpired && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(255, 255, 255, 0.4)",
          backdropFilter: "blur(25px)",
          WebkitBackdropFilter: "blur(25px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 99999,
          padding: 24,
          fontFamily: "inherit"
        }}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }} 
            animate={{ opacity: 1, scale: 1, y: 0 }}
            style={{
              background: "#ffffff",
              border: "1px solid rgba(0, 0, 0, 0.08)",
              borderRadius: 24,
              padding: "40px 32px",
              maxWidth: 480,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 24px 70px rgba(0, 0, 0, 0.08)"
            }}
          >
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "linear-gradient(135deg, #0071e3 0%, #af52de 100%)",
              margin: "0 auto 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              boxShadow: "0 8px 16px rgba(0, 113, 227, 0.2)"
            }}>
              <ShieldAlert size={32} />
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1d1d1f", letterSpacing: "-0.5px", marginBottom: 12 }}>
              🔒 Пробный период окончен
            </h2>

            <p style={{ fontSize: 13, color: "#86868b", lineHeight: 1.5, marginBottom: 28, fontWeight: 500 }}>
              Ваш пробный период (5 дней) окончен. Чтобы восстановить полный доступ к облачной базе данных вашей студии, ученикам и расписанию, активируйте подписку.
            </p>

            <button 
              onClick={() => {
                localStorage.setItem("fitcrm_trial_extended", "true");
                setTrialExtended(true);
                alert("🎉 Симуляция оплаты успешна! Подписка продлена, доступ к системе восстановлен. Приятного пользования!");
              }}
              style={{
                background: "#0071e3",
                color: "#ffffff",
                border: "none",
                borderRadius: 12,
                padding: "14px 24px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0, 113, 227, 0.2)",
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all 0.15s ease"
              }}
              className="hover:opacity-95 active:scale-98"
            >
              <Zap size={16} />
              Продлить подписку
            </button>

            <div style={{ marginTop: 24, borderTop: "1px solid #e8e8ed", paddingTop: 16 }}>
              <button 
                onClick={logout}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ff3b30",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit"
                }}
                className="hover:underline"
              >
                Выйти из личного кабинета
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function StudentPage({
  data,
  processStudentVisit,
  fetchVisitsForStudent,
  deleteStudent,
  showForm,
  setShowForm,
  sf,
  setSf,
  addStudent,
  C,
  getColor,
  firstDir,
  user
}: {
  data: DB;
  processStudentVisit: (studentId: number, at: Date) => { ok: boolean; message: string; tone: "ok" | "warn" | "err" };
  fetchVisitsForStudent: (studentId: number) => Promise<CrmVisitRow[]>;
  deleteStudent: (id: number) => void;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  sf: any;
  setSf: any;
  addStudent: () => void;
  C: any;
  getColor: any;
  firstDir: string;
  user: any;
}) {
  const [filter, setFilter] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [drawerStudent, setDrawerStudent] = useState<Student | null>(null);
  const [drawerTab, setDrawerTab] = useState<"abo" | "visits">("abo");
  const [visitRows, setVisitRows] = useState<CrmVisitRow[]>([]);
  const [visitRowsLoading, setVisitRowsLoading] = useState(false);
  const [manualVisitDatetime, setManualVisitDatetime] = useState(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" | "err" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!drawerStudent || !user) {
      setVisitRows([]);
      setVisitRowsLoading(false);
      return;
    }
    let cancelled = false;
    setVisitRowsLoading(true);
    fetchVisitsForStudent(drawerStudent.id)
      .then((rows) => { if (!cancelled) setVisitRows(rows); })
      .finally(() => { if (!cancelled) setVisitRowsLoading(false); });
    return () => { cancelled = true; };
  }, [drawerStudent?.id, user, fetchVisitsForStudent, data.students]);

  const refreshVisits = () => {
    if (!drawerStudent || !user) return;
    fetchVisitsForStudent(drawerStudent.id).then(setVisitRows).catch(() => {});
  };

  const filtered = useMemo(() => {
    const byStatus = data.students.filter(c => {
      if (filter === "active") return !isExpired(c) && c.payment === "paid";
      if (filter === "debt") return c.payment === "debt";
      if (filter === "expired") return isExpired(c);
      return true;
    });
    const q = studentSearch.trim();
    if (!q) return byStatus;
    const low = q.toLowerCase();
    const digits = q.replace(/\D/g, "");
    return byStatus.filter(c => {
      const nameHit = c.name.toLowerCase().includes(low);
      const phoneNorm = (c.phone || "").replace(/\D/g, "");
      const phoneHit = digits.length > 0 && phoneNorm.includes(digits);
      return nameHit || phoneHit;
    });
  }, [data.students, filter, studentSearch]);

  const directionsList = data.directions || ["Йога", "Фитнес"];
  const currentDirSelected = directionsList.includes(sf.direction) ? sf.direction : firstDir;

  const openDrawer = (c: Student) => {
    setDrawerStudent(c);
    setDrawerTab("abo");
  };

  const handleQrDecoded = (sid: number) => {
    setQrScanOpen(false);
    const r = processStudentVisit(sid, new Date());
    setToast({ msg: r.message, tone: r.ok ? r.tone : "err" });
    if (drawerStudent?.id === sid) refreshVisits();
  };

  const handleManualVisit = () => {
    if (!drawerStudent) return;
    const dt = new Date(manualVisitDatetime);
    if (Number.isNaN(dt.getTime())) {
      alert("Укажите корректные дату и время");
      return;
    }
    const r = processStudentVisit(drawerStudent.id, dt);
    setToast({ msg: r.message, tone: r.ok ? r.tone : "err" });
    if (r.ok) refreshVisits();
  };

  useEffect(() => {
    if (!drawerStudent) return;
    const exists = data.students.some(s => s.id === drawerStudent.id);
    if (!exists) setDrawerStudent(null);
  }, [data.students, drawerStudent?.id]);

  useEffect(() => {
    if (!drawerStudent) return;
    const fresh = data.students.find(s => s.id === drawerStudent.id);
    if (fresh) setDrawerStudent(fresh);
  }, [data.students, drawerStudent?.id]);

  const handleQuickVisitInDrawer = () => {
    if (!drawerStudent) return;
    const r = processStudentVisit(drawerStudent.id, new Date());
    setToast({ msg: r.message, tone: r.ok ? r.tone : "err" });
    if (r.ok) refreshVisits();
  };

  return (
    <div style={{ position: "relative" }}>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              position: "fixed",
              top: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10005,
              padding: "10px 18px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              maxWidth: 420,
              textAlign: "center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
              background: toast.tone === "err" ? "rgba(255, 69, 58, 0.95)" : toast.tone === "warn" ? "rgba(255, 159, 10, 0.95)" : "rgba(48, 209, 88, 0.95)",
              color: toast.tone === "warn" ? "#1c1c1e" : "#ffffff",
              border: "1px solid rgba(255,255,255,0.2)"
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <StudentQrScannerModal open={qrScanOpen} onClose={() => setQrScanOpen(false)} C={C} onStudentIdDecoded={handleQrDecoded} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Ученики</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={() => setQrScanOpen(true)} color="blue"><QrCode size={15}/> Сканировать QR</Btn>
          <Btn onClick={() => setShowForm(!showForm)} color="green"><Plus size={15}/>{showForm ? "Скрыть форму" : "Добавить ученика"}</Btn>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.5px" }}>Оформление нового ученика</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              <Input label="ФИО Ученика" value={sf.name} onChange={v => setSf({ ...sf, name: v })} placeholder="Например: Иван Иванов" />
              <Input label="Номер телефона" value={sf.phone} onChange={v => setSf({ ...sf, phone: v })} placeholder="+7 (999) 000-00-00" />
              <Input label="Направление" value={currentDirSelected} onChange={v => setSf({ ...sf, direction: v })} options={directionsList.map((d: string) => ({ value: d, label: d }))} />
              <Input label="Формат занятия" value={sf.classType} onChange={v => setSf({ ...sf, classType: v })} options={[{ value: "group", label: "Групповое" }, { value: "individual", label: "Индивидуальное" }]} />
              <Input label="Тип Абонемента" value={sf.abon} onChange={v => setSf({ ...sf, abon: v })} options={[{ value: "count", label: "Лимитированный (занятия)" }, { value: "unlim", label: "Безлимитный" }]} />
              {sf.abon === "count" && <Input label="Количество занятий" type="number" value={sf.count} onChange={v => setSf({ ...sf, count: v })} />}
              <Input label="Срок действия по" type="date" value={sf.until} onChange={v => setSf({ ...sf, until: v })} />
              <Input label="Сумма оплаты (₽)" type="number" value={sf.sum} onChange={v => setSf({ ...sf, sum: v })} placeholder="0" />
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Статус оплаты</label>
                <div style={{ display: "flex", gap: 6, height: 38 }}>
                  <button
                    type="button"
                    onClick={() => setSf({ ...sf, payment: "paid" })}
                    style={{
                      flex: 1,
                      border: sf.payment === "paid" ? "1px solid #30d158" : `1px solid ${C.border}`,
                      borderRadius: 8,
                      background: sf.payment === "paid" ? "rgba(48, 209, 88, 0.15)" : C.bg,
                      color: sf.payment === "paid" ? "#30d158" : C.muted,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      transition: "all 0.15s ease-in-out"
                    }}
                  >
                    Оплачено
                  </button>
                  <button
                    type="button"
                    onClick={() => setSf({ ...sf, payment: "debt" })}
                    style={{
                      flex: 1,
                      border: sf.payment === "debt" ? "1px solid #ff9f0a" : `1px solid ${C.border}`,
                      borderRadius: 8,
                      background: sf.payment === "debt" ? "rgba(255, 159, 10, 0.15)" : C.bg,
                      color: sf.payment === "debt" ? "#ff9f0a" : C.muted,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      transition: "all 0.15s ease-in-out"
                    }}
                  >
                    Долг
                  </button>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => setShowForm(false)}>Отмена</Btn>
              <Btn onClick={addStudent} color="green"><Check size={15}/> Добавить ученика</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ marginBottom: 16 }}>
        <Input label="Быстрый поиск" value={studentSearch} onChange={setStudentSearch} placeholder="Фамилия, имя или цифры номера телефона…" />
      </div>

      <div style={{ display: "inline-flex", background: "#2c2c2e", borderRadius: 8, padding: 2, marginBottom: 16, gap: 2, maxWidth: "100%", overflowX: "auto" }}>
        {[
          ["all", "Все ученики"],
          ["active", "Активные абонементы"],
          ["debt", "С финансовыми долгами"],
          ["expired", "Просроченные"]
        ].map(([k, l]) => {
          const active = filter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              style={{
                padding: "6px 14px",
                border: "none",
                borderRadius: 6,
                background: active ? "#3a3a3c" : "transparent",
                color: active ? "#f5f5f7" : "#8e8e93",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.12s ease-in-out",
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                whiteSpace: "nowrap"
              }}
            >
              {l}
            </button>
          );
        })}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 360 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "#252528" }}>
                {["Ученик", "Телефон", "Статус"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "14px 16px", fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", padding: 40, color: C.muted, fontWeight: 500 }}>
                    Нет учеников в списке фильтрации
                  </td>
                </tr>
              )}
              {filtered.map(c => {
                const exp = isExpired(c);
                const tdStyle: React.CSSProperties = {
                  padding: "12px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  color: exp ? "#ff453a" : C.text,
                  verticalAlign: "middle"
                };
                return (
                  <tr
                    key={c.id}
                    onClick={() => openDrawer(c)}
                    style={{
                      background: exp ? "rgba(255, 69, 58, 0.05)" : "transparent",
                      cursor: "pointer"
                    }}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${getColor(c.direction)}20`, border: `1px solid ${getColor(c.direction)}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: getColor(c.direction), fontWeight: 700, flexShrink: 0 }}>{c.name[0]}</div>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: C.muted, fontWeight: 500 }}>{c.phone || "—"}</td>
                    <td style={tdStyle}>
                      <Badge type={exp ? "expired" : isAlmost(c) ? "almost" : c.payment === "debt" ? "debt" : "active"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.4 }}>
        Нажмите на строку, чтобы открыть карточку: абонемент, QR для пропуска и история посещений из облака.
      </div>

      <AnimatePresence>
        {drawerStudent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerStudent(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, backdropFilter: "blur(3px)" }}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                height: "100vh",
                width: "min(440px, 100vw)",
                background: C.card,
                borderLeft: `1px solid ${C.border}`,
                zIndex: 10001,
                display: "flex",
                flexDirection: "column",
                boxShadow: "-12px 0 40px rgba(0,0,0,0.35)"
              }}
            >
              <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${getColor(drawerStudent.direction)}22`, border: `1px solid ${getColor(drawerStudent.direction)}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: getColor(drawerStudent.direction), flexShrink: 0 }}>
                  {drawerStudent.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 750, color: C.text, lineHeight: 1.2 }}>{drawerStudent.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>ID карты: <span style={{ fontFamily: "var(--font-mono)", color: C.text }}>{drawerStudent.id}</span></div>
                </div>
                <button type="button" aria-label="Закрыть" onClick={() => setDrawerStudent(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 6, borderRadius: 8 }} className="hover:bg-white/10 hover:text-white">
                  <X size={22} />
                </button>
              </div>

              <div style={{ display: "flex", gap: 4, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                {([
                  ["abo", "Абонемент"],
                  ["visits", "История посещений"]
                ] as const).map(([key, lab]) => {
                  const active = drawerTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDrawerTab(key)}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "none",
                        fontFamily: "inherit",
                        fontSize: 13,
                        fontWeight: active ? 650 : 500,
                        cursor: "pointer",
                        background: active ? "#3a3a3c" : "transparent",
                        color: active ? C.text : C.muted,
                        transition: "all 0.12s"
                      }}
                    >
                      {lab}
                    </button>
                  );
                })}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
                {drawerTab === "abo" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
                      Направление: <strong style={{ color: getColor(drawerStudent.direction) }}>{drawerStudent.direction}</strong>
                      · {drawerStudent.classType === "individual" ? "Индивидуально" : "Групповое"}
                      · Абонемент: {drawerStudent.abon === "unlim" ? "безлимит" : "по занятиям"}
                    </div>
                    <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>Телефон</span>
                        <span style={{ fontWeight: 600 }}>{drawerStudent.phone || "—"}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>Осталось занятий</span>
                        <span style={{ fontWeight: 600 }}>{drawerStudent.abon === "unlim" ? "∞" : drawerStudent.count}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>Срок по</span>
                        <span style={{ fontWeight: 600 }}>{fmtDate(drawerStudent.until)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>Визитов (всего, учёт в CRM)</span>
                        <span style={{ fontWeight: 600 }}>{drawerStudent.visits ?? 0}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>QR для пропуска</div>
                      <LiveStudentQr studentId={String(drawerStudent.id)} size={160} />
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>Отсканируйте код на ресепшене или используйте кнопку «Сканировать QR» вверху списка.</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <Btn onClick={handleQuickVisitInDrawer} color="blue"><CheckSquare size={15}/> Отметить визит (сейчас)</Btn>
                      <Btn
                        onClick={() => {
                          if (!drawerStudent) return;
                          const sid = drawerStudent.id;
                          setDrawerStudent(null);
                          deleteStudent(sid);
                        }}
                        color="red"
                      >
                        <Trash2 size={15}/> Удалить ученика
                      </Btn>
                    </div>
                  </div>
                )}

                {drawerTab === "visits" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {!user ? (
                      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>История синхронизируется с Supabase после входа в аккаунт.</div>
                    ) : visitRowsLoading ? (
                      <div style={{ fontSize: 13, color: C.muted }}>Загрузка…</div>
                    ) : visitRows.length === 0 ? (
                      <div style={{ fontSize: 13, color: C.muted }}>Пока нет записанных посещений в облаке.</div>
                    ) : (
                      <div style={{ position: "relative", paddingLeft: 18 }}>
                        <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: C.border, borderRadius: 1 }} />
                        {visitRows.map((row, idx) => (
                          <div key={row.id} style={{ position: "relative", marginBottom: idx === visitRows.length - 1 ? 0 : 18, paddingLeft: 16 }}>
                            <div style={{ position: "absolute", left: -1, top: 4, width: 12, height: 12, borderRadius: "50%", background: C.accent, border: `2px solid ${C.card}`, boxShadow: `0 0 0 1px ${C.border}` }} />
                            <div style={{ fontSize: 13, fontWeight: 650, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                              <Clock size={13} style={{ opacity: 0.8 }}/> {fmtDateTime(row.visited_at)}
                            </div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Запись №{row.id}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                        <History size={14}/> Добавить визит вручную
                      </div>
                      <Input label="Дата и время посещения" type="datetime-local" value={manualVisitDatetime} onChange={setManualVisitDatetime} />
                      <Btn onClick={handleManualVisit} color="green" style={{ width: "100%", marginTop: 12, justifyContent: "center" }}><Plus size={15}/> Сохранить визит</Btn>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>Запись попадёт в таблицу crm_visits и спишет занятие с текущего абонемента (как обычный визит).</div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function TeacherPage({data,save,deleteTeacher,showForm,setShowForm,tf,setTf,addTeacher,C,getColor,firstDir}: { data: DB; save: (d: DB) => void; deleteTeacher: (id: number) => void; showForm: boolean; setShowForm: (v: boolean) => void; tf: any; setTf: any; addTeacher: () => void; C: any; getColor: any; firstDir: string }) {
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const directionsList = data.directions || ["Йога", "Фитнес"];
  const currentDirSelected = directionsList.includes(tf.direction) ? tf.direction : firstDir;

  const teachersFiltered = useMemo(() => {
    if (subjectFilter === "all") return data.teachers;
    return data.teachers.filter(t => t.direction === subjectFilter);
  }, [data.teachers, subjectFilter]);

  useEffect(() => {
    if (subjectFilter !== "all" && !directionsList.includes(subjectFilter)) setSubjectFilter("all");
  }, [directionsList, subjectFilter]);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>Фильтр по предмету / направлению</div>
        <div style={{
          display: "flex",
          flexWrap: "nowrap",
          gap: 4,
          overflowX: "auto",
          maxWidth: "100%",
          paddingBottom: 4,
          WebkitOverflowScrolling: "touch"
        }}>
          {[
            { key: "all", label: "Все предметы", dir: "" as string }
          ].concat(directionsList.map(d => ({ key: d, label: d, dir: d }))).map(({ key, label }) => {
            const active = subjectFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSubjectFilter(key)}
                style={{
                  flex: "0 0 auto",
                  padding: "7px 14px",
                  borderRadius: 8,
                  background: active ? "#3a3a3c" : C.bg,
                  color: active ? C.text : C.muted,
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: active ? `1px solid ${C.accent}55` : `1px solid ${C.border}`,
                  boxShadow: active ? "0 1px 4px rgba(0,0,0,0.25)" : "none",
                  whiteSpace: "nowrap",
                  transition: "all 0.12s ease-in-out"
                }}
                className={active ? "" : "hover:bg-white/5 hover:text-[#ebebf5]"}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <h1 style={{fontSize:22,fontWeight:700, color:C.text}}>Преподавательский состав</h1>
        <Btn onClick={()=>setShowForm(!showForm)} color="green"><Plus size={15}/>{showForm?"Скрыть форму":"Добавить преподавателя"}</Btn>
      </div>

      <AnimatePresence>
        {showForm&&(
          <motion.div initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: "auto"}} exit={{opacity: 0, height: 0}} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:20,marginBottom:16, overflow:"hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
            <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.5px"}}>Добавление преподавателя/тренера</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
              <Input label="ФИО Преподавателя" value={tf.name} onChange={v=>setTf({...tf,name:v})} placeholder="Например: Смирнов Алексей"/>
              <Input label="Телефон" value={tf.phone} onChange={v=>setTf({...tf,phone:v})} placeholder="+7 (999) 000-00-00"/>
              <Input label="Основная дисциплина" value={currentDirSelected} onChange={v=>setTf({...tf,direction:v})} options={directionsList.map((d: any)=>({value:d,label:d}))}/>
              <Input label="Ставка оплаты за занятие (₽)" type="number" value={tf.rate} onChange={v=>setTf({...tf,rate:v})} placeholder="Ставка, напр. 900"/>
            </div>
            <div style={{marginTop:16,display:"flex",gap:8, justifyContent: "flex-end"}}>
              <Btn onClick={()=>setShowForm(false)}>Отмена</Btn>
              <Btn onClick={addTeacher} color="green"><Check size={14}/> Сохранить</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {data.teachers.length===0 ? (
        <div style={{textAlign:"center",padding:40,background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontWeight:500}}>Нет преподавателей. Нажмите «Добавить преподавателя» выше!</div>
      ) : teachersFiltered.length === 0 ? (
        <div style={{textAlign:"center",padding:40,background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontWeight:500}}>Нет преподавателей с направлением «{subjectFilter}». Выберите другой фильтр или добавьте специалиста.</div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
          {teachersFiltered.map(t=>(
            <div key={t.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:20, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}} className="hover:border-zinc-500 transition-colors">
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:`${getColor(t.direction)}20`,border:`1px solid ${getColor(t.direction)}35`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:getColor(t.direction),fontWeight:700,flexShrink:0}}>{t.name[0]}</div>
                <div>
                   <div style={{fontWeight:700,fontSize:14, color:C.text}}>{t.name}</div>
                  <div style={{fontSize:11,color:getColor(t.direction), fontWeight: 700}}>{t.direction}</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,fontSize:12,color:C.text,marginBottom:16, background: C.bg, padding: "12px", borderRadius: 8}}>
                <div style={{display:"flex", justifyContent: "space-between"}}><span style={{color: C.muted}}>📞 Телефон:</span><strong style={{color:C.text}}>{t.phone||"—"}</strong></div>
                <div style={{display:"flex", justifyContent: "space-between"}}><span style={{color: C.muted}}>💰 Ставка за занятие:</span><strong style={{color:"#30d158"}}>{fmtMoney(t.rate)}/зан.</strong></div>
                <div style={{display:"flex", justifyContent: "space-between"}}><span style={{color: C.muted}}>👥 Активных учеников:</span><strong style={{color:C.accent}}>{data.students.filter(s=>s.direction===t.direction).length} чел.</strong></div>
              </div>
              <div style={{display: "flex", justifyContent: "flex-end"}}>
                <Btn onClick={()=>deleteTeacher(t.id)} small color="red"><Trash2 size={13}/> Удалить анкету</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SchedulePage({data,save,deleteSched,showForm,setShowForm,schf,setSchf,addSched,C,getColor,firstDir}: { data: DB; save: (d: DB) => void; deleteSched: (id: number) => void; showForm: boolean; setShowForm: (v: boolean) => void; schf: any; setSchf: any; addSched: () => void; C: any; getColor: any; firstDir: string }) {
  const directionsList = data.directions || ["Йога", "Фитнес"];
  const currentSubjectSelected = directionsList.includes(schf.subject) ? schf.subject : firstDir;
  const DAYS_LABEL = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
  const DAYS_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <h1 style={{fontSize:22,fontWeight:700, color:C.text}}>Сетка расписания</h1>
        <Btn onClick={()=>setShowForm(!showForm)} color="green"><Plus size={15}/>{showForm?"Скрыть форму":"Добавить занятие"}</Btn>
      </div>

      <AnimatePresence>
        {showForm&&(
          <motion.div initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: "auto"}} exit={{opacity: 0, height: 0}} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:20,marginBottom:16, overflow:"hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
            <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.5px"}}>Создать занятие в расписании</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
              <Input label="День недели" value={schf.day} onChange={v=>setSchf({...schf,day:v})} options={DAYS_LABEL.map((d,i)=>({value:String(i),label:d}))}/>
              <Input label="Время занятий" type="time" value={schf.time} onChange={v=>setSchf({...schf,time:v})}/>
              <Input label="Направление/Предмет" value={currentSubjectSelected} onChange={v=>setSchf({...schf,subject:v})} options={directionsList.map((d: any)=>({value:d,label:d}))}/>
              <Input label="Ответственный Преподаватель" value={schf.teacherId} onChange={v=>setSchf({...schf,teacherId:v})} options={[{value:"",label:"— Без преподавателя —"},...data.teachers.map((t: any)=>({value:String(t.id),label:t.name}))]}/>
              <Input label="Формат группы" value={schf.classType} onChange={v=>setSchf({...schf,classType:v})} options={[{value:"group",label:"Группа (Групповое)"},{value:"individual",label:"Индивидуальное"}]}/>
            </div>
            <div style={{marginTop:16,display:"flex",gap:8, justifyContent: "flex-end"}}>
              <Btn onClick={()=>setShowForm(false)}>Отмена</Btn>
              <Btn onClick={addSched} color="green"><Check size={14}/> Подтвердить</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
        {DAYS_SHORT.map((day,di)=>{
          const lessons = data.schedule.filter(s=>s.day===di).sort((a,b)=>a.time.localeCompare(b.time));
          return (
            <div key={di} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
              <div style={{padding:"12px 14px",background:"#252528",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.text,textTransform:"uppercase",letterSpacing:"0.5px"}}>{DAYS_LABEL[di]} ({day})</div>
              <div style={{padding:14,display:"flex",flexDirection:"column",gap:10,minHeight:110}}>
                {lessons.length===0&&<div style={{fontSize:11,color:C.muted,padding:"20px 0",textAlign:"center", border: "1px dashed #3a3a3c", borderRadius: 8, background: C.bg}}>Занятий нет</div>}
                {lessons.map(l=>{
                   const teacher = data.teachers.find(t=>t.id===l.teacherId);
                   const color = getColor(l.subject);
                   return (
                     <div key={l.id} style={{
                       background: `${color}15`,
                       border: `1.5px solid ${color}30`,
                       borderRadius: 8,
                       padding: "10px",
                       position: "relative"
                     }} className="hover:scale-[1.01] transition-transform">
                       <div style={{fontSize:11,color,fontWeight:750}}>{l.time}</div>
                       <div style={{fontSize:12,fontWeight:700,color:C.text,marginTop:2}}>{l.subject}</div>
                       {teacher ? (
                         <div style={{fontSize:11,color:C.muted,marginTop:2, display:"inline-flex", gap:3, alignItems:"center"}}><Building size={11} style={{color}}/>{teacher.name.split(" ")[0]}</div>
                       ) : (
                         <div style={{fontSize:10,color:C.muted,marginTop:2, fontStyle:"italic"}}>Преподаватель не назначен</div>
                       )}
                       <div style={{marginTop:6, display:"flex", justifyContent: "space-between", alignItems: "center"}}>
                         <span style={{fontSize:10,background:`${color}25`, color, padding: "2px 6px", borderRadius: 6, fontWeight: 700}}>{l.classType==="group"?"Группа":"Инд."}</span>
                         <button onClick={()=>deleteSched(l.id)} style={{background:C.bg,border:"1.5px solid rgba(255, 69, 58, 0.3)",color:"#ff453a",cursor:"pointer",padding:"2px 5px",borderRadius: 6, display:"flex",alignItems:"center"}} className="hover:brightness-125" title="Удалить">
                           <Trash2 size={11}/>
                         </button>
                       </div>
                     </div>
                   );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnalyticsPage({data,stats,C,getColor}: { data: DB; stats: any; C: any; getColor: any }) {
  const dirRevenue = useMemo(()=>{
    const m: Record<string, number>={};
    data.students.forEach(s=>{ m[s.direction]=(m[s.direction]||0)+(s.sum||0); });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[data.students]);

  const maxRev = dirRevenue.length ? Math.max(...dirRevenue.map(([,v])=>v)) : 1;

  const visitsByDay = useMemo(()=>{
    const counts = Array(7).fill(0);
    data.schedule.forEach(s=>{ counts[s.day]++; });
    return counts;
  },[data.schedule]);
  const maxVisits = Math.max(...visitsByDay,1);

  const groupCount = data.students.filter(s=>s.classType==="group").length;
  const indivCount = data.students.filter(s=>s.classType==="individual").length;
  const total = groupCount+indivCount||1;
  const groupPct = Math.round(groupCount/total*100);
  const indivPct = 100-groupPct;

  const abon = {
    count: data.students.filter(s=>s.abon==="count").length, 
    unlim: data.students.filter(s=>s.abon==="unlim").length
  };
  const DAYS_SHORT=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

  // Advanced financial calculation parameters
  const totalRevenues = data.students.reduce((acc, s) => acc + (s.payment === "paid" ? (s.sum || 0) : 0), 0);
  const totalExpenses = (data.expenses || []).reduce((acc, e) => acc + (e.sum || 0), 0);
  const netProfit = totalRevenues - totalExpenses;
  const isLoss = totalExpenses > totalRevenues;

  // Percentage strip distribution list
  const totalRevNormalized = dirRevenue.reduce((acc, [, v]) => acc + v, 0) || 1;

  return (
    <div>
      <h1 style={{fontSize:22,fontWeight:750,marginBottom:20, color:C.text}}>Финансовая и Посещаемая Аналитика</h1>
      
      {/* 3 Analytics Cards (revenue, expenses and dynamic Net Profit with iOS alerts) */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:16}}>
        <StatCard icon={<TrendingUp size={16}/>} label="Валовая выручка (Оплаты)" value={fmtMoney(totalRevenues)} color="#30d158"/>
        <StatCard icon={<TrendingUp size={16}/>} label="Расходы студии" value={fmtMoney(totalExpenses)} color="#ff9f0a"/>
        
        {/* Dynamic Profit Blocker Blinking with Apple Crimson Color under loss */}
        <div style={{
          background: isLoss ? "rgba(255, 69, 58, 0.15)" : C.card,
          border: isLoss ? "1px solid #ff453a" : `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          color: C.text,
          transition: "all 0.25s ease"
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: isLoss ? "rgba(255,69,58,0.2)" : "rgba(48, 209, 88, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isLoss ? "#ff453a" : "#30d158"
          }}>
            <TrendingUp size={18} />
          </div>
          <div>
            <div style={{fontSize: 11, fontWeight: 650, color: isLoss ? "#ff453a" : C.muted, textTransform: "uppercase", letterSpacing: "0.5px"}}>
              Чистая прибыль {isLoss && "⚠️"}
            </div>
            <div style={{fontSize: 18, fontWeight: 800, fontFamily: "inherit"}}>
              {fmtMoney(netProfit)}
            </div>
            {isLoss && (
              <div style={{fontSize: 9, fontWeight: 700, color: "#ff453a", marginTop: 2, background: "rgba(255,69,58,0.1)", padding: "1px 6px", borderRadius: 4, display: "inline-block"}}>
                ⚠️ Дефицит бюджета в этом месяце
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CAPSULE POWERED STRIP BAR */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18,marginBottom:16, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
        <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.5px"}}>📊 Долевое распределение доходов студии</div>
        {dirRevenue.length === 0 ? (
          <div style={{fontSize:12, color: C.muted, fontStyle: "italic"}}>Нет данных для построения полосы долей</div>
        ) : (
          <div>
            <div style={{width:"100%", height: 14, background: C.bg, borderRadius: 7, overflow: "hidden", display: "flex", marginBottom: 12}}>
              {dirRevenue.map(([dir, v]) => {
                const pct = (v / totalRevNormalized) * 100;
                if (pct < 1) return null;
                return (
                  <div key={dir} style={{
                    width: `${pct}%`,
                    background: getColor(dir),
                    height: "100%",
                    transition: "width 0.3s ease"
                  }} title={`${dir}: ${Math.round(pct)}%`} />
                );
              })}
            </div>
            <div style={{display: "flex", gap: 14, flexWrap: "wrap"}}>
              {dirRevenue.map(([dir, v]) => {
                const pct = Math.round((v / totalRevNormalized) * 100);
                return (
                  <div key={dir} style={{display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600}}>
                    <span style={{width: 8, height: 8, borderRadius: "50%", background: getColor(dir)}} />
                    <span style={{color: C.text}}>{dir}</span>
                    <span style={{color: C.muted}}>{pct}% ({fmtMoney(v)})</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:14,marginBottom:14}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
          <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.5px"}}>💰 Доходы распределенные по направлениям</div>
          {dirRevenue.length===0 ? (
            <div style={{color:C.muted,fontSize:13, textAlign:"center", padding:20}}>Нет выручки для анализа</div>
          ) : (
            <div style={{display:"flex", flexDirection:"column", gap:12}}>
              {dirRevenue.map(([dir,rev])=>(
                <div key={dir}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12}}>
                    <span style={{color:getColor(dir),fontWeight:700}}>{dir}</span>
                    <span style={{color:C.text, fontWeight: 700}}>{fmtMoney(rev)}</span>
                  </div>
                  <div style={{height:8,background:C.bg,borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.round(rev/maxRev*100)}%`,background:getColor(dir),borderRadius:4,transition:"width 0.4s"}}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
          <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.5px"}}>📅 Загруженность студии (занятий/нед.)</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:10,height:120, paddingBottom: 10}}>
            {visitsByDay.map((v,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                <div style={{fontSize:11,color:C.text, fontWeight: 700}}>{v||"0"}</div>
                <div style={{width:"100%",background:v>0?C.accent:C.bg,borderRadius:"4px 4px 0 0",height:`${Math.round(v/maxVisits*80)+4}px`,transition:"height 0.4s"}}/>
                <div style={{fontSize:10,color:C.muted, fontWeight:600}}>{DAYS_SHORT[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:14}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
          <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.5px"}}>👥 Форматы обучения (ученики)</div>
          <div style={{display:"flex",alignItems:"center",gap:24, justifyContent: "center", padding: "10px 0"}}>
            <svg width={100} height={100} viewBox="0 0 100 100" style={{transform: "rotate(-90deg)"}}>
              <circle cx={50} cy={50} r={40} fill="none" stroke={C.bg} strokeWidth={12}/>
              {groupPct>0&&<circle cx={50} cy={50} r={40} fill="none" stroke="#0071e3" strokeWidth={12} strokeDasharray={`${groupPct*2.513} ${(100-groupPct)*2.513}`} strokeDashoffset={0} strokeLinecap="round"/>}
              {indivPct>0&&<circle cx={50} cy={50} r={40} fill="none" stroke="#af52de" strokeWidth={12} strokeDasharray={`${indivPct*2.513} ${(100-indivPct)*2.513}`} strokeDashoffset={`-${groupPct*2.513}`} strokeLinecap="round"/>}
            </svg>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}><div style={{width:12,height:12,borderRadius:3,background:"#0071e3"}}/><span style={{color:C.muted, fontWeight:500}}>Групповые</span><strong style={{color:C.text}}>{groupCount} ({groupPct}%)</strong></div>
              <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}><div style={{width:12,height:12,borderRadius:3,background:"#af52de"}}/><span style={{color:C.muted, fontWeight:500}}>Индивидуальные</span><strong style={{color:C.text}}>{indivCount} ({indivPct}%)</strong></div>
            </div>
          </div>
        </div>

        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
          <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.5px"}}>🎫 Специфика абонементов</div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11, fontWeight:600, color: C.muted}}>
                <span>ОПЛАТА ПО ЗАНЯТИЯМ</span>
                <span style={{color:C.text}}>{abon.count} уч.</span>
              </div>
              <div style={{height:8,background:C.bg,borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${total > 0 ? Math.round(abon.count/total*100) : 0}%`,background:"#30d158",borderRadius:4}}/>
              </div>
            </div>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11, fontWeight:600, color: C.muted}}>
                <span>БЕЗЛИМИТНЫЕ ТАРИФЫ</span>
                <span style={{color:C.text}}>{abon.unlim} уч.</span>
              </div>
              <div style={{height:8,background:C.bg,borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${total > 0 ? Math.round(abon.unlim/total*100) : 0}%`,background:"#ff9f0a",borderRadius:4}}/>
              </div>
            </div>
            <div style={{marginTop:4,padding:"10px 14px",background:C.bg,borderRadius:8,fontSize:12,color:C.muted, display:"flex", justifyContent: "space-between"}}>
              <span>Среднее начисление на ученика:</span> <strong style={{color:"#30d158"}}>{total>0?fmtMoney(Math.round(totalRevenues/total)):"0 ₽"}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({data,save,C,getColor,dbStatus,syncing,user,triggerAuthModal,ownerIdForDirections}: { data: DB; save: (d: DB) => void; C: any; getColor: any; dbStatus: string; syncing: boolean; user: any; triggerAuthModal: (r: string) => void; ownerIdForDirections: string | null }) {
  const [newDir, setNewDir] = useState("");
  const [copied, setCopied] = useState(false);

  const sqlCode = `-- Таблица для хранения данных вашей CRM-системы (SaaS)
create table if not exists public.crm_studios (
  user_id uuid references auth.users not null primary key,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  studio_name text default 'Моя Студия',
  studio_type text default 'sport',
  directions jsonb default '["Йога", "Фитнес", "Бокс", "Танцы", "Растяжка", "Пилатес"]'::jsonb,
  students jsonb default '[]'::jsonb,
  teachers jsonb default '[]'::jsonb,
  schedule jsonb default '[]'::jsonb
);

-- Включение RLS (Row Level Security) для изоляции данных клиентов
alter table public.crm_studios enable row level security;

-- Политика: каждый пользователь может управлять только своими данными
create policy "Users can modify only their own data"
  on public.crm_studios
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Направления / предметы (конструктор студии, подтягиваются в списки CRM)
create table if not exists public.crm_directions (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, name)
);

alter table public.crm_directions enable row level security;

create policy "Users manage own directions"
  on public.crm_directions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Журнал посещений (student_id совпадает с id ученика в JSON crm_studios.students)
create table if not exists public.crm_visits (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  student_id bigint not null,
  visited_at timestamp with time zone not null default timezone('utc'::text, now()),
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists crm_visits_user_student_idx on public.crm_visits (user_id, student_id);
create index if not exists crm_visits_user_visited_idx on public.crm_visits (user_id, visited_at desc);

alter table public.crm_visits enable row level security;

create policy "Users manage own visits"
  on public.crm_visits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTypeSelectChange = (type: string) => {
    if (!user) {
      triggerAuthModal("Чтобы изменить настройки и перестроить CRM под другую категорию, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    const updatedDirs = getDefaultDirections(type);
    const migratedData = migrateDirectionsOnTypeChange(type, data);

    save({
      ...data,
      studioType: type,
      directions: updatedDirs,
      students: migratedData.students,
      teachers: migratedData.teachers,
      schedule: migratedData.schedule
    });
  };

  const handleAddDir = async () => {
    if (!user) {
      triggerAuthModal("Чтобы сохранить изменения и создать свою личную облачную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    const val = newDir.trim();
    if(!val) { alert("Введите название направления"); return; }
    if(data.directions.includes(val)) { alert("Такое направление уже существует!"); return; }
    const updated = [...data.directions, val];
    if (ownerIdForDirections) {
      const { error } = await supabase.from("crm_directions").insert({ user_id: ownerIdForDirections, name: val });
      if (error && (error as { code?: string }).code !== "23505") {
        console.warn("crm_directions insert:", error.message);
      }
    }
    save({...data, directions: updated});
    setNewDir("");
  };

  const handleRemoveDir = async (dir: string) => {
    if (!user) {
      triggerAuthModal("Чтобы вносить изменения в настройки отображаемых направлений, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    if(data.directions.length <= 1) { alert("В системе должно оставаться как минимум одно направление!"); return; }
    if(confirm(`Вы действительно хотите удалить направление "${dir}"?`)) {
      const updated = data.directions.filter(d => d !== dir);
      if (ownerIdForDirections) {
        const { error } = await supabase.from("crm_directions").delete().eq("user_id", ownerIdForDirections).eq("name", dir);
        if (error) console.warn("crm_directions delete:", error.message);
      }
      save({...data, directions: updated});
    }
  };

  // Helper inside Settings to quickly toggle directions in a checklist
  const togglePresetDirection = (dirName: string) => {
    if (!user) {
      triggerAuthModal("Чтобы переключать направления работы и настраивать свою личную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
      return;
    }
    if (data.directions.includes(dirName)) {
      if (data.directions.length <= 1) {
        alert("В системе должно оставаться как минимум одно направление!");
        return;
      }
      save({
        ...data,
        directions: data.directions.filter(d => d !== dirName)
      });
    } else {
      save({
        ...data,
        directions: [...data.directions, dirName]
      });
    }
  };

  const activeCategoryPresets = allDirectionsPresets[data.studioType] || [];

  return (
    <div>
      <h1 style={{fontSize:22,fontWeight:750,marginBottom:20, color:C.text}}>⚙️ Настройки и Конструктор Студии</h1>
      
      {/* SECTION 1: STUDIO NAME */}
      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:16, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
        <div style={{fontSize:14, fontWeight:700, marginBottom:4, color:C.text}}>🏷️ Название Вашей Студии</div>
        <div style={{fontSize:12, color:C.muted, marginBottom:14}}>Введите собственное название студии. Оно будет отображаться в левом верхнем углу меню и в шапке отчётов.</div>
        <Input 
          label="Кастомное имя" 
          value={data.studioName || ""} 
          onChange={(v)=>{
            if (!user) {
              triggerAuthModal("Чтобы сохранить изменения и создать свою личную облачную CRM, пожалуйста, зарегистрируйтесь или войдите в аккаунт");
              return;
            }
            save({...data, studioName: v});
          }} 
          placeholder="Например: Сила и Баланс, SpeakEasy, Почемучка..." 
        />
      </div>

      {/* SECTION 2: STUDIO TYPE SELECT */}
      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:16, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
        <div style={{fontSize:14, fontWeight:700, marginBottom:4, color:C.text}}>🎯 Тип и Назначение Студии</div>
        <div style={{fontSize:12, color:C.muted, marginBottom:16}}>Переключение категории мгновенно перестроит набор дефолтных предметов и настроек под выбранную сферу, чтобы избежать путаницы направлений.</div>
        
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(210px, 1fr))", gap:14}}>
          
          {/* Card 1: Sport */}
          <div 
            onClick={() => handleTypeSelectChange("sport")}
            style={{
              background: data.studioType === "sport" ? "rgba(0, 113, 227, 0.12)" : C.bg,
              border: `2px solid ${data.studioType === "sport" ? "#0071e3" : C.border}`,
              borderRadius: 12, 
              padding: 16, 
              cursor: "pointer", 
              transition: "all 0.15s ease-in-out",
              display: "flex", 
              gap: 12, 
              alignItems: "center",
              boxShadow: data.studioType === "sport" ? "0 4px 12px rgba(0, 113, 227, 0.2)" : "0 1px 2px rgba(0,0,0,0.1)"
            }}
            className="hover:scale-[1.01] transition-transform"
          >
            <div style={{width:40, height:40, borderRadius:"50%", background: data.studioType === "sport" ? "rgba(0, 113, 227, 0.2)" : C.card, display:"flex", alignItems:"center", justifyContent:"center", color:"#0071e3", fontSize:20}}>🏋️</div>
            <div>
              <div style={{fontWeight:700, color: data.studioType === "sport" ? "#0071e3" : C.text, fontSize:13}}>🏋️ Студия Спорта</div>
              <div style={{fontSize:11, color:C.muted, fontWeight:500}}>Йога, фитнес, секции, залы</div>
            </div>
            {data.studioType === "sport" && <Check size={18} style={{marginLeft: "auto", color: "#0071e3"}} />}
          </div>
          
          {/* Card 2: Language */}
          <div 
            onClick={() => handleTypeSelectChange("language")}
            style={{
              background: data.studioType === "language" ? "rgba(0, 113, 227, 0.12)" : C.bg,
              border: `2px solid ${data.studioType === "language" ? "#0071e3" : C.border}`,
              borderRadius: 12, 
              padding: 16, 
              cursor: "pointer", 
              transition: "all 0.15s ease-in-out",
              display: "flex", 
              gap: 12, 
              alignItems: "center",
              boxShadow: data.studioType === "language" ? "0 4px 12px rgba(0, 113, 227, 0.2)" : "0 1px 2px rgba(0,0,0,0.1)"
            }}
            className="hover:scale-[1.01] transition-transform"
          >
            <div style={{width:40, height:40, borderRadius:"50%", background: data.studioType === "language" ? "rgba(0, 113, 227, 0.2)" : C.card, display:"flex", alignItems:"center", justifyContent:"center", color:"#0071e3", fontSize:18}}>🏫</div>
            <div>
              <div style={{fontWeight:700, color: data.studioType === "language" ? "#0071e3" : C.text, fontSize:13}}>🏫 Курсы и Языки</div>
              <div style={{fontSize:11, color:C.muted, fontWeight:500}}>Школа языков, лекториум, ЕГЭ</div>
            </div>
            {data.studioType === "language" && <Check size={18} style={{marginLeft: "auto", color: "#0071e3"}} />}
          </div>
          
          {/* Card 3: Kids */}
          <div 
            onClick={() => handleTypeSelectChange("kids")}
            style={{
              background: data.studioType === "kids" ? "rgba(0, 113, 227, 0.12)" : C.bg,
              border: `2px solid ${data.studioType === "kids" ? "#0071e3" : C.border}`,
              borderRadius: 12, 
              padding: 16, 
              cursor: "pointer", 
              transition: "all 0.15s ease-in-out",
              display: "flex", 
              gap: 12, 
              alignItems: "center",
              boxShadow: data.studioType === "kids" ? "0 4px 12px rgba(0, 113, 227, 0.2)" : "0 1px 2px rgba(0,0,0,0.1)"
            }}
            className="hover:scale-[1.01] transition-transform"
          >
            <div style={{width:40, height:40, borderRadius:"50%", background: data.studioType === "kids" ? "rgba(0, 113, 227, 0.2)" : C.card, display:"flex", alignItems:"center", justifyContent:"center", color:"#0071e3", fontSize:18}}>👶</div>
            <div>
              <div style={{fontWeight:700, color: data.studioType === "kids" ? "#0071e3" : C.text, fontSize:13}}>👶 Развивающий Центр</div>
              <div style={{fontSize:11, color:C.muted, fontWeight:500}}>Кружки для детей, творчество</div>
            </div>
            {data.studioType === "kids" && <Check size={18} style={{marginLeft: "auto", color: "#0071e3"}} />}
          </div>
        </div>
      </div>
      
      {/* SECTION 3: WORK DIRECTIONS BUILDER */}
      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
        <div style={{fontSize:14, fontWeight:700, marginBottom:4, color:C.text}}>🧱 Конструктор отображаемых направлений / предметов</div>
        <div style={{fontSize:12, color:C.muted, marginBottom:16}}>Определите, какие направления сейчас активны в студии. Исключите ненужные предметы (например, бокс в языковой школе), чтобы они не мешали при заполнении журналов и расписания. Новые направления из поля ниже дополнительно сохраняются в таблицу <span style={{fontFamily:"var(--font-mono)", color: C.text}}>crm_directions</span> в Supabase и подмешиваются в списки при следующей загрузке.</div>
        
        {/* CHECKLIST SECTOR */}
        <div style={{border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:16, background: C.bg}}>
          <div style={{fontSize:11, fontWeight:600, color:C.muted, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.5px"}}>🪄 Быстрый выбор стандартных направлений (активируйте кликом):</div>
          
          <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
            {activeCategoryPresets.map(preset => {
              const active = data.directions.includes(preset);
              const color = getColor(preset);
              return (
                <button
                  key={preset}
                  onClick={() => togglePresetDirection(preset)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 10px",
                    background: active ? `${color}20` : C.card,
                    border: `1.5px solid ${active ? color : C.border}`,
                    color: active ? color : C.muted,
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 20,
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                >
                  {active ? <Check size={12} style={{strokeWidth: 3}}/> : <CircleDot size={11} style={{opacity: 0.5}}/>}
                  <span>{preset}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* CUSTOM ADDITION BAR */}
        <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems: "flex-end"}}>
          <div style={{flex: "1 1 240px"}}>
            <Input label="Новое направление / предмет (вручную)" value={newDir} onChange={setNewDir} placeholder="Например: Каратэ, Робототехника, Французский..." />
          </div>
          <Btn onClick={() => void handleAddDir()} color="green" title="Добавить направление"><Plus size={18}/></Btn>
        </div>
        
        <div style={{fontSize:11, fontWeight:700, color:C.muted, marginBottom:8, textTransform:"uppercase"}}>Текущий активный список ({data.directions.length}):</div>
        <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
          {data.directions.map(dir => {
            const accentColor = getColor(dir);
            return (
              <div 
                key={dir} 
                style={{
                  background: `${accentColor}20`,
                  border: `1px solid ${accentColor}35`,
                  color: accentColor,
                  borderRadius: 20, 
                  padding: "4px 12px", 
                  fontSize: 13, 
                  fontWeight: 600,
                  display: "flex", 
                  alignItems: "center", 
                  gap: 8
                }}
              >
                <span>{dir}</span>
                <button 
                  onClick={() => handleRemoveDir(dir)} 
                  style={{
                    background: "none", border: "none", color: accentColor, cursor: "pointer", 
                    display: "flex", alignItems: "center", padding: 0
                  }}
                  title="Удалить направление"
                >
                  <X size={13} style={{opacity: 0.7, strokeWidth: 3}} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: DATABASE INTEGRATION & ONBOARDING */}
      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginTop:16, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"}}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
          <Database size={18} style={{color:"#0071e3"}} />
          <div style={{fontSize:14, fontWeight:750, color:C.text}}>📡 Статус облачной базы данных (Supabase SaaS)</div>
        </div>
        <div style={{fontSize:12, color:C.muted, marginBottom:16}}>Настройте единую таблицу для всех клиентов вашего SaaS-конструктора с автоматической изоляцией данных по учетной записи.</div>

        {/* Dynamic Status Banner */}
        {dbStatus === "ok" ? (
          <div style={{background:"rgba(48, 209, 88, 0.15)", border:"1px solid rgba(48, 209, 88, 0.3)", borderRadius:10, padding:14, display:"flex", alignItems:"center", gap:12, marginBottom:18}}>
            <div style={{width:8, height:8, borderRadius:"50%", background:"#30d158"}} />
            <div style={{fontSize:12, fontWeight:500, color:"#30d158"}}>
              <strong>Синхронизация активна!</strong> Все данные (клиенты, преподаватели, расписание) сохраняются в вашу облачную базу данных в реальном времени.
            </div>
          </div>
        ) : (
          <div style={{background:"rgba(255, 159, 10, 0.15)", border:"1px solid rgba(255, 159, 10, 0.3)", borderRadius:10, padding:14, display:"flex", flexDirection:"column", gap:6, marginBottom:18}}>
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <div style={{width:8, height:8, borderRadius:"50%", background:"#ff9f0a"}} />
              <div style={{fontSize:12, fontWeight:700, color:"#ff9f0a"}}>Служба работает в автономном режиме</div>
            </div>
            <div style={{fontSize:12, color:C.text, lineHeight:1.4}}>
              Для включения сохранения в Supabase, вам необходимо один раз запустить SQL-запрос создания таблицы в панели Supabase. Ваша CRM отлично работает локально в браузере, пока вы не подготовите таблицу.
            </div>
          </div>
        )}

        <div style={{fontSize:13, fontWeight:700, color:C.text, marginBottom:10}}>🚀 Как подключить базу за 30 секунд:</div>
        
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:14, marginBottom:18}}>
          <div style={{background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:12, fontSize:12, color:C.text}}>
            <strong style={{color:"#0071e3"}}>Шаг 1:</strong> Откройте ваш проект в <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" style={{color:"#0071e3", textDecoration:"underline", fontWeight:600}}>Supabase Dashboard</a>.
          </div>
          <div style={{background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:12, fontSize:12, color:C.text}}>
            <strong style={{color:"#0071e3"}}>Шаг 2:</strong> Перейдите в левое меню <strong>SQL Editor</strong> &rarr; нажмите <strong>New Query</strong>.
          </div>
          <div style={{background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:12, fontSize:12, color:C.text}}>
            <strong style={{color:"#0071e3"}}>Шаг 3:</strong> Скопируйте SQL-код ниже, вставьте его в поле ввода и нажмите кнопку <strong>Run</strong>!
          </div>
        </div>

        <div style={{position:"relative", background:"#1e1e1e", borderRadius:12, padding:16, overflow:"hidden", border:"1px solid #2e2e2e"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, paddingBottom:8, borderBottom:"1px solid #333333"}}>
            <span style={{fontSize:11, fontFamily:"var(--font-mono)", color:"#888888", fontWeight:600}}>crm_schema.sql</span>
            <button 
              onClick={handleCopySql}
              style={{
                display:"flex",
                alignItems:"center",
                gap:6,
                padding:"4px 10px",
                background: copied ? "#30d158" : "#3a3a3c",
                color:"#ffffff",
                border:"none",
                borderRadius:6,
                fontSize:11,
                fontWeight:600,
                cursor:"pointer",
                transition:"background 0.2s"
              }}
            >
              <Copy size={12}/>
              {copied ? "Скопировано!" : "Скопировать SQL-код"}
            </button>
          </div>
          <pre style={{
            margin:0,
            overflowX:"auto",
            fontSize:11,
            color:"#30d158",
            fontFamily:"var(--font-mono)",
            lineHeight:1.5,
            maxHeight:240
          }}>
            {sqlCode}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 💸 FINANCES & EXPENSES COMPONENT
// ==========================================
function expenseCategoryLabel(item: ExpenseItem) {
  return item.category === "Другое" && item.categoryCustom?.trim()
    ? item.categoryCustom.trim()
    : item.category;
}

function FinancesPage({ data, save, C }: { data: DB; save: (d: DB) => void; C: any }) {
  const [sum, setSum] = useState("");
  const [category, setCategory] = useState("Аренда");
  const [date, setDate] = useState(todayStr());
  const [comment, setComment] = useState("");
  const [categoryCustom, setCategoryCustom] = useState("");

  useEffect(() => {
    if (category !== "Другое") setCategoryCustom("");
  }, [category]);

  const originalExpenses = data.expenses || [];

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sum.trim() || isNaN(Number(sum))) {
      alert("Пожалуйста, введите корректную сумму");
      return;
    }
    if (category === "Другое") {
      const cust = categoryCustom.trim();
      if (!cust) {
        alert("Уточните категорию расхода");
        return;
      }
    }

    const newItem: ExpenseItem = {
      id: Date.now(),
      sum: parseFloat(sum),
      category: category as ExpenseItem["category"],
      categoryCustom: category === "Другое" ? categoryCustom.trim() : undefined,
      date,
      comment: comment.trim()
    };

    save({
      ...data,
      expenses: [newItem, ...originalExpenses]
    });

    setSum("");
    setComment("");
    setCategoryCustom("");
    setDate(todayStr());
  };

  const handleDeleteExpense = (id: number) => {
    if (!confirm("Вы уверены, что хотите удалить эту расходную статью?")) return;
    save({
      ...data,
      expenses: originalExpenses.filter(item => item.id !== id)
    });
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "Аренда": return "#3a86f0";
      case "Зарплата": return "#af52de";
      case "Реклама": return "#ff9500";
      case "Маркетинг": return "#ff9500";
      case "Инвентарь": return "#ff2d55";
      case "Хоз.нужды": return "#5e5ce6";
      case "Другое": return "#86868b";
      default: return "#86868b";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: C.text }}>Учет расходов студии (Финансы)</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {/* ADD EXPENSE COMPONENT */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>
            💸 Зарегистрировать новый расход
          </div>
          <form onSubmit={handleAddExpense} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label="Сумма расхода (₽)" type="number" value={sum} onChange={setSum} placeholder="Например: 15000" />
            
            <Input 
              label="Категория" 
              value={category} 
              onChange={setCategory} 
              options={[
                { value: "Аренда", label: "Аренда помещения" },
                { value: "Зарплата", label: "Зарплата тренерам / учителям" },
                { value: "Реклама", label: "Реклама и Маркетинг" },
                { value: "Инвентарь", label: "Покупка инвентаря / Оборудования" },
                { value: "Другое", label: "Другие регулярные расходы" }
              ]} 
            />

            {category === "Другое" && (
              <Input label="Уточните категорию" value={categoryCustom} onChange={setCategoryCustom} placeholder="Например: Бухгалтерия, Подписки, ПО…" />
            )}

            <Input label="Дата транзакции" type="date" value={date} onChange={setDate} />
            <Input label="Комментарий / Описание" value={comment} onChange={setComment} placeholder="Например: Оплата аренды за май" />

            <div style={{ marginTop: 8 }}>
              <Btn color="blue" type="submit" style={{ width: "100%", justifyContent: "center" }}><Plus size={15}/>Внести расход в базу</Btn>
            </div>
          </form>
        </div>

        {/* EXPENSES HISTORIC LIST */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", maxHeight: 420 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
            <span>История затрат</span>
            <span style={{ color: "#ff453a" }}>Итого: {fmtMoney(originalExpenses.reduce((a, b) => a + b.sum, 0))}</span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {originalExpenses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 13, fontStyle: "italic" }}>
                Расходы еще не зарегистрированы
              </div>
            ) : (
              originalExpenses.map(item => (
                <div key={item.id} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: getCategoryColor(expenseCategoryLabel(item))
                      }} />
                      <strong style={{ fontSize: 13, color: C.text }}>{expenseCategoryLabel(item)}</strong>
                      <span style={{ fontSize: 10, color: C.muted }}>{fmtDate(item.date)}</span>
                    </div>
                    {item.comment && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2, marginLeft: 14 }}>
                        {item.comment}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ color: "#ff453a", fontSize: 13 }}>-{fmtMoney(item.sum)}</strong>
                    <button onClick={() => handleDeleteExpense(item.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4 }} className="hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 👥 TEAM & ROLES COMPONENT
// ==========================================
function TeamPage({ data, save, C, user, getTrialDaysLeft, triggerAuthModal }: { data: DB; save: (d: DB) => void; C: any; user: any; getTrialDaysLeft: () => number; triggerAuthModal: (reason: string) => void }) {
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState("");

  const originalTeam = data.team || [];
  const limitReached = originalTeam.length >= 3;

  const handlePhoneChange = (v: string) => {
    setStaffPhone(formatRuPhone(v));
  };

  const handleRegisterStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    setRegSuccess("");

    if (!user) {
      triggerAuthModal(
        "Чтобы регистрировать сотрудников и синхронизировать команду с облаком Supabase, войдите в аккаунт владельца студии."
      );
      return;
    }

    if (limitReached) {
      setRegError("Вы превысили лимит вашей команды (максимум 3 сотрудника).");
      return;
    }

    if (!staffName.trim()) {
      setRegError("Пожалуйста, заполните имя сотрудника");
      return;
    }
    if (!staffPhone.trim() || staffPhone.length < 18) {
      setRegError("Пожалуйста, введите корректный российский номер телефона");
      return;
    }
    if (!staffEmail.trim() || !staffPassword.trim()) {
      setRegError("Пожалуйста, заполните Email и пароль для входа сотрудника");
      return;
    }
    if (staffPassword.trim().length < 6) {
      setRegError("Пароль должен быть длиной не менее 6 символов");
      return;
    }

    setRegistering(true);
    try {
      const tempSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });

      const { data: signUpData, error: signUpError } = await tempSupabase.auth.signUp({
        email: staffEmail.trim(),
        password: staffPassword,
        options: {
          data: {
            role: "staff",
            owner_id: user.id,
            phone: staffPhone.trim(),
            name: staffName.trim()
          }
        }
      });

      if (signUpError) {
        setRegError(`Ошибка Supabase: ${signUpError.message}`);
        setRegistering(false);
        return;
      }

      const newStaffItem: StaffMember = {
        id: Date.now(),
        uid: signUpData.user?.id || "",
        name: staffName.trim(),
        phone: staffPhone.trim(),
        email: staffEmail.trim(),
        role: "staff" as const,
        createdAt: new Date().toISOString()
      };

      save({
        ...data,
        team: [...originalTeam, newStaffItem]
      });

      setRegSuccess(`Сотрудник ${staffName} успешно добавлен в команду! Теперь он может войти под своим Email.`);
      setStaffEmail("");
      setStaffPassword("");
      setStaffName("");
      setStaffPhone("");
    } catch (err: any) {
      setRegError(`Не удалось добавить сотрудника: ${err.message || err}`);
    } finally {
      setRegistering(false);
    }
  };

  const handleRemoveStaff = (id: number) => {
    if (!user) {
      triggerAuthModal("Войдите в аккаунт владельца, чтобы изменять состав команды.");
      return;
    }
    if (!confirm("Вы уверены, что хотите удалить этого сотрудника?")) return;
    save({
      ...data,
      team: originalTeam.filter(t => t.id !== id)
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: C.text }}>Управление командой (Сотрудники)</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        {/* ADD STAFF MEMBERS REGISTRATION CARD */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>
            ➕ Добавить сотрудника в студию
          </div>
          
          {limitReached ? (
            <div style={{
              background: "rgba(255, 69, 58, 0.15)",
              border: "1px solid rgba(255, 69, 58, 0.3)",
              borderRadius: 10,
              padding: "12px 14px",
              color: "#ff453a",
              fontSize: 12,
              fontWeight: 500,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 16
            }}>
              <strong style={{ fontWeight: 700 }}>⚠️ Достигнут тарифный лимит сотрудников ({originalTeam.length}/3)</strong>
              Превышен лимит тарифа: в команду можно добавить не более 3 сотрудников. Пожалуйста, обратитесь в поддержку для расширения лимитов.
            </div>
          ) : (
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
              Создайте учетную запись для тренера или администратора вашей студии. Лимит команды: <strong>{originalTeam.length} из 3 сотрудников</strong>.
            </div>
          )}

          <form onSubmit={handleRegisterStaff} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label="ФИО сотрудника" value={staffName} onChange={setStaffName} placeholder="Например: Иван Иванов" disabled={limitReached || registering} />
            <Input label="Телефон (Россия)" value={staffPhone} onChange={handlePhoneChange} placeholder="+7 (999) 000-00-00" disabled={limitReached || registering} />
            <Input label="Email сотрудника (Логин)" type="email" value={staffEmail} onChange={setStaffEmail} placeholder="staff@mystudio.ru" disabled={limitReached || registering} />
            <Input label="Пароль для входа" type="password" value={staffPassword} onChange={setStaffPassword} placeholder="Не менее 6 символов" disabled={limitReached || registering} />

            {regError && (
              <div style={{ fontSize: 12, color: "#ff453a", fontWeight: 600, background: "rgba(255, 69, 58, 0.15)", padding: "8px 12px", borderRadius: 8 }}>
                {regError}
              </div>
            )}
            
            {regSuccess && (
              <div style={{ fontSize: 12, color: "#30d158", fontWeight: 600, background: "rgba(48, 209, 88, 0.15)", padding: "8px 12px", borderRadius: 8 }}>
                {regSuccess}
              </div>
            )}

            <div style={{ marginTop: 8 }}>
              <Btn 
                color="blue" 
                type="submit" 
                disabled={limitReached || registering} 
                style={{ width: "100%", justifyContent: "center", opacity: (limitReached || registering) ? 0.6 : 1 }}
              >
                {registering ? "Регистрация..." : <><Plus size={15}/> Добавить сотрудника</>}
              </Btn>
            </div>
          </form>
        </div>

        {/* TEAM MEMBERS DIRECTORY */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>
            📋 Профиль Команды ({originalTeam.length} из 3)
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {originalTeam.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 13, fontStyle: "italic" }}>
                В команде пока нет ни одного сотрудника
              </div>
            ) : (
              originalTeam.map(t => (
                <div key={t.id} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "rgba(0,113,227,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      color: "#0071e3",
                      fontWeight: 700
                    }}>
                      {t.name[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{t.phone} · {t.email}</div>
                    </div>
                  </div>
                  <div>
                    <button onClick={() => handleRemoveStaff(t.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 6 }} className="hover:text-red-500" title="Удалить">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRuPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  let formatted = "+7 (";
  if (digits.startsWith("7") || digits.startsWith("8")) {
    const main = digits.slice(1);
    if (main.length > 0) formatted += main.slice(0, 3);
    if (main.length > 3) formatted += ") " + main.slice(3, 6);
    if (main.length > 6) formatted += "-" + main.slice(6, 8);
    if (main.length > 8) formatted += "-" + main.slice(8, 10);
  } else {
    formatted += digits.slice(0, 3);
    if (digits.length > 3) formatted += ") " + digits.slice(3, 6);
    if (digits.length > 6) formatted += "-" + digits.slice(6, 8);
    if (digits.length > 8) formatted += "-" + digits.slice(8, 10);
  }
  return formatted.slice(0, 18);
}
