"""
FastAPI Main Application
Serves CCTV endpoints, AI Reasoning Agent, Auth, and Minimalist Editorial Web App.
"""

from pathlib import Path
from typing import Optional
import cv2
import numpy as np
import time
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
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
from backend.earthcam_proxy import router as earthcam_router
from backend.ml_engine import ml_engine

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

# Include EarthCam Live Stream Proxy
app.include_router(earthcam_router)

# Base Paths
BASE_DIR = Path("C:/Users/ragha/ai-security-system")
SNAPSHOT_DIR = BASE_DIR / "storage" / "snapshots"
FRONTEND_DIR = BASE_DIR / "frontend"

# Camera Channel Definitions
CHANNELS = {
    "cam-01-times-square": {
        "id": "cam-01-times-square",
        "name": "Times Square South & Broadway",
        "location": "New York, USA",
        "earthcam_key": "tsrobo1",
        "hud_title": "TIMES SQUARE // REAL-TIME YOLO (RTX 3050)",
    },
    "cam-02-abbey-road": {
        "id": "cam-02-abbey-road",
        "name": "Abbey Road Crossing",
        "location": "London, England",
        "earthcam_key": "abbeyroad_uk",
        "hud_title": "ABBEY ROAD CROSSING // LONDON (RTX 3050)",
    },
    "cam-03-liberty-bell": {
        "id": "cam-03-liberty-bell",
        "name": "The Liberty Bell & Independence Hall",
        "location": "Philadelphia, USA",
        "earthcam_key": "libertybell",
        "hud_title": "LIBERTY BELL // PHILADELPHIA (RTX 3050)",
    },
}

# Initialize Agent
agent = SecurityReasoningAgent()


# Request / Response Schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class QueryRequest(BaseModel):
    query: str


class SwitchChannelRequest(BaseModel):
    channel_id: str


# Startup event
@app.on_event("startup")
def on_startup():
    init_db()
    seed_admin_user()
    print("[Sentinel Server] Database initialized and admin user verified.")
    print("[Sentinel Server] Frontend Feed ML Pipeline ready with ByteTrack persistent spatial tracking.")


# ML Tracking Endpoints
@app.post("/api/ml/detect")
@app.post("/api/stream/detect_feed_frame")
async def detect_feed_frame(file: UploadFile = File(...)):
    """
    Receives the exact video frame currently playing in the user's browser,
    runs GPU YOLOv8 FP16 Tensor Core inference with ByteTrack persistent spatial tracking,
    and returns exact bounding boxes with persistent IDs synchronized to the website feed.
    """
    contents = await file.read()
    return ml_engine.process_frame(contents)


@app.post("/api/ml/reset")
def reset_ml_tracking():
    """Resets ByteTrack tracking state when switching channels or resetting stream."""
    ml_engine.reset()
    return {"status": "ok", "message": "ML tracking state reset"}


@app.get("/api/stream/live/stats")
@app.get("/api/stream/live/tracks")
def get_live_stats():
    """Returns the latest inference telemetry and counts from the ML engine."""
    return ml_engine.get_stats()


# Live Detection MJPEG Stream Fallback
@app.get("/api/stream/live/detected.mjpg")
def stream_live_detection():
    """Fallback endpoint for legacy MJPEG stream."""
    return StreamingResponse(
        iter([b"--frame\r\nContent-Type: image/jpeg\r\n\r\n\r\n"]),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


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
                "id": "cam-01-times-square",
                "name": "Times Square South & Broadway",
                "location": "New York, USA",
                "status": "ONLINE",
                "fps": 30,
                "active_detections": ["person", "vehicle", "parcel"],
                "stream_provider": "EarthCam Live 4K",
            },
            {
                "id": "cam-02-abbey-road",
                "name": "Abbey Road Crossing",
                "location": "London, England",
                "status": "ONLINE",
                "fps": 30,
                "active_detections": ["person", "vehicle"],
                "stream_provider": "EarthCam / Abbey Road Studios",
            },
            {
                "id": "cam-03-liberty-bell",
                "name": "The Liberty Bell & Independence Hall",
                "location": "Philadelphia, USA",
                "status": "ONLINE",
                "fps": 30,
                "active_detections": ["person", "tourist", "parcel"],
                "stream_provider": "EarthCam / National Park Service",
            },
        ]
    }


# Channel Switching Endpoint (Lazy Onloading / Offloading)
@app.post("/api/stream/channel/switch")
def switch_channel(body: SwitchChannelRequest):
    """Offloads the inactive channel and onloads the target channel exclusively, resetting ML tracking."""
    ml_engine.reset()
    target_id = body.channel_id
    channel_info = CHANNELS.get(target_id, CHANNELS["cam-01-times-square"])
    print(f"[Sentinel] Channel switched to {target_id} ({channel_info['name']}). ByteTrack state reset.")
    return {
        "status": "ok",
        "message": f"Switched to {channel_info['name']}",
        "channel": channel_info,
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
