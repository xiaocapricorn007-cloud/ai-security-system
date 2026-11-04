"""
SENTINEL AI - Clean Frontend-Feed ML Tracking Engine
Processes frames extracted directly from the frontend stream with GPU FP16 Tensor Cores
and ByteTrack persistent spatial multi-object tracking.
"""

import threading
import time
from typing import Dict, List, Optional
import cv2
import numpy as np
import torch
from ultralytics import YOLO


class FrontendFeedMLEngine:
    def __init__(self, model_name: str = "yolov8n.pt"):
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
        self.lock = threading.Lock()

        print(f"[ML Engine] Initializing {model_name} on {self.device_name} (FP16 Tensor Cores)...")
        self.model = YOLO(model_name)
        if self.device != "cpu":
            self.model.to(self.device)
            self.model.model.half()

        # Warm up model on GPU
        dummy = torch.zeros((1, 3, 384, 640), dtype=torch.half if self.device != "cpu" else torch.float32, device=self.device)
        with torch.no_grad():
            self.model.model(dummy)

        # Target classes: person (0), car (2), motorcycle (3), bus (5), truck (7), backpack (24), handbag (26), suitcase (28)
        self.target_classes = [0, 2, 3, 5, 7, 24, 26, 28]

        # Tracking state
        self._next_synthetic_id = 1
        self.last_stats = {
            "tracks": [],
            "detections": [],
            "counts": {"person": 0, "vehicle": 0, "parcel": 0},
            "latency_ms": 0.0,
            "fps": 0.0,
            "device": f"{self.device_name} (FP16 Tensor Cores)",
        }
        print(f"[ML Engine] Online. ByteTrack GPU tracking ready.")

    def reset(self):
        """Resets ByteTrack tracking state when camera channel is changed."""
        with self.lock:
            try:
                if hasattr(self.model, "predictor") and self.model.predictor is not None:
                    if hasattr(self.model.predictor, "trackers"):
                        self.model.predictor.trackers = []
            except Exception as e:
                print(f"[ML Engine] Tracker reset: {e}")
            self._next_synthetic_id = 1
            self.last_stats = {
                "tracks": [],
                "detections": [],
                "counts": {"person": 0, "vehicle": 0, "parcel": 0},
                "latency_ms": 0.0,
                "fps": 0.0,
                "device": f"{self.device_name} (FP16 Tensor Cores)",
            }

    def get_stats(self) -> Dict:
        """Returns the latest inference telemetry and counts."""
        return self.last_stats

    def process_frame(self, image_bytes: bytes) -> Dict:
        """
        Processes a single frame captured directly from the frontend stream.
        Returns normalized bounding box coordinates [0.0 - 1.0] with persistent ByteTrack IDs.
        """
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"tracks": [], "counts": {"person": 0, "vehicle": 0, "parcel": 0}, "latency_ms": 0.0, "fps": 0.0}

        orig_h, orig_w = frame.shape[:2]

        t0 = time.time()
        with self.lock:
            # Use ByteTrack with persist=True for persistent multi-object tracking
            results = self.model.track(
                frame,
                persist=True,
                tracker="bytetrack.yaml",
                device=self.device,
                imgsz=480,
                conf=0.35,
                classes=self.target_classes,
                verbose=False,
            )

        latency = (time.time() - t0) * 1000

        tracks: List[Dict] = []
        p_count, v_count, item_count = 0, 0, 0

        boxes = results[0].boxes
        if boxes is not None and len(boxes) > 0:
            has_ids = boxes.id is not None
            for idx, b in enumerate(boxes):
                cls_id = int(b.cls[0].item())
                cls_name = self.model.names[cls_id].lower()
                conf = float(b.conf[0].item())
                raw_xyxy = b.xyxy[0].tolist()

                if has_ids:
                    track_id = int(b.id[0].item())
                else:
                    track_id = idx + 1

                # Normalize coordinates to 0.0 - 1.0 range (resolution independent)
                nx1 = max(0.0, min(1.0, raw_xyxy[0] / orig_w))
                ny1 = max(0.0, min(1.0, raw_xyxy[1] / orig_h))
                nx2 = max(0.0, min(1.0, raw_xyxy[2] / orig_w))
                ny2 = max(0.0, min(1.0, raw_xyxy[3] / orig_h))

                if cls_name == "person":
                    category = "person"
                    p_count += 1
                elif cls_name in ["car", "bus", "truck", "motorcycle"]:
                    category = "vehicle"
                    v_count += 1
                else:
                    category = "parcel"
                    item_count += 1

                tracks.append({
                    "id": track_id,
                    "class": category,
                    "raw_class": cls_name,
                    "conf": round(conf, 2),
                    "bbox_norm": [round(nx1, 4), round(ny1, 4), round(nx2, 4), round(ny2, 4)],
                    "bbox": [
                        int(round(nx1 * 960)),
                        int(round(ny1 * 540)),
                        int(round(nx2 * 960)),
                        int(round(ny2 * 540)),
                    ],
                })

        output = {
            "tracks": tracks,
            "detections": tracks,
            "counts": {"person": p_count, "vehicle": v_count, "parcel": item_count},
            "latency_ms": round(latency, 1),
            "fps": round(1000.0 / max(latency, 1.0), 1),
            "device": f"{self.device_name} (FP16 Tensor Cores)",
        }
        self.last_stats = output
        return output


# Singleton instance
ml_engine = FrontendFeedMLEngine()
