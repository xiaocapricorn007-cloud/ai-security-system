"""
Sentinel AI Security System - Web & Backend Server Launcher
Starts FastAPI with Uvicorn on http://127.0.0.1:8000
"""

import sys
from pathlib import Path
import uvicorn

# Add current folder to sys.path
sys.path.insert(0, str(Path(__file__).parent.resolve()))

if __name__ == "__main__":
    print("=" * 65)
    print("  SENTINEL AI SURVEILLANCE & REASONING PLATFORM")
    print("  Web Console: http://127.0.0.1:8000")
    print("  API Docs   : http://127.0.0.1:8000/docs")
    print("  Default Operator Login: 'admin' / 'sentinel123'")
    print("=" * 65)

    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=8000,
        reload=False,
        log_level="info",
    )
