import React, { useState } from 'react';

const CVUploader = ({ onIngestSuccess }) => {
  const [file, setFile] = useState(null);
  const [cvText, setCvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg("");
      setMessage("");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setErrorMsg("Lütfen önce bir PDF dosyası seçin.");
      return;
    }

    setLoading(true);
    setMessage("PDF okunuyor, lütfen bekleyin...");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Vite proxy /api isteklerini otomatik olarak backend'e yönlendirir
      const response = await fetch("/api/upload-cv", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "PDF okuma başarısız oldu.");
      }

      const data = await response.json();
      setCvText(data.cv_text);
      setMessage("PDF başarıyla okundu. Aşağıdan eksik veya hatalı kısımları manuel düzeltebilirsiniz.");
    } catch (error) {
      console.error(error);
      setErrorMsg(error.message || "PDF okuma sırasında bir hata oluştu.");
      setMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndIngest = async () => {
    if (!cvText.trim()) {
      setErrorMsg("CV metni boş olamaz.");
      return;
    }

    setLoading(true);
    setMessage("Sistem besleniyor (Yapay zeka için vektörler oluşturuluyor)...");
    setErrorMsg("");

    try {
      // Vite proxy /api isteklerini otomatik olarak backend'e yönlendirir
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ cv_text: cvText })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Sistemi beslerken bir hata oluştu.");
      }

      setMessage("🎉 CV sisteme başarıyla yüklendi, artık hedef şirket URL'sini girerek e-posta üretebilirsiniz!");
      if (onIngestSuccess) {
        onIngestSuccess();
      }
    } catch (error) {
      console.error(error);
      setErrorMsg(error.message || "Vektör veritabanı oluşturulurken hata oluştu.");
      setMessage("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 border border-slate-100 flex flex-col gap-5">
      <h3 className="text-base font-semibold text-slate-800 m-0">1. Adım: CV Yükle ve Sistemi Besle</h3>

      <div className="flex gap-2 items-center">
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          className="text-sm border border-slate-200 rounded-lg p-1.5 flex-1"
        />
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading && !cvText ? "Okunuyor..." : "PDF'i Çıkar"}
        </button>
      </div>

      {errorMsg && <p className="text-sm font-medium text-red-600">{errorMsg}</p>}
      {message && !errorMsg && <p className="text-sm font-medium text-emerald-600">{message}</p>}

      {cvText !== "" && (
        <div className="flex flex-col gap-3 mt-2">
          <h4 className="text-sm font-semibold text-slate-700">CV Metnini Kontrol Et & Düzenle</h4>
          <textarea
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl resize-y outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            onClick={handleSaveAndIngest}
            disabled={loading}
            className="w-full px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Vektörler Oluşturuluyor..." : "Kaydet ve Sistemi Besle"}
          </button>
        </div>
      )}
    </div>
  );
};

export default CVUploader;
