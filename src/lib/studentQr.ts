export const STUDENT_QR_PREFIX = "fitcrm-student-";

export function studentQrPayload(studentId: number) {
  return `${STUDENT_QR_PREFIX}${studentId}`;
}

export function parseStudentIdFromQr(text: string): number | null {
  const t = text.trim();
  const m = new RegExp(`^${STUDENT_QR_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`, "i").exec(t);
  if (m) return parseInt(m[1], 10);
  if (/^\d{10,}$/.test(t)) return parseInt(t, 10);
  try {
    const j = JSON.parse(t) as { student_id?: number | string };
    const sid = j.student_id;
    if (typeof sid === "number" && Number.isFinite(sid)) return sid;
    if (typeof sid === "string" && /^\d+$/.test(sid)) return parseInt(sid, 10);
  } catch {
    /* ignore */
  }
  return null;
}
