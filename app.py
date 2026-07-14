"""
FastAPI wrapper for the RAG Mail pipeline.
===========================================

Exposes the existing generate_email pipeline as a REST endpoint so
the React frontend (or any HTTP client) can trigger email generation
without touching the CLI.

Usage:
    uvicorn app:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import traceback

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from main import generate_email, ingest_cv

# --------------------------------------------------------------------------- #
# Bootstrap
# --------------------------------------------------------------------------- #

load_dotenv()  # picks up VLLM_API_BASE, GOOGLE_API_KEY, etc.

app = FastAPI(
    title="Multimodal RAG Agent API",
    description="Self-hosted RAG pipeline for personalized application emails.",
    version="2.0.0",
)

# Allow the Vite dev-server (or any origin) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Request / Response schemas
# --------------------------------------------------------------------------- #

class EmailRequest(BaseModel):
    url: str
    role: str = ""


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #

@app.post("/api/generate")
async def generate(req: EmailRequest):
    """
    Scrape the target URL, cross-match against the CV vector store,
    classify the organisation culture (Agentic Routing), and generate
    a tailored application email.
    """
    try:
        result = generate_email(url=req.url, role=req.role)
        return {"status": "success", "email_draft": result}
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": str(e)}


@app.post("/api/ingest")
async def ingest():
    """Rebuild the CV vector store from cv_context.md."""
    try:
        ingest_cv("cv_context.md")
        return {"status": "success", "message": "CV vector store rebuilt."}
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": str(e)}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
