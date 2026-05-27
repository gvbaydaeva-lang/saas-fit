import React from "react";

/** Показывается вместо белого экрана, если VITE_* не попали в бандл. */
export default function SupabaseConfigScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
        background: "#f5f5f7",
        color: "#1d1d1f",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          background: "#fff",
          borderRadius: 16,
          padding: 28,
          border: "1px solid #d2d2d7",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          Supabase не подключён
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "#515154", marginBottom: 16 }}>
          В собранном сайте не встроены <code>VITE_SUPABASE_URL</code> или ключ клиента{" "}
          (<code>VITE_SUPABASE_ANON_KEY</code> / <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>). Добавьте секреты в GitHub и пересоберите проект через Actions (ключи вида{" "}
          <code className="text-xs">sb_publishable_…</code> поддерживаются).
        </p>
        <ol style={{ fontSize: 14, lineHeight: 1.6, color: "#515154", paddingLeft: 20 }}>
          <li>
            Repository → <strong>Settings</strong> → <strong>Secrets and variables</strong> →{" "}
            <strong>Actions</strong> → <strong>New repository secret</strong>
          </li>
          <li>
            <code>VITE_SUPABASE_URL</code> — Project URL из Supabase (Settings → API)
          </li>
          <li>
            <code>VITE_SUPABASE_ANON_KEY</code> или <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> — publishable / anon из Supabase (Settings → API keys)
          </li>
          <li>
            <strong>Settings → Pages</strong> → Source: <strong>GitHub Actions</strong>
          </li>
          <li>Сделайте push в <code>main</code> или перезапустите workflow Deploy to GitHub Pages</li>
        </ol>
      </div>
    </div>
  );
}
