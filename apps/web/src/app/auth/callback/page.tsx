"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    async function finishLogin() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const client = createClient();
      if (!client || (!code && !tokenHash)) { setStatus("error"); return; }
      const { error } = code
        ? await client.auth.exchangeCodeForSession(code)
        : await client.auth.verifyOtp({ token_hash: tokenHash as string, type: "email" });
      if (error) { setStatus("error"); return; }
      setStatus("success");
      window.setTimeout(() => router.replace("/journal"), 700);
    }
    void finishLogin();
  }, [router]);

  return <div className="auth-page"><div className="auth-card callback-card">{status === "loading" ? <><div className="auth-icon"><LoaderCircle className="spin" size={28} /></div><h2>Protegendo sua sessão…</h2><p>Validando o link enviado por e-mail.</p></> : status === "success" ? <><div className="auth-icon"><CheckCircle2 size={28} /></div><h2>Login concluído.</h2><p>Redirecionando para o seu Journal.</p></> : <><div className="auth-icon auth-error-icon"><TriangleAlert size={28} /></div><h2>Não foi possível entrar.</h2><p>O link expirou, já foi utilizado ou a configuração do Supabase ainda não está completa.</p><Link href="/login" className="button">Solicitar outro link</Link></>}</div></div>;
}
