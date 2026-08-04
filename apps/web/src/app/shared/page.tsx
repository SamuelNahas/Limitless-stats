import type { Metadata } from "next";
import { SharedProfileViewer } from "@/components/journal/shared-profile-viewer";

export const metadata: Metadata = {
  title: "Perfil compartilhado — Limitless Stats",
  robots: { index: false, follow: false, noarchive: true },
};

export default function SharedProfilePage() {
  return <SharedProfileViewer />;
}
