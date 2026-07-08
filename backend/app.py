"""
app.py — FastAPI backend wrapping the RAG email generation pipeline.

Endpoints
---------
POST  /api/generate              Generate a draft email (preview, no DB write)
POST  /api/applications          Save a new application record
GET   /api/applications          List all saved applications (newest first)
GET   /api/applications/{id}     Get one application by ID
PUT   /api/applications/{id}     Update an existing application
DELETE /api/applications/{id}    Delete an application
POST  /api/ingest                Rebuild the CV vector store from disk
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

# Ensure the backend directory is on the path so we can import main_pipeline
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

from fastapi import Depends, FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from sqlalchemy.orm import Session

import database as db_module
from database import get_db, VALID_STATUSES
import main_pipeline as pipeline

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="RAG Mail API", version="1.0.0")

# Allow any local Vite dev server (port varies if 5173 is taken)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create DB tables on startup if they don't exist yet
db_module.create_tables()

# Pipeline config (mirrors main_pipeline defaults)
PERSIST_DIR = str(Path(__file__).parent.parent / "chroma_db")
CV_PATH = str(Path(__file__).parent.parent / "cv_context.md")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    url: str
    role: Optional[str] = None


class GenerateResponse(BaseModel):
    generated_email: str
    organization_name: str
    url: str
    role: Optional[str]


class ApplicationCreate(BaseModel):
    url: str
    role: Optional[str] = None
    organization_name: Optional[str] = None
    generated_email: str
    final_email: str
    status: str = "draft"


class ApplicationUpdate(BaseModel):
    url: Optional[str] = None
    role: Optional[str] = None
    organization_name: Optional[str] = None
    generated_email: Optional[str] = None
    final_email: Optional[str] = None
    status: Optional[str] = None


class ApplicationOut(BaseModel):
    id: int
    url: str
    organization_name: Optional[str]
    role: Optional[str]
    generated_email: str
    final_email: str
    status: str
    created_at: str
    updated_at: str

    @classmethod
    def from_orm_obj(cls, obj: db_module.Application) -> "ApplicationOut":
        return cls(
            id=obj.id,
            url=obj.url,
            organization_name=obj.organization_name,
            role=obj.role,
            generated_email=obj.generated_email,
            final_email=obj.final_email,
            status=obj.status,
            created_at=obj.created_at.isoformat() if obj.created_at else "",
            updated_at=obj.updated_at.isoformat() if obj.updated_at else "",
        )


class IngestRequest(BaseModel):
    cv_path: Optional[str] = None
    persist_dir: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    """
    Phase 2 + Phase 3: scrape the target URL, retrieve relevant CV chunks,
    and generate a draft email. Does NOT write to the database.
    """
    url = req.url.strip()
    role = req.role.strip() if req.role else ""

    # Validate that the vector store exists
    if not Path(PERSIST_DIR).exists():
        raise HTTPException(
            status_code=409,
            detail=(
                "CV vector store not found. "
                "Please run POST /api/ingest first to build it from your CV."
            ),
        )

    try:
        scraped_text = pipeline.scrape_target_page(url)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to scrape target page: {exc}",
        )

    org_name = pipeline.extract_org_name(url, scraped_text)

    try:
        generated_email = pipeline.generate_email(url, role, PERSIST_DIR)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        # Catch LLM / API errors and surface them clearly
        raise HTTPException(
            status_code=502,
            detail=f"Email generation failed: {exc}",
        )

    return GenerateResponse(
        generated_email=generated_email,
        organization_name=org_name,
        url=url,
        role=role or None,
    )


@app.post("/api/applications", response_model=ApplicationOut, status_code=201)
def create_application(req: ApplicationCreate, db: Session = Depends(get_db)):
    """Save a new application record (called after the user reviews the draft)."""
    app_obj = db_module.create_application(
        db=db,
        url=req.url,
        organization_name=req.organization_name,
        role=req.role,
        generated_email=req.generated_email,
        final_email=req.final_email,
        status=req.status,
    )
    return ApplicationOut.from_orm_obj(app_obj)


@app.get("/api/applications", response_model=list[ApplicationOut])
def list_applications(db: Session = Depends(get_db)):
    """Return all saved applications, newest first."""
    apps = db_module.list_applications(db)
    return [ApplicationOut.from_orm_obj(a) for a in apps]


@app.get("/api/applications/{app_id}", response_model=ApplicationOut)
def get_application(app_id: int, db: Session = Depends(get_db)):
    """Fetch a single application by ID."""
    app_obj = db_module.get_application(db, app_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found.")
    return ApplicationOut.from_orm_obj(app_obj)


@app.put("/api/applications/{app_id}", response_model=ApplicationOut)
def update_application(app_id: int, req: ApplicationUpdate, db: Session = Depends(get_db)):
    """Update fields on an existing application."""
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if "status" in update_data and update_data["status"] not in VALID_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}",
        )
    app_obj = db_module.update_application(db, app_id, **update_data)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found.")
    return ApplicationOut.from_orm_obj(app_obj)


@app.delete("/api/applications/{app_id}", status_code=204)
def delete_application(app_id: int, db: Session = Depends(get_db)):
    """Delete an application record."""
    deleted = db_module.delete_application(db, app_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Application not found.")


@app.post("/api/ingest", status_code=202)
def ingest(req: IngestRequest = IngestRequest()):
    """
    Rebuild (or build for the first time) the CV vector store.
    Accepts optional cv_path and persist_dir overrides; defaults to the
    project-level cv_context.md and chroma_db directory.
    """
    cv_path = req.cv_path or CV_PATH
    persist_dir = req.persist_dir or PERSIST_DIR

    if not Path(cv_path).exists():
        raise HTTPException(
            status_code=404,
            detail=f"CV file not found at: {cv_path}",
        )

    try:
        pipeline.ingest_cv(cv_path, persist_dir)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}")

    return {"message": "CV ingested successfully.", "persist_dir": persist_dir}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}
