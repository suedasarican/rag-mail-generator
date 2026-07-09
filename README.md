# RAG Mail — Application Email Generator

A local full-stack AI agent that automates the generation of highly personalized internship/research application emails. It uses a **Dual Retrieval (Chunk-to-Chunk Matching)** architecture and **Agentic Routing** to analyze a target organization's career page, match it against your CV context, and generate a tailored email draft based on the organization's culture.

---

## 🚀 Key Features & Architecture

### 1. Agentic Routing (Semantic Routing)
The system employs a 2-step agentic process to ensure the tone of the email perfectly matches the target organization:
*   **Classifier Agent:** Scrapes the target website and classifies the organization's culture into one of three categories: `ACADEMIC`, `STARTUP`, or `CORPORATE`.
*   **Persona Prompts:** Dynamically routes the generation to a specialized Prompt based on the classification, ensuring the language, focus, and structure are perfectly adapted to the target audience.

### 2. Dual Retrieval (Chunk-to-Chunk Matching)
Instead of embedding an entire massive web page as a single noisy query, the pipeline:
1.  **Chunks the Target Website:** Uses semantic splitting to break the scraped target URL into meaningful, smaller documents.
2.  **Cross-Matches:** Performs an L2 distance calculation between every target chunk and your CV chunks stored in ChromaDB.
3.  **Filters:** Selects only the most semantically relevant chunk pairs (passing a strict threshold) to feed into the LLM, drastically reducing noise and hallucination.

### 3. Modern Enterprise Dashboard
A clean, professional React frontend built with Tailwind CSS and Lucide icons.
*   **Widget A (Generator):** Enter a target URL and role to kick off the pipeline.
*   **Widget B (CV Context Status):** Real-time feedback on your CV ingestion status, matching logic, and the detected routing culture (e.g., `🤖 Routed to: CORPORATE`).
*   **Widget C (Email Editor):** Review, edit, copy, and save your AI-generated drafts.
*   **Widget D (Application History):** Track all past applications, filter by status (Draft, Sent, Responded, etc.), edit saved entries, and delete old records.

---

## 📁 Project Structure

```
RAG_Mail/
├── backend/
│   ├── main_pipeline.py   # Core RAG pipeline (Dual Retrieval & Agentic Routing)
│   ├── app.py             # FastAPI server
│   ├── database.py        # SQLite schema + CRUD helpers (SQLAlchemy)
│   └── requirements.txt
├── frontend/              # Vite + React app (Tailwind CSS)
│   └── src/
│       ├── api.js
│       ├── App.jsx        # Sidebar Layout Shell
│       ├── index.css      # Tailwind imports
│       ├── components/
│       │   ├── EmailEditor.jsx
│       │   └── StatusBadge.jsx
│       └── views/
│           ├── DashboardView.jsx     # Main Dashboard (Widgets A, B, C, D)
│           ├── HistoryView.jsx       # Full History Table
│           └── ApplicationDetail.jsx # Edit View for saved applications
├── cv_context.md          # Your CV (already exists)
├── chroma_db/             # Vector store (created by ingest)
├── .env                   # GROQ_API_KEY (already exists)
└── README.md
```

---

## 🛠️ Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- A `.env` file at the project root with `GROQ_API_KEY=your_key_here`
- Your `cv_context.md` file ready to be ingested.

---

## 🚦 Quick Start

### 1. Install Backend Dependencies & Start Server

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```
*API running at `http://localhost:8000` (Swagger docs at `/docs`)*

### 2. Install Frontend Dependencies & Start UI

```bash
cd frontend
npm install    # Installs React, Vite, Tailwind CSS, Lucide
npm run dev
```
*Dashboard running at `http://localhost:5173`*

---

## 🧠 First-Time Setup (Ingesting CV)

Before generating emails, you must ingest your CV to build the ChromaDB vector store.

**Via CLI:**
```bash
python main.py ingest --file cv_context.md
```

**Via API:**
```bash
curl -X POST http://localhost:8000/api/ingest
```

---

## 🔌 API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/generate` | Scrape, Classify, Match, and Generate an email draft |
| `POST` | `/api/applications` | Save a new application to the database |
| `GET`  | `/api/applications` | List all saved applications |
| `GET`  | `/api/applications/{id}` | Get a specific application |
| `PUT`  | `/api/applications/{id}` | Update an application's details or status |
| `DELETE` | `/api/applications/{id}` | Delete an application |
| `POST` | `/api/ingest` | Rebuild the CV vector store from `cv_context.md` |
| `GET`  | `/api/health` | Backend health check |

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for the LLM (llama-3.3-70b-versatile) |
| `DB_PATH` | No | Custom path for SQLite DB (default: `backend/applications.db`) |

---

## 📝 Notes
*   The SQLite database (`backend/applications.db`) is automatically created on first use.
*   The pipeline relies heavily on the quality of the scraped text. Highly JavaScript-dependent sites blocking standard scrapers may result in limited target context.