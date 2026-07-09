/**
 * api.js — Thin client wrapper around the FastAPI backend.
 */

const BASE = "http://localhost:8000";

async function request(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({ detail: res.statusText }));
  if (!res.ok) {
    const msg = json?.detail || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return json;
}

export const api = {
  generate: (url, role) =>
    request("POST", "/api/generate", { url, role: role || null }),

  generateFromImage: async (file, role) => {
    const formData = new FormData();
    formData.append("file", file);
    if (role) formData.append("role", role);
    
    const res = await fetch(`${BASE}/api/generate-from-image`, {
      method: "POST",
      body: formData,
    });
    
    if (res.status === 204) return null;
    const json = await res.json().catch(() => ({ detail: res.statusText }));
    if (!res.ok) {
      const msg = json?.detail || `HTTP ${res.status}`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return json;
  },

  saveApplication: (data) =>
    request("POST", "/api/applications", data),

  listApplications: () =>
    request("GET", "/api/applications"),

  getApplication: (id) =>
    request("GET", `/api/applications/${id}`),

  updateApplication: (id, data) =>
    request("PUT", `/api/applications/${id}`, data),

  deleteApplication: (id) =>
    request("DELETE", `/api/applications/${id}`),

  ingest: (cvPath, persistDir) =>
    request("POST", "/api/ingest", {
      cv_path: cvPath || null,
      persist_dir: persistDir || null,
    }),

  health: () =>
    request("GET", "/api/health"),
};
