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
