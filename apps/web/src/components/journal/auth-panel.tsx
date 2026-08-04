"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, CheckCircle2, Cloud, LogOut, Mail, ShieldCheck } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function AuthPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const configured = isSupabaseConfigured();
  useEffect(() => {
    const client = createClient();
    if (!client) return;
    client.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    const client = createClient();
    if (!client) return;
    setLoading(true);
    setError("");
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const { error: signInError } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}${basePath}/auth/callback/`,
        shouldCreateUser: true,
      },
    });
    if (signInError) setError(signInError.message);
    else setSent(true);
    setLoading(false);
  }
  async function signOut() { const client = createClient(); if (!client) return; await client.auth.signOut(); setUser(null); }

  if (user) return <div className="auth-card auth-success"><div className="auth-icon"><CheckCircle2 size={29} /></div><span className="section-kicker">Sessão protegida</span><h2>Você está conectado.</h2><p>{user.email}. Abra o Journal para unir os torneios deste dispositivo ao backup privado e criar links agregados revogáveis.</p><div className="auth-actions"><Link href="/journal" className="button">Abrir Journal <ArrowLeft className="arrow-forward" size={15} /></Link><button className="button-secondary" onClick={signOut}><LogOut size={15} /> Sair</button></div></div>;

  return <div className="auth-card"><div className="auth-icon"><Cloud size={29} /></div><span className="section-kicker">E-mail / Supabase</span><h2>Seu histórico, em todos os dispositivos.</h2><p>Receba um link de acesso no e-mail. Não há senha nem dependência do Google Cloud.</p><ul className="auth-benefits"><li><ShieldCheck size={16} /> Privado por padrão com Row Level Security</li><li><Cloud size={16} /> Sincronização usando o plano gratuito</li><li><CheckCircle2 size={16} /> Link de acesso sem senha</li></ul>{configured ? sent ? <div className="email-sent"><Mail size={22} /><strong>Confira seu e-mail</strong><p>Enviamos um link para <span>{email}</span>. Você pode fechar esta tela depois de abrir a mensagem.</p><button className="button-ghost" onClick={() => { setSent(false); setError(""); }}>Usar outro e-mail</button></div> : <form className="email-login-form" onSubmit={signIn}><label htmlFor="login-email">Seu e-mail</label><input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" required /><button className="button" disabled={loading || !email.trim()}><Mail size={16} /> {loading ? "Enviando…" : "Enviar link de acesso"}</button>{error ? <p className="login-error" role="alert">{error}</p> : null}</form> : <div className="config-notice"><strong>Integração pronta para configurar</strong><p>Preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> em <code>apps/web/.env.local</code> e aplique a migration. Nunca use uma chave <code>sb_secret_</code> no site.</p></div>}<Link href="/journal" className="continue-local">Continuar somente neste dispositivo</Link></div>;
}
