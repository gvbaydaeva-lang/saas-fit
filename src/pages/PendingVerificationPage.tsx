import React from "react";
import { Link, useLocation } from "react-router-dom";

/** После регистрации, пока пользователь не подтвердил email в Supabase. */
export default function PendingVerificationPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#333333] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#E7EAEE]/60 p-8 text-center">
        <h1 className="text-xl font-semibold mb-2">Проверьте почту</h1>
        <p className="text-sm text-[#515154] leading-relaxed mb-2">
          Мы отправили письмо с ссылкой для подтверждения на адрес:
        </p>
        {email ? (
          <p className="text-sm font-medium text-[#D4A757] break-all mb-4">{email}</p>
        ) : (
          <p className="text-sm text-[#6F7B84] mb-4">указанный при регистрации email</p>
        )}
        <p className="text-xs text-[#6F7B84] mb-6 leading-relaxed">
          Пожалуйста, проверьте вашу почту и перейдите по ссылке для подтверждения аккаунта, прежде чем войти.
          После подтверждения вы сможете войти с тем же email и паролем.
        </p>
        <Link
          to="/login"
          className="inline-block w-full rounded-xl bg-[#D4A757] text-white font-semibold py-3 hover:bg-[#E2B768] transition-colors text-center"
        >
          Перейти ко входу
        </Link>
        <Link to="/" className="mt-4 block text-sm text-[#6F7B84] hover:text-[#333333]">
          ← На главную (CRM)
        </Link>
      </div>
    </div>
  );
}
