/**
 * StatusBadge.jsx — A small colored chip that shows application status.
 */

const DOT_MAP = {
  draft: "●",
  sent: "●",
  responded: "●",
  rejected: "●",
  accepted: "●",
};

export function StatusBadge({ status }) {
  const s = (status || "draft").toLowerCase();
  return (
    <span className={`status-badge status-${s}`}>
      {DOT_MAP[s] || "●"} {s}
    </span>
  );
}
