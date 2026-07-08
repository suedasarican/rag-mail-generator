# RAG Mail — Application Email Generator

A local full-stack tool that wraps the RAG pipeline in `main_pipeline.py` with
a FastAPI backend and a React frontend. Generate personalized internship/research
application emails, review and edit them, and track your application history.

---

## Project Structure

```
RAG_Mail/
├── backend/
│   ├── main_pipeline.py   # RAG pipeline (copy of original main.py)
│   ├── app.py             # FastAPI server
│   ├── database.py        # SQLite schema + CRUD helpers (SQLAlchemy)
│   └── requirements.txt
├── frontend/              # Vite + React app
│   └── src/
│       ├── api.js
│       ├── App.jsx
│       ├── index.css
│       ├── components/
│       │   ├── EmailEditor.jsx
│       │   └── StatusBadge.jsx
│       └── views/
│           ├── GenerateView.jsx
│           ├── HistoryView.jsx
│           └── ApplicationDetail.jsx
├── cv_context.md          # Your CV (already exists)
├── chroma_db/             # Vector store (created by ingest)
├── .env                   # GROQ_API_KEY (already exists)
└── README.md
```

---

## Prerequisites

- **Python 3.10+** with pip
- **Node.js 18+** with npm
- A `.env` file at the project root with `GROQ_API_KEY=...` (already present)
- Your `cv_context.md` already ingested into `chroma_db/` (run ingest if needed)

---

## Quick Start

### 1. Install backend dependencies

```powershell
cd backend
pip install -r requirements.txt
```

### 2. Start the FastAPI backend

```powershell
# from the backend/ directory
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.  
Swagger docs: `http://localhost:8000/docs`

### 3. Install & start the React frontend

```powershell
cd frontend
npm install    # only needed once
npm run dev
```

The UI will be available at `http://localhost:5173`.

---

## First-Time Setup (rebuilding the vector store)

If you've never ingested your CV, or if you update `cv_context.md`, run:

```powershell
# Option A: from the project root via the CLI
python main.py ingest --file cv_context.md

# Option B: via the API (with the backend running)
curl -X POST http://localhost:8000/api/ingest
```

Or use the `/api/ingest` endpoint from the Swagger UI.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/generate` | Generate a draft email (preview — no DB write) |
| `POST` | `/api/applications` | Save a new application |
| `GET`  | `/api/applications` | List all saved applications |
| `GET`  | `/api/applications/{id}` | Get one application |
| `PUT`  | `/api/applications/{id}` | Update an application |
| `DELETE` | `/api/applications/{id}` | Delete an application |
| `POST` | `/api/ingest` | Rebuild the CV vector store |
| `GET`  | `/api/health` | Health check |

### POST /api/generate

```json
{ "url": "https://example-lab.edu/careers", "role": "Research Intern" }
```

Returns:

```json
{
  "generated_email": "Subject: ...\n\nDear ...",
  "organization_name": "Example Lab",
  "url": "https://...",
  "role": "Research Intern"
}
```

### Application statuses

`draft` → `sent` → `responded` → `rejected` / `accepted`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes (for generation) | Groq API key for the LLM |
| `DB_PATH` | No | Custom path for SQLite database (default: `backend/applications.db`) |

---

## Notes

- The SQLite database (`backend/applications.db`) is created automatically on
  first run.
- The vector store (`chroma_db/`) and `contact_info.json` must exist before
  calling `/api/generate` — run ingest first.
- The LLM used is `llama-3.3-70b-versatile` via Groq. Scraping very
  JavaScript-heavy pages may return limited content.