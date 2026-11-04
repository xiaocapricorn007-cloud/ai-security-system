"""
FastAPI Main Application
Serves CCTV endpoints, AI Reasoning Agent, Auth, and Minimalist Editorial Web App.
"""

from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.database import init_db, query_events
from backend.auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    seed_admin_user,
)
from backend.reasoning_agent import SecurityReasoningAgent

app = FastAPI(
    title="SENTINEL AI Security System",
    description="Surveillance Intelligence & Reasoning Platform",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Base Paths
BASE_DIR = Path("C:/Users/ragha/ai-security-system")
SNAPSHOT_DIR = BASE_DIR / "storage" / "snapshots"
FRONTEND_DIR = BASE_DIR / "frontend"

# Initialize Agent
agent = SecurityReasoningAgent()


# Request / Response Schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class QueryRequest(BaseModel):
    query: str


# Startup event
@app.on_event("startup")
def on_startup():
    init_db()
    seed_admin_user()


# Auth Endpoints
@app.post("/api/auth/login")
def login(creds: LoginRequest):
    user = authenticate_user(creds.username, creds.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
        },
    }


@app.get("/api/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}


# Camera Channels
@app.get("/api/cameras")
def get_cameras(current_user: dict = Depends(get_current_user)):
    return {
        "cameras": [
            {
                "id": "cam-01-entrance",
                "name": "Front Porch & Entrance",
                "status": "ONLINE",
                "fps": 58,
                "resolution": "1920x1080",
                "active_detections": ["person", "parcel"],
                "last_alert": "02:00:22 PM",
            },
            {
                "id": "cam-02-airspace",
                "name": "Perimeter North & Airspace",
                "status": "ONLINE",
                "fps": 58,
                "resolution": "1920x1080",
                "active_detections": ["drone"],
                "last_alert": "11:35:12 AM",
            },
            {
                "id": "cam-03-driveway",
                "name": "Driveway & Main Gate",
                "status": "ONLINE",
                "fps": 58,
                "resolution": "1920x1080",
                "active_detections": ["vehicle"],
                "last_alert": "02:15:30 PM",
            },
        ]
    }


# Events API
@app.get("/api/events")
def list_events(
    camera_id: Optional[str] = None,
    object_class: Optional[str] = None,
    is_alert: Optional[bool] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    events = query_events(
        camera_id=camera_id,
        object_class=object_class,
        is_alert=is_alert,
        limit=limit,
    )
    return {"events": events, "total": len(events)}


# AI Reasoning Agent Endpoint
@app.post("/api/agent/query")
def run_agent_query(
    body: QueryRequest,
    current_user: dict = Depends(get_current_user),
):
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    analysis = agent.analyze_query(body.query)
    return analysis


# Snapshots Delivery
@app.get("/api/snapshots/{filename}")
def get_snapshot(filename: str):
    file_path = SNAPSHOT_DIR / filename
    if not file_path.exists():
        # Fallback to test_samples if present
        alt_path = BASE_DIR / "test_samples" / filename
        if alt_path.exists():
            return FileResponse(str(alt_path))
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return FileResponse(str(file_path))


# Serve static web frontend
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    def serve_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))
