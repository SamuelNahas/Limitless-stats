import { CalendarDays, Radio } from "lucide-react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  dateLabel?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, description, dateLabel, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow"><Radio size={13} /> {eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
        {dateLabel && <div className="date-label"><CalendarDays size={15} /> {dateLabel}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
