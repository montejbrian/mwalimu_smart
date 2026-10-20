"""
Root shim for `python3 -m scripts.seed_curriculum` when executed from repo root.
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

if __name__ == "__main__":
    runpy.run_path(str(_BACKEND_DIR / "scripts" / "seed_curriculum.py"), run_name="__main__")
