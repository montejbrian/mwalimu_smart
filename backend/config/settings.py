"""
MwalimuSmart Web
backend/config/settings.py — Web-native configuration (no OS paths)
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT   = _BACKEND_DIR.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_REPO_ROOT / ".env"), str(_BACKEND_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    # LLM APIs
    GEMINI_API_KEY:    str = ""
    ELEVENLABS_API_KEY: str = ""
    # Google Cloud
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None
    # Databases
    POSTGRES_DSN: str = "postgresql://mwalimu:password@localhost:5432/mwalimusmart"
    MONGODB_URI:  str = "mongodb://localhost:27017/mwalimusmart"
    # RAG
    EMBEDDING_MODEL: str = "models/text-embedding-004"
    RAG_TOP_K:       int = 8
    # Renders (relative path or absolute, works on any host)
    RENDERS_DIR:      str = "renders"
    MANIM_OUTPUT_DIR: str = "renders"
    KICD_DOCS_DIR:    str = "kicd_docs"
    KICD_PDFS_DIR:    str = "kicd_pdfs"
    # API / Auth
    AUTH_SECRET:         str = "change-me-in-production"
    AUTH_REFRESH_SECRET: str = ""
    ALLOWED_ORIGINS:     str = "http://localhost:5173,http://localhost:4000"
    PORT:                int = 4000
    PYTHON_BIN:          str = "python3"
    # Logging
    LOG_LEVEL: str = "INFO"
    NODE_ENV:  str = "development"
    CDN_URL: Optional[str] = None

settings = Settings()
