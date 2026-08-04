import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "violet" | "cyan" | "green" | "orange";
};

export function StatCard({ label, value, detail, icon: Icon, tone = "violet" }: StatCardProps) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-icon"><Icon size={20} /></div>
      <span>{label}</span><strong>{value}</strong><small>{detail}</small>
    </article>
  );
}
