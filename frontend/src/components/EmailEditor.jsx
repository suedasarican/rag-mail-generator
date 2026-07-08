/**
 * EmailEditor.jsx
 *
 * Shared editor component used in both the Generate view (new draft) and the
 * History detail view (editing a saved application). Handles:
 *   - Editable organization name
 *   - Editable email textarea
 *   - Status selector (only when editing a saved record)
 *   - Save / update / delete actions
 */

import { useState } from "react";
import { StatusBadge } from "./StatusBadge";

const STATUSES = ["draft", "sent", "responded", "rejected", "accepted"];

export function EmailEditor({
  /** Controlled value for the email body */
  emailText,
  onEmailChange,
  /** Controlled value for org name */
  orgName,
  onOrgNameChange,
  /** For saved records: the current status */
  status,
  onStatusChange,
  /** Whether a status picker should be shown (only in detail/edit mode) */
  showStatus = false,
  /** Button labels & callbacks */
  onSave,
  saveLabel = "Save to history",
  onRegenerate,
  onDelete,
  /** Loading flags */
  isSaving = false,
  isRegenerating = false,
  /** Feedback message to show after save */
  savedFeedback = null,
  /** Error to display */
  error = null,
}) {
  return (
    <div>
      {error && (
        <div className="banner banner-error" role="alert">
          ⚠ {error}
        </div>
      )}
      {savedFeedback && (
        <div className="banner banner-success save-flash" role="status">
          ✓ {savedFeedback}
        </div>
      )}

      {/* Org name row */}
      <div className="form-group">
        <label className="form-label" htmlFor="org-name-input">
          Organization
        </label>
        <input
          id="org-name-input"
          className="form-input"
          value={orgName}
          onChange={(e) => onOrgNameChange(e.target.value)}
          placeholder="Organization name"
        />
      </div>

      {/* Status picker — only in detail view */}
      {showStatus && (
        <div className="form-group">
          <label className="form-label" htmlFor="status-select">
            Status
          </label>
          <select
            id="status-select"
            className="form-select"
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Email body */}
      <div className="form-group">
        <label className="form-label" htmlFor="email-body">
          Email draft
        </label>
        <textarea
          id="email-body"
          className="form-textarea"
          value={emailText}
          onChange={(e) => onEmailChange(e.target.value)}
          spellCheck
          placeholder="Generated email will appear here…"
        />
      </div>

      {/* Action row */}
      <div className="btn-row">
        {onSave && (
          <button
            id="save-btn"
            className="btn btn-primary"
            onClick={onSave}
            disabled={isSaving || !emailText.trim()}
          >
            {isSaving ? "Saving…" : saveLabel}
          </button>
        )}
        {onRegenerate && (
          <button
            id="regenerate-btn"
            className="btn btn-secondary"
            onClick={onRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? "Regenerating…" : "↺ Regenerate"}
          </button>
        )}
        {onDelete && (
          <button
            id="delete-btn"
            className="btn btn-danger"
            onClick={onDelete}
            style={{ marginLeft: "auto" }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
