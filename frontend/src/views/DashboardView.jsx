/**
 * DashboardView.jsx
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles, Loader2, Copy, AlertTriangle, Link as LinkIcon, 
  UploadCloud, FileText, ChevronRight, CheckCircle2, FileUp, Info, ChevronDown, Mail, History as HistoryIcon, Image,
} from "lucide-react";
import { api } from "../api";
import { StatusBadge } from "../components/StatusBadge";

// Format date helper
function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", {
    month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

export function DashboardView({ onSaved, onViewHistory }) {

  // Form state
  const [url, setUrl] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [cvFile, setCvFile] = useState(null);
  const [cvText, setCvText] = useState("");
  const [purpose, setPurpose] = useState("");
  
  // Settings state
  const [tone, setTone] = useState("Samimi");
  const [length, setLength] = useState("Orta");
  const [language, setLanguage] = useState("Türkçe");

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [emailText, setEmailText] = useState("");
  const [orgName, setOrgName] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(null);
  const [copied, setCopied] = useState(false);

  // History state (Right Sidebar)
  const [recentApps, setRecentApps] = useState([]);
  const [histLoading, setHistLoading] = useState(true);

  // File drag & drop ref
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // ── Load history ──
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const data = await api.listApplications();
      setRecentApps(data.slice(0, 3)); // Only take top 3 for dashboard
    } catch (err) {
      console.error(err);
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Handle CV Drag & Drop ──
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvFile(file);
    
    // Auto-extract text
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload-cv", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setCvText(data.cv_text);
      }
    } catch (err) {
      console.error("CV extraction failed", err);
    }
  };

  // ── Generate ──
  async function handleGenerate() {
    if (!purpose.trim()) {
      setError("Lütfen mailin konusunu veya amacını belirtin.");
      return;
    }
    if (!url.trim() && !imageFile) {
      setError("Lütfen bir hedef URL girin veya ilan görseli yükleyin.");
      return;
    }

    setLoading(true);
    setError(null);
    setSavedFeedback(null);
    setDraft(null);
    setEmailText("");
    setOrgName("");
    try {
      let result;
      if (imageFile) {
        result = await api.generateFromImage(imageFile, "", tone, purpose, length, language, cvText);
      } else {
        result = await api.generate(url.trim(), "", tone, purpose, length, language, cvText);
      }

      setDraft(result);
      setEmailText(result.generated_email);
      setOrgName(result.organization_name || "");
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
    setSavedFeedback(null);
    try {
      await api.saveApplication({
        url: draft.url,
        role: purpose || null,
        organization_name: orgName || null,
        generated_email: draft.generated_email,
        final_email: emailText,
        status: "draft",
      });
      setSavedFeedback("success");
      onSaved?.();
      loadHistory();
    } catch (err) {
      setSavedFeedback(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      
      {/* ── CENTER AREA (Form) ───────────────────────────────────────────── */}
      <div className="flex-1 w-full flex flex-col gap-6">
        
        {/* Header Banner */}
        <div className="card border-0 bg-white shadow-sm flex items-center justify-between overflow-hidden relative">
          <div className="z-10 relative">
            <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              Merhaba, Süeda! <span className="animate-wave inline-block origin-bottom-right">👋</span>
            </h2>
            <p className="text-slate-500 font-medium mt-2">Yapay zeka ile etkileyici mailler oluşturun.</p>
          </div>
          {/* Decorative element */}
          <div className="absolute right-0 top-0 bottom-0 w-64 bg-gradient-to-l from-purple-50 to-transparent pointer-events-none" />
          <Sparkles className="absolute right-12 top-8 text-purple-200" size={64} strokeWidth={1} />
          <Mail className="absolute right-24 bottom-2 text-indigo-100" size={48} strokeWidth={1.5} />
        </div>

        {/* Form Card */}
        <div className="card space-y-6 relative overflow-hidden">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <Sparkles size={20} />
            <h3 className="font-bold text-lg">Yeni Mail Oluştur</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* CV Upload */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                CV Yükle <span className="text-slate-400 font-normal text-xs">(Opsiyonel)</span>
                <Info size={14} className="text-slate-400 ml-auto" />
              </label>
              <div 
                className="border-2 border-dashed border-indigo-100 bg-indigo-50/30 hover:bg-indigo-50/80 transition-colors rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer relative"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="application/pdf,.docx" 
                  className="hidden" 
                />
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-500 flex items-center justify-center mb-1">
                  {cvFile ? <FileText size={20} /> : <FileUp size={20} />}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    {cvFile ? cvFile.name : "CV'nizi buraya sürükleyin"}
                  </p>
                  <p className="text-xs text-indigo-400 mt-0.5">veya <span className="underline">dosya seçin</span></p>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">PDF, DOCX formatında (Max. 5MB)</p>
              </div>
            </div>

            {/* Link Input or Image Upload */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                Hedef İlan <span className="text-slate-400 font-normal text-xs">(Link veya Görsel)</span>
                <Info size={14} className="text-slate-400 ml-auto" />
              </label>
              <div className="border border-slate-200 bg-slate-50 rounded-2xl p-4 flex flex-col h-full">
                
                {imageFile ? (
                  <div className="relative flex-1 flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 bg-indigo-50/50 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <Image size={18} className="text-indigo-500" />
                      <span className="text-sm font-semibold text-slate-700 truncate max-w-[150px]">{imageFile.name}</span>
                    </div>
                    <button 
                      onClick={() => setImageFile(null)} 
                      className="mt-2 text-xs font-bold text-red-500 hover:text-red-700"
                    >
                      Görseli Kaldır
                    </button>
                  </div>
                ) : (
                  <div className="relative flex-1 flex flex-col justify-center gap-2">
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="LinkedIn profili veya ilan linki"
                        className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-9 pr-3 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Veya</span>
                    </div>
                    <button 
                      onClick={() => imageInputRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 w-full bg-white border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl py-2 text-sm font-medium text-slate-600 transition-all"
                    >
                      <UploadCloud size={16} className="text-indigo-400" /> İlan Görseli Yükle
                    </button>
                    <input 
                      type="file" 
                      ref={imageInputRef} 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) setImageFile(e.target.files[0]);
                      }} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                )}
                <p className="text-[11px] text-slate-500 mt-auto pt-3 text-center">İlandan bilgiler otomatik çekilir.</p>
              </div>
            </div>
          </div>

          {/* Purpose */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              Mail Konusu / Amacı <span className="text-red-400">*</span>
              <Info size={14} className="text-slate-400 ml-auto" />
            </label>
            <div className="relative">
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Örn: Yazılım mühendisi pozisyonu için başvuru maili, veya bir projede iş birliği talebi."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 min-h-[100px] resize-y transition-all"
              />
              <span className="absolute bottom-3 right-4 text-[10px] font-semibold text-slate-400">
                {purpose.length}/300
              </span>
            </div>
          </div>

          {/* Configuration Dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-5">
            
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700">Ton Seçimi</label>
              <div className="relative">
                <select 
                  value={tone} 
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium text-slate-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 cursor-pointer"
                >
                  <option value="Samimi">😊 Samimi / Startup</option>
                  <option value="Resmi">👔 Resmi / Kurumsal</option>
                  <option value="Akademik">🎓 Akademik (Detaylı)</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700">Uzunluk</label>
              <div className="relative">
                <select 
                  value={length} 
                  onChange={(e) => setLength(e.target.value)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium text-slate-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 cursor-pointer"
                >
                  <option value="Kısa">Kısa ve Öz</option>
                  <option value="Orta">Orta Uzunlukta</option>
                  <option value="Uzun">Detaylı ve Uzun</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700">Dil</label>
              <div className="relative">
                <select 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium text-slate-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 cursor-pointer"
                >
                  <option value="Türkçe">🇹🇷 Türkçe</option>
                  <option value="İngilizce">🇬🇧 İngilizce</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

          </div>

          {/* Action Area */}
          <div className="pt-2">
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm font-medium rounded-xl border border-red-100 flex items-center gap-2">
                <AlertTriangle size={16} /> {error}
              </div>
            )}
            <button
              onClick={handleGenerate}
              disabled={loading || !purpose.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 text-white rounded-2xl font-bold text-base shadow-[0_4px_14px_-2px_rgba(192,132,252,0.4)] hover:shadow-[0_8px_20px_-4px_rgba(192,132,252,0.6)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
              {loading ? "Oluşturuluyor..." : "Mail Oluştur"}
            </button>
            <p className="text-center text-xs font-medium text-purple-400 mt-3 rotate-[-2deg]">
              ✨ AI sihri burada!
            </p>
          </div>
        </div>

        {/* Draft Result Area */}
        {draft && (
          <div className="card flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Üretilen Mail</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(emailText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  {copied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  {copied ? "Kopyalandı" : "Kopyala"}
                </button>
              </div>
            </div>

            <textarea
              className="w-full h-64 p-4 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-200 resize-y"
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
            />

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <input
                type="text"
                placeholder="Şirket / Organizasyon Adı (Opsiyonel)"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="flex-1 form-input rounded-xl"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary rounded-xl px-6"
              >
                {saving ? "Kaydediliyor..." : "Geçmişe Kaydet"}
              </button>
            </div>

            {savedFeedback === "success" && (
              <p className="text-emerald-600 text-sm font-semibold flex items-center gap-1.5 justify-end">
                <CheckCircle2 size={16} /> Taslak başarıyla kaydedildi!
              </p>
            )}
            {savedFeedback && savedFeedback !== "success" && (
              <p className="text-red-500 text-sm font-semibold flex items-center gap-1.5 justify-end">
                <AlertTriangle size={16} /> {savedFeedback}
              </p>
            )}
          </div>
        )}

      </div>

      {/* ── RIGHT SIDEBAR ──────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-6">
        
        {/* Recent History Card */}
        <div className="card p-5">
          <div className="flex items-center gap-2 text-indigo-700 mb-4 font-bold">
            <HistoryIcon size={18} /> Geçmiş Mailler
          </div>
          
          <div className="flex flex-col gap-3">
            {histLoading ? (
              <div className="py-8 flex justify-center text-slate-300">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : recentApps.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Henüz mail üretmediniz.</p>
            ) : (
              recentApps.map((app) => (
                <div key={app.id} className="p-3 border border-slate-100 rounded-2xl hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors flex gap-3 items-start cursor-pointer group">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                    <Mail size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {app.role || "Genel Başvuru"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{app.organization_name}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-md">
                        {fmt(app.created_at).split(" ")[0]}
                      </span>
                      <StatusBadge status={app.status} className="scale-[0.8] origin-left" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <button 
            onClick={onViewHistory}
            className="w-full mt-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-indigo-600 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1"
          >
            Tüm Geçmişi Gör <ChevronRight size={14} />
          </button>
        </div>

        {/* Tip Card */}
        <div className="card p-5 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100 shadow-sm shadow-emerald-100/50">
          <div className="flex items-center gap-2 text-emerald-700 mb-2 font-bold">
            <span className="text-xl leading-none">💡</span> İpucu
          </div>
          <p className="text-sm font-medium text-emerald-800/80 leading-relaxed mb-4">
            Daha iyi sonuçlar için CV'nizi yükleyin veya şirket/ilan linkini ekleyin. Yapay zeka bu verileri kullanarak en uygun maili yazar.
          </p>
          <div className="flex justify-center mt-2 relative">
             <div className="w-24 h-24 bg-white rounded-2xl shadow-sm border border-emerald-100 flex items-center justify-center relative z-10 rotate-[-5deg]">
               <Mail size={40} className="text-emerald-300" strokeWidth={1.5} />
             </div>
             <div className="w-20 h-20 bg-emerald-100 rounded-2xl absolute -right-2 top-2 z-0 rotate-[10deg]" />
          </div>
        </div>

      </div>
    </div>
  );
}
