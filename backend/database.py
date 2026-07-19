"""
database.py — SQLite persistence layer for RAG Mail application history.
Uses SQLAlchemy Core (no ORM classes needed for a simple single-table schema).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    String,
    Text,
    create_engine,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# ---------------------------------------------------------------------------
# Engine setup
# ---------------------------------------------------------------------------

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "applications.db"))
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    url = Column(Text, nullable=False)
    organization_name = Column(Text, nullable=True)
    role = Column(String(256), nullable=True)
    generated_email = Column(Text, nullable=False)
    final_email = Column(Text, nullable=False)
    status = Column(
        String(32),
        nullable=False,
        default="draft",
        server_default="draft",
    )
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# Dependency helper (for FastAPI)
# ---------------------------------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------

VALID_STATUSES = ["draft", "sent", "accepted", "rejected"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_application(
    db: Session,
    url: str,
    organization_name: Optional[str],
    role: Optional[str],
    generated_email: str,
    final_email: str,
    status: str = "draft",
) -> Application:
    if status not in VALID_STATUSES:
        status = "draft"
    now = _now()
    app = Application(
        url=url,
        organization_name=organization_name,
        role=role,
        generated_email=generated_email,
        final_email=final_email,
        status=status,
        created_at=now,
        updated_at=now,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


def list_applications(db: Session) -> list[Application]:
    return db.query(Application).order_by(Application.created_at.desc()).all()


def get_application(db: Session, app_id: int) -> Optional[Application]:
    return db.query(Application).filter(Application.id == app_id).first()


def update_application(
    db: Session,
    app_id: int,
    **fields,
) -> Optional[Application]:
    app = get_application(db, app_id)
    if not app:
        return None
    allowed = {"url", "organization_name", "role", "generated_email", "final_email", "status"}
    for key, value in fields.items():
        if key in allowed:
            if key == "status" and value not in VALID_STATUSES:
                continue
            setattr(app, key, value)
    app.updated_at = _now()
    db.commit()
    db.refresh(app)
    return app


def delete_application(db: Session, app_id: int) -> bool:
    app = get_application(db, app_id)
    if not app:
        return False
    db.delete(app)
    db.commit()
    return True
