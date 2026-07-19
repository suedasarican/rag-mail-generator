/**
 * GenerateView.jsx
 *
 * Default home view: enter a URL + optional role → generate a draft email →
 * review/edit in EmailEditor → save to history.
 */

import { useState } from "react";
import { api } from "../api";
import { EmailEditor } from "../components/EmailEditor";

export function GenerateView({ onSaved }) {
  const [url, setUrl] = useState("");
  const [role, setRole] = useState("");
  const [tone, setTone] = useState("Profesyonel/Kurumsal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Post-generation state
  const [draft, setDraft] = useState(null); // { generated_email, organization_name, url, role }
  const [emailText, setEmailText] = useState("");
  const [orgName, setOrgName] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(null);

  async function handleGenerate() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setSavedFeedback(null);
    setDraft(null);
    setEmailText("");
    setOrgName("");

    try {
      const result = await api.generate(url.trim(), role.trim() || null, tone);
      setDraft(result);
      setEmailText(result.generated_email);
      setOrgName(result.organization_name || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate() {
    if (!draft) return;
    setLoading(true);
    setError(null);
    setSavedFeedback(null);
    try {
      const result = await api.generate(draft.url, draft.role || null, tone);
      setDraft(result);
      setEmailText(result.generated_email);
      setOrgName(result.organization_name || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
      setSavedFeedback("Application saved to history!");
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      handleGenerate();
    }
  }

  return (
    <div>
      {/* Page heading */}
      <div className="generate-header">
        <h1>Generate Application Email</h1>
        <p>Paste a target URL and let the RAG pipeline craft a personalized draft.</p>
      </div>

      {/* Input card */}
      <div className="card">
        <div className="url-row">
          <div className="form-group">
            <label className="form-label" htmlFor="target-url">
              Target URL *
            </label>
            <input
              id="target-url"
              className="form-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://example-lab.edu/careers"
              disabled={loading}
            />
          </div>
          <div className="form-group" style={{ minWidth: "180px" }}>
            <label className="form-label" htmlFor="role-input">
              Role (optional)
            </label>
            <input
              id="role-input"
              className="form-input"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Research Intern"
              disabled={loading}
            />
          </div>
          <div className="form-group" style={{ minWidth: "180px" }}>
            <label className="form-label" htmlFor="tone-input">
              Ses Tonu
            </label>
            <select
              id="tone-input"
              className="form-input"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              disabled={loading}
              style={{ appearance: "auto" }}
            >
              <option value="Profesyonel/Kurumsal">Profesyonel/Kurumsal</option>
              <option value="Akademik (Detaylı)">Akademik (Detaylı)</option>
              <option value="Samimi/Startup">Samimi/Startup</option>
            </select>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: "0.25rem" }}>
          <button
            id="generate-btn"
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={loading || !url.trim()}
          >
            {loading ? "Generating…" : "✦ Generate"}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="spinner-wrap">
          <div className="spinner" />
          <p>Scraping page & generating email — this may take a few seconds…</p>
        </div>
      )}

      {/* Error outside of editor (generation errors) */}
      {error && !draft && (
        <div className="banner banner-error" style={{ marginTop: "1.25rem" }} role="alert">
          ⚠ {error}
        </div>
      )}

      {/* Editor card — shown after generation */}
      {draft && !loading && (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ marginBottom: "1.25rem", color: "var(--text-secondary)", fontSize: "0.85rem", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Review &amp; Edit Draft
          </h2>
          <EmailEditor
            emailText={emailText}
            onEmailChange={setEmailText}
            orgName={orgName}
            onOrgNameChange={setOrgName}
            onSave={handleSave}
            saveLabel="Save to history"
            onRegenerate={handleRegenerate}
            isSaving={saving}
            isRegenerating={loading}
            savedFeedback={savedFeedback}
            error={error}
          />
        </div>
      )}
    </div>
  );
}
