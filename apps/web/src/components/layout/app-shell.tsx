"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Layers3, LogIn, Swords } from "lucide-react";
import { Brand } from "./brand";
import { PreferencesProvider } from "./preferences-provider";

const navigation = [
  { href: "/meta", label: "Meta", icon: BarChart3 },
  { href: "/decks", label: "Decks", icon: Layers3 },
  { href: "/matchups", label: "Matchups", icon: Swords },
  { href: "/journal", label: "Journal", icon: BookOpen },
] as const;

export function AppShell({ children, activeFormat, activeEra }: { children: React.ReactNode; activeFormat: string; activeEra: string }) {
  const pathname = usePathname();
  return (
    <PreferencesProvider>
      <div className="app-shell">
        <aside className="sidebar">
          <Brand />
          <nav className="sidebar-nav" aria-label="Navegação principal">
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = (href === "/meta" && pathname === "/") || pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                  <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="sidebar-foot">
            <div className="season-indicator">
              <span className="status-dot" />
              <div><small>{activeFormat.toUpperCase()} ATIVO</small><strong>{activeEra}</strong></div>
            </div>
            <Link href="/login" className="login-link"><LogIn size={17} /> Entrar com e-mail</Link>
          </div>
        </aside>
        <header className="mobile-header">
          <Brand />
          <Link href="/login" className="icon-button" aria-label="Entrar"><LogIn size={19} /></Link>
        </header>
        <main className="app-content">{children}</main>
        <nav className="bottom-nav" aria-label="Navegação móvel">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = (href === "/meta" && pathname === "/") || pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                <Icon size={21} strokeWidth={active ? 2.3 : 1.7} /><span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </PreferencesProvider>
  );
}
