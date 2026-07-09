/**
 * StatusBadge.jsx — pill-shaped status indicator using Tailwind.
 */

const BADGE_STYLES = {
  draft:     "bg-blue-50    text-blue-700   ring-1 ring-blue-200",
  generated: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  sent:      "bg-violet-50  text-violet-700  ring-1 ring-violet-200",
  responded: "bg-amber-50   text-amber-700   ring-1 ring-amber-200",
  rejected:  "bg-red-50     text-red-600     ring-1 ring-red-200",
  accepted:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};

const DOTS = {
  draft:     "bg-blue-400",
  generated: "bg-emerald-400",
  sent:      "bg-violet-400",
  responded: "bg-amber-400",
  rejected:  "bg-red-400",
  accepted:  "bg-emerald-400",
};

export function StatusBadge({ status = "draft" }) {
  const key   = status.toLowerCase();
  const style = BADGE_STYLES[key] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  const dot   = DOTS[key]   ?? "bg-slate-400";
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
