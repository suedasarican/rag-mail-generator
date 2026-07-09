/**
 * ApplicationDetail.jsx — Full-page detail / edit view for a single application.
 * Tailwind CSS.
 */

import { useState } from "react";
import {
  ArrowLeft, Loader2, CheckCircle2, Trash2,
  AlertTriangle, ExternalLink, Clock,
} from "lucide-react";
import { api } from "../api";
import { StatusBadge } from "../components/StatusBadge";

const STATUSES = ["draft", "sent", "responded", "rejected", "accepted"];

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ApplicationDetail({ app: initial, onBack, onDeleted }) {
  const [app,          setApp]          = useState(initial);
  const [emailText,    setEmailText]    = useState(initial.final_email || "");
  const [orgName,      setOrgName]      = useState(initial.organization_name || "");
  const [status,       setStatus]       = useState(initial.status || "draft");
  const [saving,       setSaving]       = useState(false);
  const [savedFeedback,setSavedFeedback]= useState(null);
  const [error,        setError]        = useState(null);
  const [confirmDelete,setConfirmDelete]= useState(false);

  async function handleUpdate() {
    setSaving(true);
    setError(null);
    setSavedFeedback(null);
    try {
      const updated = await api.updateApplication(app.id, {
        final_email: emailText,
        organization_name: orgName,
        status,
      });
      setApp(updated);
      setSavedFeedback("Changes saved!");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await api.deleteApplication(app.id);
      onDeleted?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-4xl space-y-5">

      {/* Back header */}
      <div className="flex items-start gap-4">
        <button
          id="back-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                     border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all mt-0.5"
        >
          <ArrowLeft size={15} /> Back to History
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">
            {app.organization_name || "Untitled Application"}
          </h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
            {app.role && <span className="text-slate-600 font-medium">{app.role}</span>}
            {app.role && <span>·</span>}
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline"
            >
              <ExternalLink size={12} /> {app.url}
            </a>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Edit card */}
      <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-slate-100 p-6 space-y-5">

        {/* Meta */}
        <div className="flex items-center gap-5 text-xs text-slate-400 pb-4 border-b border-slate-100">
          <span className="flex items-center gap-1.5"><Clock size={12} /> Created: {fmt(app.created_at)}</span>
          <span className="flex items-center gap-1.5"><Clock size={12} /> Updated: {fmt(app.updated_at)}</span>
        </div>

        {/* Feedback / error */}
        {savedFeedback && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
            <CheckCircle2 size={15} /> {savedFeedback}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {confirmDelete && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <strong>Are you sure?</strong>&nbsp;Click "Delete" again to confirm — this cannot be undone.
          </div>
        )}

        {/* Org name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="org-name-input" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Organization
          </label>
          <input
            id="org-name-input"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization name"
            className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl
                       text-slate-800 placeholder-slate-400 outline-none
                       focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
          />
        </div>

        {/* Status picker */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Status
          </label>
          <select
            id="status-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl
                       text-slate-700 outline-none cursor-pointer
                       focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Email body */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email-body" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Email Draft
          </label>
          <textarea
            id="email-body"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            rows={16}
            spellCheck
            placeholder="Email draft…"
            className="px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200
                       text-sm text-slate-800 font-mono leading-relaxed resize-none
                       outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
          <button
            id="save-btn"
            onClick={handleUpdate}
            disabled={saving || !emailText.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                       bg-blue-600 text-white hover:bg-blue-700
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : <><CheckCircle2 size={14} /> Save Changes</>
            }
          </button>
          <button
            id="delete-btn"
            onClick={handleDelete}
            className="flex items-center gap-2 ml-auto px-4 py-2.5 rounded-xl text-sm font-semibold
                       border border-red-200 text-red-500 hover:bg-red-50 transition-all"
          >
            <Trash2 size={14} />
            {confirmDelete ? "Confirm Delete" : "Delete"}
          </button>
        </div>
      </div>

      {/* Original AI draft (read-only) */}
      {app.generated_email && app.generated_email !== app.final_email && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 transition-colors py-1 select-none">
            ▸ Show original AI-generated draft (unedited)
          </summary>
          <div className="mt-3 bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-slate-100 p-5">
            <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap leading-relaxed">
              {app.generated_email}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}
