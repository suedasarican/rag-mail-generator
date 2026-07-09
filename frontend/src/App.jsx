/**
 * App.jsx — Dashboard shell with fixed sidebar + scrollable main content.
 */
import { useState } from "react";
import "./index.css";
import {
  LayoutDashboard, FileText, History as HistoryIcon, Settings, HelpCircle,
  Mail, Bell, MessageSquare, ChevronRight,
} from "lucide-react";
import { DashboardView } from "./views/DashboardView";
import { HistoryView }   from "./views/HistoryView";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard",           icon: LayoutDashboard },
  { id: "cv",        label: "My CV Context",       icon: FileText },
  { id: "history",   label: "Application History", icon: HistoryIcon },
  { id: "settings",  label: "Settings",            icon: Settings },
  { id: "help",      label: "Help",                icon: HelpCircle },
];

export default function App() {
  const [tab, setTab]                   = useState("dashboard");
  const [historyRefresh, setHistoryRefresh] = useState(0);

  function handleSaved() {
    setHistoryRefresh((n) => n + 1);
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col bg-white border-r border-slate-200 shadow-sm">

        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 text-white shadow-sm">
            <Mail size={18} />
          </div>
          <span className="font-semibold text-slate-800 text-sm leading-tight">
            Intern Mail<br />
            <span className="text-blue-500 font-medium">Automator</span>
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  if (id === "history") setHistoryRefresh((n) => n + 1);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${active
                    ? "bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
              >
                <Icon size={17} className={active ? "text-blue-600" : "text-slate-400"} />
                <span className="flex-1 text-left">{label}</span>
                {active && <ChevronRight size={14} className="text-blue-400" />}
              </button>
            );
          })}
        </nav>

        {/* Footer hint */}
        <div className="px-5 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">RAG Pipeline v2.0</p>
          <p className="text-xs text-slate-400">Agentic Routing Active</p>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top header */}
        <header className="shrink-0 flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div>
            <h2 className="text-base font-semibold text-slate-800 leading-none">
              {NAV_ITEMS.find((n) => n.id === tab)?.label ?? "Dashboard"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">AI-powered internship email generation</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
            </button>
            <button className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600">
              <MessageSquare size={18} />
            </button>
            <div className="ml-2 w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              S
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-6">
          {tab === "dashboard" && <DashboardView onSaved={handleSaved} />}
          {tab === "history"   && <HistoryView refreshKey={historyRefresh} />}
          {(tab === "cv" || tab === "settings" || tab === "help") && (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              This section is coming soon.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
