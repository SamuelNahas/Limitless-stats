import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { manifest } from "@/data/snapshot";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "Limitless Stats — Pokémon TCG Meta",
    template: "%s · Limitless Stats",
  },
  description: "Metagame, decks, matchups e diário competitivo do Pokémon TCG Standard Online.",
  applicationName: "Limitless Stats",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080b12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>
        <AppShell activeFormat={manifest.scope.formatName} activeEra={manifest.scope.eraName}>{children}</AppShell>
      </body>
    </html>
  );
}
