/**
 * URL страницы логина после подтверждения email (Supabase emailRedirectTo).
 * При `base: './'` (Netlify и др.) возвращает `{origin}/login`.
 */
export function getEmailRedirectLoginUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = String(import.meta.env.BASE_URL || "/").trim();

  if (raw === "./" || raw === "." || raw === "") {
    return new URL("login", `${window.location.origin}/`).toString();
  }

  const normalized = raw.replace(/^\/+|\/+$/g, "");
  const prefix = normalized ? `${window.location.origin}/${normalized}/` : `${window.location.origin}/`;
  return new URL("login", prefix).toString();
}

/** basename для BrowserRouter при относительном Vite base. */
export function getRouterBasename(): string | undefined {
  const raw = String(import.meta.env.BASE_URL ?? "/").trim();
  if (raw === "./" || raw === "." || raw === "" || raw === "/") {
    return undefined;
  }
  return raw.replace(/\/$/, "") || undefined;
}

function getAppOriginPrefix(): string {
  if (typeof window === "undefined") return "";
  const segment = getRouterBasename();
  return segment ? `${window.location.origin}/${segment}` : window.location.origin;
}

/** Публичная ссылка личного кабинета ученика: /portal/[auth_token] */
export function getPortalUrl(authToken: string): string {
  const token = encodeURIComponent(authToken.trim());
  if (typeof window === "undefined") {
    const base = String(import.meta.env.BASE_URL ?? "/").replace(/^\.\/?/, "").replace(/\/$/, "");
    return base ? `/${base}/portal/${token}` : `/portal/${token}`;
  }
  return `${getAppOriginPrefix()}/portal/${token}`;
}
