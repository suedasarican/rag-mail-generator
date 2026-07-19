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
import io
import pdfplumber
from pathlib import Path
from typing import Optional

# Ensure the backend directory is on the path so we can import main_pipeline
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

from fastapi import Depends, FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    tone: Optional[str] = "Samimi"
    purpose: str
    length: Optional[str] = "Orta"
    language: Optional[str] = "Türkçe"
    cvText: Optional[str] = None

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
    cv_text: str
    persist_dir: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    """
    Phase 2 + Phase 3: scrape and chunk the target URL, cross-match target
    chunks against the CV vector store, and generate a draft email.
    Does NOT write to the database.
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
        target_chunks = pipeline.scrape_and_chunk_target_page(url)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to scrape target page: {exc}",
        )

    org_name = pipeline.extract_org_name(url, target_chunks)

    try:
        generated_email = pipeline.generate_email(url, role, req.tone, req.purpose, req.length, req.language, req.cvText, PERSIST_DIR)
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

@app.post("/api/generate-from-image", response_model=GenerateResponse)
async def generate_from_image(
    file: UploadFile = File(...), 
    role: Optional[str] = Form(None), 
    tone: Optional[str] = Form("Samimi"),
    purpose: str = Form(...),
    length: Optional[str] = Form("Orta"),
    language: Optional[str] = Form("Türkçe"),
    cvText: Optional[str] = Form(None)
):
    """
    Multimodal RAG: extracts text from an uploaded poster image via Vision LLM,
    chunks it, cross-matches against the CV, and generates an email.
    """
    image_bytes = await file.read()
    role = role.strip() if role else ""

    if not Path(PERSIST_DIR).exists():
        raise HTTPException(
            status_code=409,
            detail="CV vector store not found. Please run POST /api/ingest first.",
        )

    try:
        generated_email = pipeline.generate_email_from_image(image_bytes, role, tone, purpose, length, language, cvText, PERSIST_DIR)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Email generation failed: {exc}",
        )

    return GenerateResponse(
        generated_email=generated_email,
        organization_name="Extracted from Image",
        url="Image Upload",
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


@app.post("/api/upload-cv")
def upload_cv(file: UploadFile = File(...)):
    """PDF dosyasını alır, içindeki metni çıkarır ve Frontend'e döndürür."""
    # 1. İSTEK GELDİĞİ AN TERMİNALE YAZ (Uvicorn'u beklemeden)
    print(f"\n[DEBUG] --- YENİ DOSYA GELDİ: {file.filename} ---")
    
    if not file.filename.lower().endswith(".pdf"):
        print("[DEBUG] Hata: Dosya PDF formatında değil.")
        raise HTTPException(status_code=400, detail="Lütfen sadece PDF dosyası yükleyin.")
    
    try:
        print("[DEBUG] Dosya belleğe alınıyor...")
        content = file.file.read() # async olmadığı için await kullanmıyoruz
        cv_text = ""
        
        print("[DEBUG] pdfplumber ile metin çıkarılıyor (Bu işlem birkaç saniye sürebilir)...")
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                extracted = page.extract_text()
                if extracted:
                    cv_text += extracted + "\n\n"
        
        print(f"[DEBUG] Başarılı! {len(cv_text)} karakter çıkarıldı.")
        if not cv_text.strip():
            print("[DEBUG] Hata: PDF okundu ama içi boş veya resim tabanlı.")
            raise HTTPException(status_code=400, detail="PDF'den metin çıkarılamadı veya dosya boş.")
            
        return {"cv_text": cv_text.strip()}
    
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[DEBUG] ÇOK KRİTİK HATA: {exc}")
        raise HTTPException(status_code=500, detail=f"PDF okunurken hata oluştu: {exc}")


@app.post("/api/ingest", status_code=202)
def ingest(req: IngestRequest):
    """
    Kullanıcıdan gelen CV metnini alır ve ChromaDB'deki 
    önceki koleksiyonu temizleyerek vektörleri sıfırdan oluşturur.
    """
    persist_dir = req.persist_dir or PERSIST_DIR

    if not req.cv_text.strip():
        raise HTTPException(status_code=400, detail="CV metni boş olamaz.")

    try:
        pipeline.ingest_cv(req.cv_text, persist_dir)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sistem besleme (Ingestion) başarısız oldu: {exc}")

    return {"message": "CV sisteme başarıyla yüklendi ve vektörler oluşturuldu.", "persist_dir": persist_dir}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import HTTPException

# React build klasörünün yolu
dist_path = Path(__file__).parent.parent / "frontend" / "dist"

# Eğer build klasörü varsa, web sitesini yayınla
if dist_path.exists():
    # CSS ve JS dosyalarını (assets) dışa aç
    app.mount("/assets", StaticFiles(directory=str(dist_path / "assets")), name="assets")
    
    # API istekleri dışındaki tüm ziyaretçileri React'in index.html sayfasına yönlendir
    @app.get("/{catchall:path}")
    def serve_react(catchall: str):
        # Eğer yanlış bir /api/ isteği geldiyse HTML döndürmemek için koruma
        if catchall.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint bulunamadı")
        return FileResponse(str(dist_path / "index.html"))