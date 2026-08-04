"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, CheckCircle2, Cloud, LogOut, ShieldCheck } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function AuthPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const configured = isSupabaseConfigured();
  useEffect(() => {
    const client = createClient();
    if (!client) return;
    client.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn() {
    const client = createClient();
    if (!client) return;
    setLoading(true);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}${basePath}/auth/callback/` } });
    setLoading(false);
  }
  async function signOut() { const client = createClient(); if (!client) return; await client.auth.signOut(); setUser(null); }

  if (user) return <div className="auth-card auth-success"><div className="auth-icon"><CheckCircle2 size={29} /></div><span className="section-kicker">Sessão protegida</span><h2>Você está conectado.</h2><p>{user.user_metadata.full_name || user.email}. Abra o Journal para unir os torneios deste dispositivo ao backup privado e criar links agregados revogáveis.</p><div className="auth-actions"><Link href="/journal" className="button">Abrir Journal <ArrowLeft className="arrow-forward" size={15} /></Link><button className="button-secondary" onClick={signOut}><LogOut size={15} /> Sair</button></div></div>;

  return <div className="auth-card"><div className="auth-icon"><Cloud size={29} /></div><span className="section-kicker">Google OAuth / Supabase</span><h2>Seu histórico, em todos os dispositivos.</h2><p>O login é opcional. Ele servirá para sincronizar torneios, manter tudo privado e criar links somente leitura que podem ser revogados.</p><ul className="auth-benefits"><li><ShieldCheck size={16} /> Privado por padrão com Row Level Security</li><li><Cloud size={16} /> Sincronização usando o plano gratuito</li><li><CheckCircle2 size={16} /> Sem senha adicional para lembrar</li></ul>{configured ? <button className="google-button" onClick={signIn} disabled={loading}><span>G</span>{loading ? "Redirecionando…" : "Continuar com Google"}</button> : <div className="config-notice"><strong>Integração pronta para configurar</strong><p>Preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> em <code>apps/web/.env.local</code>, aplique a migration e habilite Google no painel do Supabase.</p></div>}<Link href="/journal" className="continue-local">Continuar somente neste dispositivo</Link></div>;
}
