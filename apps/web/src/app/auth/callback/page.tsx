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
      const code = new URL(window.location.href).searchParams.get("code");
      const client = createClient();
      if (!code || !client) { setStatus("error"); return; }
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) { setStatus("error"); return; }
      setStatus("success");
      window.setTimeout(() => router.replace("/journal"), 700);
    }
    void finishLogin();
  }, [router]);

  return <div className="auth-page"><div className="auth-card callback-card">{status === "loading" ? <><div className="auth-icon"><LoaderCircle className="spin" size={28} /></div><h2>Protegendo sua sessão…</h2><p>Concluindo o login com Google.</p></> : status === "success" ? <><div className="auth-icon"><CheckCircle2 size={28} /></div><h2>Login concluído.</h2><p>Redirecionando para o seu Journal.</p></> : <><div className="auth-icon auth-error-icon"><TriangleAlert size={28} /></div><h2>Não foi possível entrar.</h2><p>O código expirou ou a configuração do Supabase ainda não está completa.</p><Link href="/login" className="button">Tentar novamente</Link></>}</div></div>;
}
