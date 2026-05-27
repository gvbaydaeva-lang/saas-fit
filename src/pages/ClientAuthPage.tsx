import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  loginWithEmail,
  registerWithEmailPhone,
} from "../lib/clientAuth";
import { maskPhoneInput } from "../lib/phone";
import { supabaseConfigured } from "../lib/supabase";

export default function ClientAuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");

    const em = email.trim();
    if (!em) {
      setError("Укажите email");
      return;
    }
    if (!password.trim()) {
      setError("Укажите пароль");
      return;
    }

    if (!supabaseConfigured) {
      setError(
        "Supabase не настроен: добавьте в .env (или в GitHub Secrets при сборке) VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY."
      );
      return;
    }

    if (mode === "register") {
      if (!phone.trim()) {
        setError("Укажите номер телефона");
        return;
      }
      if (!consent) {
        setError("Необходимо согласие на обработку персональных данных");
        return;
      }
      if (password.length < 6) {
        setError("Пароль должен быть не короче 6 символов");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "register") {
        await registerWithEmailPhone(em, phone, password);
        setInfo(
          "Регистрация отправлена. Если в проекте Supabase включено подтверждение почты — откройте письмо и перейдите по ссылке, затем войдите с этим же email и паролем."
        );
        setMode("login");
      } else {
        await loginWithEmail(em, password);
        navigate("/dashboard", { replace: true });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Ошибка авторизации. Проверьте данные или попробуйте позже.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#d2d2d7]/60 p-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Личный кабинет</h1>
        <p className="text-sm text-[#86868b] mb-6">
          {mode === "login"
            ? "Вход по email и паролю"
            : "Регистрация: email, телефон из списка студии и пароль"}
        </p>

        {!supabaseConfigured && (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
            Ключи Supabase не подставлены при сборке. Скопируйте{" "}
            <code className="text-xs">.env.example</code> → <code className="text-xs">.env</code> локально или
            задайте секреты в GitHub Actions.
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-base outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
              required
            />
          </label>

          {mode === "register" && (
            <label className="block text-sm font-medium">
              Телефон
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
                placeholder="+7 (___) ___-__-__"
                className="mt-1 w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-base outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
                required
              />
            </label>
          )}

          <label className="block text-sm font-medium">
            Пароль
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              className="mt-1 w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-base outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
              required
            />
          </label>

          {mode === "register" && (
            <label className="flex gap-2 text-sm text-[#515154] items-start">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1"
              />
              <span>Согласен на обработку персональных данных</span>
            </label>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
          {info && (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0071e3] text-white font-semibold py-3 hover:bg-[#0077ed] disabled:opacity-60 transition-colors"
          >
            {loading ? "Подождите…" : mode === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-sm text-[#0071e3] font-medium"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
            setInfo("");
          }}
        >
          {mode === "login" ? "Нет аккаунта? Регистрация" : "Уже есть аккаунт? Войти"}
        </button>

        <p className="mt-6 text-center text-xs text-[#86868b]">
          Главная перенаправляет на вход или кабинет в зависимости от сессии.
        </p>
      </div>
    </div>
  );
}
