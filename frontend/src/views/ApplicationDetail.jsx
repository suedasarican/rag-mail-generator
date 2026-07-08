/**
 * ApplicationDetail.jsx
 *
 * Full-page detail / edit view for a single saved application. Opened when
 * the user clicks a row in HistoryView. Allows editing final_email, org name,
 * status, and deleting the record.
 */

import { useState } from "react";
import { api } from "../api";
import { EmailEditor } from "../components/EmailEditor";
import { StatusBadge } from "../components/StatusBadge";

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApplicationDetail({ app: initial, onBack, onDeleted }) {
  const [app, setApp] = useState(initial);
  const [emailText, setEmailText] = useState(initial.final_email || "");
  const [orgName, setOrgName] = useState(initial.organization_name || "");
  const [status, setStatus] = useState(initial.status || "draft");

  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.deleteApplication(app.id);
      onDeleted?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {/* Back + header */}
      <div className="detail-header">
        <button className="back-btn" id="back-btn" onClick={onBack}>
          ← Back to history
        </button>
        <div style={{ flex: 1 }}>
          <div className="detail-title">
            {app.organization_name || "Untitled application"}
          </div>
          <div className="detail-subtitle">
            {app.role ? `${app.role} · ` : ""}
            <a href={app.url} target="_blank" rel="noopener noreferrer">
              {app.url}
            </a>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="card">
        {/* Meta row */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            marginBottom: "1.25rem",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
          }}
        >
          <span>Created: {fmt(app.created_at)}</span>
          <span>Last updated: {fmt(app.updated_at)}</span>
        </div>

        <hr className="section-divider" />

        <EmailEditor
          emailText={emailText}
          onEmailChange={setEmailText}
          orgName={orgName}
          onOrgNameChange={setOrgName}
          status={status}
          onStatusChange={setStatus}
          showStatus
          onSave={handleUpdate}
          saveLabel="Save changes"
          isSaving={saving}
          savedFeedback={savedFeedback}
          error={error}
          onDelete={handleDelete}
        />

        {confirmDelete && (
          <div
            className="banner banner-error"
            style={{ marginTop: "1rem" }}
            role="alert"
          >
            <strong>Are you sure?</strong> Click "Delete" again to confirm — this
            cannot be undone.
          </div>
        )}
      </div>

      {/* Original generated email (read-only reference) */}
      {app.generated_email && app.generated_email !== app.final_email && (
        <details style={{ marginTop: "1.25rem" }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              userSelect: "none",
              padding: "0.5rem 0",
            }}
          >
            Show original AI-generated draft (unedited)
          </summary>
          <div className="card" style={{ marginTop: "0.75rem" }}>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: "0.825rem",
                color: "var(--text-secondary)",
                lineHeight: 1.65,
              }}
            >
              {app.generated_email}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}
