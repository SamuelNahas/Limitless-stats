"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function finishLogin() {
      const client = createClient();
      if (!client) {
        if (active) {
          setMessage("O Supabase ainda não está configurado neste deploy.");
          setStatus("error");
        }
        return;
      }

      const url = new URL(window.location.href);
      const queryError = url.searchParams.get("error_description") || url.searchParams.get("error");
      const tokenHash = url.searchParams.get("token_hash");
      const code = url.searchParams.get("code");
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const hashError = hashParams.get("error_description") || hashParams.get("error");

      let authError: { message: string } | null = null;

      if (queryError || hashError) {
        authError = { message: queryError || hashError || "Não foi possível validar o link." };
      } else if (accessToken && refreshToken) {
        const result = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        authError = result.error;
      } else if (tokenHash) {
        const result = await client.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
        authError = result.error;
      } else if (code) {
        const result = await client.auth.exchangeCodeForSession(code);
        authError = result.error
          ? { message: "Este link foi criado pelo fluxo antigo de login e depende do navegador onde foi solicitado. Solicite um novo link para usar o login corrigido." }
          : null;
      } else {
        const { data, error } = await client.auth.getSession();
        authError = error || (data.session ? null : { message: "O link não trouxe uma sessão válida." });
      }

      if (authError) {
        if (active) {
          setMessage(authError.message);
          setStatus("error");
        }
        return;
      }

      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData.session) {
        if (active) {
          setMessage(sessionError?.message || "A sessão foi validada, mas não pôde ser salva neste navegador.");
          setStatus("error");
        }
        return;
      }

      window.history.replaceState({}, document.title, `${url.pathname}${url.searchParams.has("code") ? "" : url.search}`);

      if (active) {
        setStatus("success");
        window.setTimeout(() => router.replace("/journal"), 500);
      }
    }

    void finishLogin();
    return () => { active = false; };
  }, [router]);

  return (
    <div className="auth-page">
      <div className="auth-card callback-card">
        {status === "loading" ? (
          <>
            <div className="auth-icon"><LoaderCircle className="spin" size={28} /></div>
            <h2>Protegendo sua sessão…</h2>
            <p>Validando o link enviado por e-mail e salvando o acesso neste navegador.</p>
          </>
        ) : status === "success" ? (
          <>
            <div className="auth-icon"><CheckCircle2 size={28} /></div>
            <h2>Login concluído.</h2>
            <p>Sessão salva. Redirecionando para o seu Journal.</p>
          </>
        ) : (
          <>
            <div className="auth-icon auth-error-icon"><TriangleAlert size={28} /></div>
            <h2>Não foi possível entrar.</h2>
            <p>{message || "O link expirou, já foi utilizado ou a configuração do Supabase ainda não está completa."}</p>
            <Link href="/login" className="button">Solicitar outro link</Link>
          </>
        )}
      </div>
    </div>
  );
}
