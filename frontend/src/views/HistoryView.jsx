/**
 * HistoryView.jsx
 *
 * Paginated list of all past applications with search + status filter.
 * Clicking a row opens ApplicationDetail.
 */

import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { ApplicationDetail } from "./ApplicationDetail";

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HistoryView({ refreshKey }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // opened application

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listApplications();
      setApps(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // If a detail is open, show it
  if (selected) {
    return (
      <ApplicationDetail
        app={selected}
        onBack={() => {
          setSelected(null);
          load(); // refresh list after potential edits
        }}
        onDeleted={() => {
          setSelected(null);
          load();
        }}
      />
    );
  }

  // Filter
  const filtered = apps.filter((a) => {
    const matchStatus =
      statusFilter === "all" || a.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (a.organization_name || "").toLowerCase().includes(q) ||
      (a.role || "").toLowerCase().includes(q) ||
      (a.url || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div>
      <div className="history-header">
        <h1>Application History</h1>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {apps.length} record{apps.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filters */}
      <div className="filter-row">
        <input
          id="history-search"
          className="form-input"
          type="text"
          placeholder="Search by org, role, or URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          id="status-filter"
          className="form-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="responded">Responded</option>
          <option value="rejected">Rejected</option>
          <option value="accepted">Accepted</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="banner banner-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="spinner-wrap">
          <div className="spinner" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <p>
            {apps.length === 0
              ? "No applications yet. Generate your first one!"
              : "No applications match your filters."}
          </p>
        </div>
      )}

      {/* Application list */}
      {!loading && filtered.length > 0 && (
        <div className="app-list">
          {filtered.map((a) => (
            <div
              key={a.id}
              className="app-card"
              id={`app-card-${a.id}`}
              onClick={() => setSelected(a)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelected(a)}
              aria-label={`Open application for ${a.organization_name || a.url}`}
            >
              <div className="app-card-left">
                <div className="app-card-org">
                  {a.organization_name || "Unnamed organization"}
                </div>
                {a.role && (
                  <div className="app-card-role">{a.role}</div>
                )}
                <div className="app-card-url">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {a.url}
                  </a>
                </div>
              </div>
              <div className="app-card-right">
                <StatusBadge status={a.status} />
                <div className="app-card-date">{fmt(a.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
