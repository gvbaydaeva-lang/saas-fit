import React from "react";
import { Link, useLocation } from "react-router-dom";

/** После регистрации, пока пользователь не подтвердил email в Supabase. */
export default function PendingVerificationPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#d2d2d7]/60 p-8 text-center">
        <h1 className="text-xl font-semibold mb-2">Проверьте почту</h1>
        <p className="text-sm text-[#515154] leading-relaxed mb-2">
          Мы отправили письмо с ссылкой для подтверждения на адрес:
        </p>
        {email ? (
          <p className="text-sm font-medium text-[#0071e3] break-all mb-4">{email}</p>
        ) : (
          <p className="text-sm text-[#86868b] mb-4">указанный при регистрации email</p>
        )}
        <p className="text-xs text-[#86868b] mb-6 leading-relaxed">
          Пожалуйста, проверьте вашу почту и перейдите по ссылке для подтверждения аккаунта, прежде чем войти.
          После подтверждения вы сможете войти с тем же email и паролем.
        </p>
        <Link
          to="/login"
          className="inline-block w-full rounded-xl bg-[#0071e3] text-white font-semibold py-3 hover:bg-[#0077ed] transition-colors text-center"
        >
          Перейти ко входу
        </Link>
        <Link to="/" className="mt-4 block text-sm text-[#86868b] hover:text-[#1d1d1f]">
          ← На главную (CRM)
        </Link>
      </div>
    </div>
  );
}
