import type { Metadata } from "next";
import { AuthPanel } from "@/components/journal/auth-panel";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default function LoginPage() {
  return <div className="auth-page"><div className="auth-decoration" aria-hidden="true"><span /><span /><span /></div><AuthPanel /></div>;
}
