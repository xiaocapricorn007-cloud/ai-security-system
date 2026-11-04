"""
===============================================================================
SENTINEL AI SURVEILLANCE & REASONING PIPELINE — MASTER RUNNER
===============================================================================
Boots up the entire pipeline:
1. Verifies Hardware Acceleration (CUDA / RTX 3050)
2. Initializes SQLite Surveillance Index & Operator Credentials
3. Launches FastAPI Server & AI Reasoning Agent Engine
4. Opens Web Application in Default Browser
5. (Optional) Starts live webcam detection and tracking in parallel
===============================================================================
"""

import argparse
import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

BASE_DIR = Path(__file__).parent.resolve()
VENV_PYTHON = BASE_DIR / ".venv" / "Scripts" / "python.exe"

# Ensure we use venv python if running from system python
if VENV_PYTHON.exists() and sys.executable.lower() != str(VENV_PYTHON).lower():
    print(f"Switching to project virtual environment: {VENV_PYTHON}")
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON)] + sys.argv)

sys.path.insert(0, str(BASE_DIR))

BANNER = r"""
  ███████╗███████╗███╗   ██╗████████╗██╗███╗   ██╗███████╗██╗     
  ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██║████╗  ██║██╔════╝██║     
  ███████╗█████╗  ██╔██╗ ██║   ██║   ██║██╔██╗ ██║█████╗  ██║     
  ╚════██║██╔══╝  ██║╚██╗██║   ██║   ██║██║╚██╗██║██╔══╝  ██║     
  ███████║███████╗██║ ╚████║   ██║   ██║██║ ╚████║███████╗███████╗
  ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝
              AI SURVEILLANCE & REASONING PLATFORM
"""


def check_environment():
    print("=" * 70)
    print("1. HARDWARE & INFERENCE ACCELERATION CHECK")
    print("=" * 70)
    try:
        import torch
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            print(f" [OK] GPU Acceleration Active: {device_name} ({vram_gb:.2f} GB VRAM)")
            print(f" [OK] PyTorch CUDA Version: {torch.__version__}")
        else:
            print(" [!] CUDA not detected. Falling back to CPU.")
    except Exception as e:
        print(f" [!] PyTorch check warning: {e}")

    try:
        import ultralytics
        print(f" [OK] Ultralytics YOLO Engine: v{ultralytics.__version__}")
    except Exception as e:
        print(f" [!] Ultralytics check warning: {e}")


def initialize_database():
    print("\n" + "=" * 70)
    print("2. DATABASE & CREDENTIALS INITIALIZATION")
    print("=" * 70)
    from backend.database import init_db
    from backend.auth import seed_admin_user

    init_db()
    seed_admin_user()
    print(" [OK] Surveillance archive indexed at storage/sentinel.db")
    print(" [OK] Operator Authenticated: 'admin' / 'sentinel123'")


def launch_pipeline(port: int = 8000, open_browser: bool = True, live_webcam: bool = False):
    print("\n" + "=" * 70)
    print("3. STARTING PIPELINE SERVICES")
    print("=" * 70)

    url = f"http://127.0.0.1:{port}"
    print(f" [>] Web Console URL   : {url}")
    print(f" [>] API Documentation : {url}/docs")
    print(f" [>] AI Reasoning Agent: Active & Ready for queries")

    # Optional live webcam thread
    webcam_proc = None
    if live_webcam:
        print("\n [*] Launching real-time webcam detector in background...")
        webcam_script = BASE_DIR / "scripts" / "detect_humans.py"
        webcam_proc = subprocess.Popen([str(sys.executable), str(webcam_script), "--source", "0"])

    # Launch browser after a short delay
    if open_browser:
        def open_tab():
            time.sleep(1.5)
            print(f"\nOpening {url} in your browser...")
            webbrowser.open(url)

        import threading
        threading.Thread(target=open_tab, daemon=True).start()

    print("\n" + "=" * 70)
    print("SENTINEL RUNNING. Press Ctrl+C in this terminal to shut down.")
    print("=" * 70 + "\n")

    try:
        import uvicorn
        uvicorn.run(
            "backend.main:app",
            host="127.0.0.1",
            port=port,
            reload=False,
            log_level="info",
        )
    finally:
        if webcam_proc:
            webcam_proc.terminate()
            print("Webcam detector stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sentinel AI Master Command")
    parser.add_argument("--port", type=int, default=8000, help="Server port (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    parser.add_argument("--webcam", action="store_true", help="Launch live webcam detection alongside web app")
    args = parser.parse_args()

    print(BANNER)
    check_environment()
    initialize_database()
    launch_pipeline(
        port=args.port,
        open_browser=not args.no_browser,
        live_webcam=args.webcam,
    )
