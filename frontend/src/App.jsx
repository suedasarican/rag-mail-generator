import { useState } from "react";
import "./index.css";
import { GenerateView } from "./views/GenerateView";
import { HistoryView } from "./views/HistoryView";

export default function App() {
  const [tab, setTab] = useState("generate"); // "generate" | "history"
  const [historyRefresh, setHistoryRefresh] = useState(0);

  function handleSaved() {
    // Bump the key so HistoryView reloads when the user switches to it
    setHistoryRefresh((n) => n + 1);
  }

  return (
    <div className="app-layout">
      {/* ── Navigation ────────────────────────────────── */}
      <nav className="nav" aria-label="Main navigation">
        <div className="nav-brand">
          <div className="nav-brand-icon" aria-hidden="true">✉</div>
          RAG Mail
        </div>

        <div className="nav-tabs" role="tablist">
          <button
            id="tab-generate"
            role="tab"
            aria-selected={tab === "generate"}
            className={`nav-tab ${tab === "generate" ? "active" : ""}`}
            onClick={() => setTab("generate")}
          >
            ✦ Generate
          </button>
          <button
            id="tab-history"
            role="tab"
            aria-selected={tab === "history"}
            className={`nav-tab ${tab === "history" ? "active" : ""}`}
            onClick={() => {
              setTab("history");
              setHistoryRefresh((n) => n + 1);
            }}
          >
            ⏱ History
          </button>
        </div>
      </nav>

      {/* ── Main content ──────────────────────────────── */}
      <main className="main">
        {tab === "generate" && <GenerateView onSaved={handleSaved} />}
        {tab === "history" && <HistoryView refreshKey={historyRefresh} />}
      </main>
    </div>
  );
}
