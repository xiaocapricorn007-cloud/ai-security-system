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
from backend.live_detector import edge_ai_detector as live_detector
import time

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
    # Start Real-Time YOLO Detection Pipeline on GPU
    live_detector.start()


# Live Detection MJPEG Stream
@app.get("/api/stream/live/detected.mjpg")
def stream_live_detection():
    """Streams real-time YOLO-annotated frames computed directly on GPU."""
    def frame_generator():
        last_frame_bytes = None
        while True:
            frame_bytes = live_detector.get_latest_annotated_jpeg()
            if frame_bytes and frame_bytes != last_frame_bytes:
                last_frame_bytes = frame_bytes
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
                )
            time.sleep(0.005)

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.get("/api/stream/live/stats")
def get_live_stats():
    """Returns live detection counts and latency from the GPU engine."""
    return live_detector.get_stats()


@app.get("/api/stream/live/tracks")
def get_live_tracks():
    """Returns real-time detection bounding boxes and telemetry for NVDEC canvas overlays."""
    return live_detector.get_stats()


@app.post("/api/stream/detect_feed_frame")
async def detect_feed_frame(file: UploadFile = File(...)):
    """
    Receives the exact video frame currently playing in the user's browser,
    runs GPU YOLOv8 FP16 Tensor Core inference, and returns exact bounding boxes
    synchronized to the website feed.
    """
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        return {"detections": [], "counts": {}, "latency_ms": 0}

    t0 = time.time()
    results = live_detector.model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        device=live_detector.device,
        imgsz=480,
        conf=0.35,
        classes=live_detector.target_classes,
        verbose=False,
    )
    latency = (time.time() - t0) * 1000

    h_img, w_img = frame.shape[:2]
    scale_x = 960.0 / w_img
    scale_y = 540.0 / h_img

    detections = []
    boxes = results[0].boxes
    p_count, v_count, item_count = 0, 0, 0

    if boxes is not None and len(boxes) > 0:
        has_ids = boxes.id is not None
        for idx, b in enumerate(boxes):
            cls_id = int(b.cls[0].item())
            cls_name = live_detector.model.names[cls_id]
            conf = float(b.conf[0].item())
            raw_box = b.xyxy[0].tolist()
            track_id = int(b.id[0].item()) if has_ids else (idx + 1)

            x1 = int(round(raw_box[0] * scale_x))
            y1 = int(round(raw_box[1] * scale_y))
            x2 = int(round(raw_box[2] * scale_x))
            y2 = int(round(raw_box[3] * scale_y))

            cls_lower = cls_name.lower()
            if cls_lower == "person":
                p_count += 1
            elif cls_lower in ["car", "bus", "truck", "motorcycle"]:
                v_count += 1
            else:
                item_count += 1

            detections.append({
                "id": track_id,
                "bbox": [x1, y1, x2, y2],
                "class": cls_lower,
                "conf": round(conf, 2),
            })

    return {
        "detections": detections,
        "counts": {"person": p_count, "vehicle": v_count, "parcel": item_count},
        "latency_ms": round(latency, 1),
        "fps": round(1000.0 / max(latency, 1.0), 1),
        "device": f"{live_detector.device_name} (FP16 Tensor Cores)",
    }


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
    """Offloads the inactive channel and onloads the target channel exclusively."""
    result = live_detector.switch_channel(body.channel_id)
    return result


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
