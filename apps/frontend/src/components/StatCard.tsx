import type { LucideIcon } from "lucide-react";

type StatCardProps = { label: string; value: string | number; helper: string; icon: LucideIcon; tone: "blue" | "violet" | "amber" | "green" };

export default function StatCard({ label, value, helper, icon: Icon, tone }: StatCardProps) {
  return <article className="stat-card flex min-w-0 items-center gap-3 rounded-xl"><div className={`stat-icon stat-${tone} flex shrink-0 items-center justify-center`}><Icon size={21} /></div><div className="stat-copy flex min-w-0 flex-col"><span>{label}</span><strong>{value}</strong><small>{helper}</small></div></article>;
}
