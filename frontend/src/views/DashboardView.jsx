/**
 * DashboardView.jsx
 *
 * Main dashboard page containing all 4 widgets:
 *   A: Create New Application form
 *   B: CV Context Status card
 *   C: Generated Email Draft output
 *   D: Application History table
 */

import { useState, useEffect, useCallback } from "react";
import {
  Globe, Briefcase, User, Sparkles, Loader2,
  CheckCircle2, Copy, Eye, Trash2, Pencil,
  RefreshCw, BookOpen, Zap, Database,
  AlertTriangle, Check, History as HistoryIcon, Mail, Image, UploadCloud,
} from "lucide-react";
import { api } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { ApplicationDetail } from "./ApplicationDetail";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function truncate(str, n = 48) {
  if (!str) return "—";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

// ── Widget A input field ──────────────────────────────────────────────────────
function InputField({ id, label, placeholder, value, onChange, icon: Icon, type = "text", disabled }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Icon size={15} />
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl
                     text-slate-800 placeholder-slate-400 outline-none
                     focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                     disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function DashboardView({ onSaved }) {

  // Form state
  const [inputMode, setInputMode] = useState("url"); // "url" | "image"
  const [url,  setUrl]  = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [role, setRole] = useState("");

  // Generation state
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [draft,       setDraft]       = useState(null);
  const [emailText,   setEmailText]   = useState("");
  const [orgName,     setOrgName]     = useState("");
  const [culture,     setCulture]     = useState(null); // ACADEMIC | STARTUP | CORPORATE

  // Save state
  const [saving,       setSaving]       = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(null);
  const [copied,       setCopied]       = useState(false);

  // History state
  const [apps,          setApps]    = useState([]);
  const [histLoading,   setHistLoading] = useState(true);
  const [histError,     setHistError]   = useState(null);
  const [selectedApp,   setSelectedApp] = useState(null); // app opened for editing

  // ── Load history ──
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    setHistError(null);
    try {
      const data = await api.listApplications();
      setApps(data);
    } catch (err) {
      setHistError(err.message);
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Generate ──
  async function handleGenerate() {
    if (inputMode === "url" && !url.trim()) return;
    if (inputMode === "image" && !imageFile) return;

    setLoading(true);
    setError(null);
    setSavedFeedback(null);
    setDraft(null);
    setEmailText("");
    setOrgName("");
    setCulture(null);
    try {
      const result = inputMode === "url" 
        ? await api.generate(url.trim(), role.trim() || null)
        : await api.generateFromImage(imageFile, role.trim() || null);
        
      setDraft(result);
      setEmailText(result.generated_email);
      setOrgName(result.organization_name || "");
      if (result.culture) setCulture(result.culture);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Save ──
  async function handleSave() {
    if (!draft || !emailText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveApplication({
        url: draft.url,
        role: draft.role || null,
        organization_name: orgName || null,
        generated_email: draft.generated_email,
        final_email: emailText,
        status: "draft",
      });
      setSavedFeedback("Saved to history!");
      onSaved?.();
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Copy ──
  async function handleCopy() {
    await navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Discard ──
  function handleDiscard() {
    setDraft(null);
    setEmailText("");
    setOrgName("");
    setError(null);
    setSavedFeedback(null);
    setCulture(null);
  }

  // ── Delete history row ──
  async function handleDelete(id, e) {
    e.stopPropagation();
    try {
      await api.deleteApplication(id);
      setApps((prev) => prev.filter((a) => a.id !== id));
    } catch { /* silent */ }
  }

  const cultureColors = {
    ACADEMIC:  "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
    STARTUP:   "bg-amber-50  text-amber-700  ring-1 ring-amber-200",
    CORPORATE: "bg-slate-100 text-slate-700  ring-1 ring-slate-300",
  };

  // ── Edit view early-return ──
  if (selectedApp) {
    return (
      <ApplicationDetail
        app={selectedApp}
        onBack={() => { setSelectedApp(null); loadHistory(); }}
        onDeleted={() => { setSelectedApp(null); loadHistory(); }}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Row 1: Form + CV Status ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Widget A — Create New Application */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 border border-slate-100">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
              <Sparkles size={14} className="text-blue-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Create New Application</h2>
          </div>

          <div className="space-y-4">
            
            {/* Input Mode Toggle */}
            <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
              <button
                onClick={() => setInputMode("url")}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  inputMode === "url" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Globe size={15} /> URL
              </button>
              <button
                onClick={() => setInputMode("image")}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  inputMode === "image" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Image size={15} /> Upload Poster
              </button>
            </div>

            {inputMode === "url" ? (
              <InputField
                id="target-url"
                label="Target Organization URL"
                placeholder="https://example-lab.edu/careers"
                value={url}
                onChange={setUrl}
                icon={Globe}
                type="url"
                disabled={loading}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Target Organization Poster
                </label>
                <div 
                  className={`relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl transition-all ${
                    imageFile ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <input 
                    type="file" 
                    accept="image/*"
                    disabled={loading}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) setImageFile(e.target.files[0]);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                  />
                  {imageFile ? (
                    <div className="flex flex-col items-center gap-2 pointer-events-none">
                      <CheckCircle2 className="text-blue-500" size={24} />
                      <span className="text-sm font-medium text-slate-700">{imageFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 pointer-events-none text-slate-400">
                      <UploadCloud size={28} />
                      <span className="text-sm">Click or drag image to upload</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <InputField
              id="role-input"
              label="Target Internship Role"
              placeholder="e.g. AI Research Intern"
              value={role}
              onChange={setRole}
              icon={Briefcase}
              disabled={loading}
            />
            <InputField
              id="contact-info"
              label="Your Contact Info Override (optional)"
              placeholder="Leave blank to use ingested CV contact"
              value=""
              onChange={() => {}}
              icon={User}
              disabled={loading}
            />
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              id="generate-btn"
              onClick={handleGenerate}
              disabled={loading || (inputMode === "url" ? !url.trim() : !imageFile)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                         bg-blue-600 text-white shadow-sm hover:bg-blue-700
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
                : <><Sparkles size={15} /> Generate Email</>
              }
            </button>
            {loading && (
              <p className="text-xs text-slate-400 animate-pulse">
                Scraping page & classifying culture…
              </p>
            )}
          </div>

          {/* Error banner */}
          {error && !draft && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Widget B — CV Context Status */}
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 border border-slate-100 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
              <BookOpen size={14} className="text-emerald-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">CV Context</h2>
          </div>

          {/* Progress */}
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700">CV Completed: 100%</span>
            </div>
            <div className="w-full bg-emerald-200 rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full w-full" />
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-2.5">
            {[
              { icon: Zap,      label: "Projects",  value: "5 Active",         color: "text-blue-500" },
              { icon: Database, label: "Skills",    value: "12 Active",        color: "text-purple-500" },
              { icon: Sparkles, label: "Matching",  value: "Strict",           color: "text-amber-500" },
              { icon: Zap,      label: "Routing",   value: "Agentic (3-way)",  color: "text-emerald-500" },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <Icon size={13} className={color} />
                  {label}
                </div>
                <span className="text-slate-700 font-medium text-xs">{value}</span>
              </div>
            ))}
          </div>

          {/* Culture badge — shown after generation */}
          {culture && (
            <div className={`px-3 py-2 rounded-xl text-xs font-semibold text-center ${cultureColors[culture] ?? "bg-slate-100 text-slate-600"}`}>
              🤖 Routed to: {culture} prompt
            </div>
          )}
        </div>
      </div>

      {/* ── Widget C — Generated Email Draft ─────────────────────────────── */}
      {draft && !loading && (
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 border border-slate-100">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                <Mail size={14} className="text-blue-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-800">Generated Email Draft</h2>
              {orgName && (
                <span className="text-xs text-slate-400 font-normal ml-1">— {orgName}</span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                           bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied!" : "Copy Email"}
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                           border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
              >
                <Eye size={13} />
                View Source
              </button>
              <button
                onClick={handleDiscard}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                           border border-red-200 text-red-500 hover:bg-red-50 transition-all"
              >
                <Trash2 size={13} />
                Discard
              </button>
            </div>
          </div>

          {/* Success feedback */}
          {savedFeedback && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              <CheckCircle2 size={15} />
              {savedFeedback}
            </div>
          )}
          {error && draft && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Email textarea */}
          <textarea
            id="email-body"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            spellCheck
            rows={16}
            className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200
                       text-sm text-slate-800 font-mono leading-relaxed resize-none
                       outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                       transition-all"
          />

          {/* Save row */}
          <div className="mt-4 flex items-center gap-3">
            <button
              id="save-btn"
              onClick={handleSave}
              disabled={saving || !emailText.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                         bg-emerald-600 text-white hover:bg-emerald-700
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : <><CheckCircle2 size={14} /> Save to History</>
              }
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                         border border-slate-200 text-slate-600 hover:bg-slate-50
                         disabled:opacity-50 transition-all"
            >
              <RefreshCw size={14} />
              Regenerate
            </button>
          </div>
        </div>
      )}

      {/* ── Widget D — Application History Table ─────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                <HistoryIcon size={14} className="text-slate-500" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Application History</h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {apps.length} record{apps.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        {histLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : histError ? (
          <div className="flex items-center gap-2 mx-6 my-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
            <AlertTriangle size={15} /> {histError}
          </div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Mail size={32} className="mb-3 opacity-30" />
            <p className="text-sm">No applications yet. Generate your first one!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {["Organization URL", "Role", "Date Generated", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apps.slice(0, 8).map((a, idx) => (
                  <tr
                    key={a.id}
                    className={`border-b border-slate-50 hover:bg-slate-50/80 transition-colors
                      ${idx % 2 === 0 ? "" : "bg-slate-50/30"}`}
                  >
                    <td className="px-5 py-3.5 max-w-[220px]">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium truncate block"
                        title={a.url}
                      >
                        {truncate(a.organization_name || a.url, 40)}
                      </a>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {a.role || <span className="text-slate-300 italic">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                      {fmt(a.created_at)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          title="Edit"
                          onClick={(e) => { e.stopPropagation(); setSelectedApp(a); }}
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
