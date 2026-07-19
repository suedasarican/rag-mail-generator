/**
 * HistoryView.jsx — Full application history page (sidebar → History nav item).
 * Uses Tailwind CSS.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Search, Filter, Loader2, Mail, Pencil, Trash2,
  ExternalLink, AlertTriangle, ChevronDown,
} from "lucide-react";
import { api } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { ApplicationDetail } from "./ApplicationDetail";

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function HistoryView({ refreshKey }) {
  const [apps,         setApps]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [selected,     setSelected]     = useState(null);
  const [search,       setSearch]       = useState("");
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

  useEffect(() => { load(); }, [load, refreshKey]);

  async function handleDelete(id, e) {
    e.stopPropagation();
    try {
      await api.deleteApplication(id);
      setApps((prev) => prev.filter((a) => a.id !== id));
    } catch { /* silent */ }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await api.updateApplication(id, { status: newStatus });
      setApps((prev) => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    } catch (err) {
      setError("Failed to update status: " + err.message);
    }
  }

  if (selected) {
    return (
      <ApplicationDetail
        app={selected}
        onBack={() => { setSelected(null); load(); }}
        onDeleted={() => { setSelected(null); load(); }}
      />
    );
  }

  const filtered = apps.filter((a) => {
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (a.organization_name || "").toLowerCase().includes(q) ||
      (a.role || "").toLowerCase().includes(q) ||
      (a.url || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div className="max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Application History</h1>
          <p className="text-sm text-slate-400 mt-0.5">{apps.length} record{apps.length !== 1 ? "s" : ""} total</p>
        </div>
      </div>

      {/* Dashboard Panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Toplam Başvuru", count: apps.length, color: "from-pink-400 to-rose-400" },
          { label: "Gönderilen", count: apps.filter(a => a.status === "sent").length, color: "from-purple-400 to-indigo-400" },
          { label: "Onaylanan", count: apps.filter(a => a.status === "accepted").length, color: "from-fuchsia-400 to-pink-500" },
          { label: "Reddedilen", count: apps.filter(a => a.status === "rejected").length, color: "from-rose-500 to-red-500" },
        ].map((stat, i) => (
          <div key={i} className={`p-4 rounded-3xl shadow-lg bg-gradient-to-br ${stat.color} text-white flex flex-col justify-center items-center transform hover:scale-105 transition-transform`}>
            <span className="text-3xl font-black drop-shadow-md">{stat.count}</span>
            <span className="text-sm font-medium opacity-90">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="history-search"
            type="text"
            placeholder="Search by org, role, or URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl
                       text-slate-800 placeholder-slate-400 outline-none
                       focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
          />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-8 pr-8 py-2.5 text-sm bg-white border border-slate-200 rounded-xl
                       text-slate-700 outline-none appearance-none cursor-pointer
                       focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
          >
            {["all","draft","sent","responded","rejected","accepted"].map((s) => (
              <option key={s} value={s}>{s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Table card */}
      <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={22} className="animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Mail size={36} className="mb-3 opacity-25" />
            <p className="text-sm">
              {apps.length === 0
                ? "No applications yet. Generate your first one!"
                : "No applications match your filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {["Organization / URL", "Role", "Date Generated", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, idx) => (
                  <tr
                    key={a.id}
                    id={`app-row-${a.id}`}
                    onClick={() => setSelected(a)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(a)}
                    aria-label={`Open application for ${a.organization_name || a.url}`}
                    className={`border-b border-slate-50 cursor-pointer hover:bg-blue-50/30 transition-colors
                      ${idx % 2 === 0 ? "" : "bg-slate-50/20"}`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800 truncate max-w-[200px]">
                        {a.organization_name || "—"}
                      </p>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-0.5 truncate max-w-[200px]"
                      >
                        <ExternalLink size={11} />
                        {a.url}
                      </a>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {a.role || <span className="text-slate-300 italic text-xs">—</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-500 text-xs whitespace-nowrap">
                      {fmt(a.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={a.status}
                        onChange={(e) => handleStatusChange(a.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white border-2 border-pink-200 text-pink-600 font-bold rounded-full px-3 py-1 text-xs outline-none focus:ring-2 focus:ring-pink-400 shadow-sm transition-all cursor-pointer hover:bg-pink-50"
                      >
                        <option value="draft">Draft</option>
                        <option value="sent">Gönderildi (Sent)</option>
                        <option value="accepted">Onaylandı (Approved)</option>
                        <option value="rejected">Reddedildi (Rejected)</option>
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          title="Edit"
                          onClick={() => setSelected(a)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          title="Delete"
                          onClick={(e) => handleDelete(a.id, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
