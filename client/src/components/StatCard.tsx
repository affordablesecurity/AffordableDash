import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  caption?: string;
  onClick?: () => void;
};

function StatCardContent({ label, value, icon: Icon, caption }: Omit<StatCardProps, "onClick">) {
  return (
    <>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {caption && <small>{caption}</small>}
      </div>
      <Icon size={22} aria-hidden="true" />
    </>
  );
}

export function StatCard({ label, value, icon, caption, onClick }: StatCardProps) {
  if (onClick) {
    return (
      <button type="button" className="stat-card stat-card-clickable" onClick={onClick}>
        <StatCardContent label={label} value={value} icon={icon} caption={caption} />
      </button>
    );
  }

  return (
    <section className="stat-card">
      <StatCardContent label={label} value={value} icon={icon} caption={caption} />
    </section>
  );
}
