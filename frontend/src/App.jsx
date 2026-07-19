/**
 * App.jsx — Mailora Layout
 */
import { useState } from "react";
import "./index.css";
import {
  Home, PlusCircle, History as HistoryIcon, FileText, LayoutTemplate, Settings,
  Sparkles, ChevronDown
} from "lucide-react";
import { DashboardView } from "./views/DashboardView";
import { HistoryView }   from "./views/HistoryView";

const NAV_ITEMS = [
  { id: "dashboard", label: "Anasayfa",      icon: Home },
  { id: "new",       label: "Yeni Mail",     icon: PlusCircle },
  { id: "history",   label: "Geçmiş Mailler",icon: HistoryIcon },
  { id: "drafts",    label: "Taslaklar",     icon: FileText },
  { id: "templates", label: "Şablonlar",     icon: LayoutTemplate },
  { id: "settings",  label: "Ayarlar",       icon: Settings },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [historyRefresh, setHistoryRefresh] = useState(0);

  function handleSaved() {
    setHistoryRefresh((n) => n + 1);
  }

  return (
    <div className="flex h-screen w-full bg-[#f8f9fe] font-sans overflow-hidden">

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col bg-[#fcfdff] border-r border-indigo-50/50 shadow-[4px_0_24px_rgba(168,85,247,0.03)] z-10">

        {/* Brand */}
        <div className="flex items-center gap-2 px-6 py-8">
          <Sparkles className="text-purple-500 fill-purple-500/20" size={24} />
          <div>
            <h1 className="font-bold text-slate-800 text-xl leading-none tracking-tight">Mailora</h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wide mt-1">AI Mail Generator</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-4 space-y-1.5" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  if (id === "history") setHistoryRefresh((n) => n + 1);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all
                  ${active
                    ? "bg-purple-50/80 text-purple-700 shadow-sm shadow-purple-100/50"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
              >
                <Icon size={18} className={active ? "text-purple-600" : "text-slate-400"} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Mailora Pro Card */}
        <div className="px-4 py-4">
          <div className="bg-gradient-to-br from-indigo-50/80 to-purple-50/80 rounded-2xl p-4 text-center border border-white shadow-sm shadow-purple-100/30">
            <h4 className="text-sm font-bold text-indigo-900 flex items-center justify-center gap-1">
              Mailora Pro <Sparkles size={14} className="text-purple-400" />
            </h4>
            <p className="text-xs text-indigo-900/60 mt-1 mb-3 leading-relaxed">
              Daha fazla özellik, sınırsız mail üretimi ve öncelikli destek.
            </p>
            <button className="w-full bg-white text-green-600 border border-green-100 text-xs font-bold py-2 rounded-xl shadow-sm hover:shadow hover:-translate-y-0.5 transition-all">
              Pro'ya Geç
            </button>
          </div>
        </div>

        {/* Profile */}
        <div className="p-4 mt-auto border-t border-slate-100/60">
          <button className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
              SN
            </div>
            <span className="text-sm font-semibold text-slate-700 flex-1 text-left">Süeda Nur</span>
            <ChevronDown size={16} className="text-slate-400" />
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <main className="flex-1 overflow-y-auto p-8">
          {(tab === "dashboard" || tab === "new") && (
            <DashboardView 
              onSaved={handleSaved} 
              onViewHistory={() => setTab("history")} 
            />
          )}
          {tab === "history" && <HistoryView refreshKey={historyRefresh} />}
          {(tab === "drafts" || tab === "templates" || tab === "settings") && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Sparkles size={32} className="text-purple-200 mb-3" />
              <p className="text-sm font-medium">Bu özellik çok yakında eklenecek.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
