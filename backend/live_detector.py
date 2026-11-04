"""
Real-Time YOLO Live Stream Detection Engine
Captures live CCTV/EarthCam frames in a non-blocking thread, executes YOLO inference
on the NVIDIA GeForce RTX 3050 GPU, and streams real-time annotated frames with sub-50ms latency.
"""

import datetime
import json
import re
import threading
import time
from typing import Dict, List, Optional
import cv2
import numpy as np
import requests
import torch
from ultralytics import YOLO

EARTHCAM_PAGE = "https://www.earthcam.com/cams/newyork/timessquare/?cam=tsrobo1"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": "https://www.earthcam.com/",
}


class LiveStreamDetector:
    def __init__(self, model_name: str = "yolov8n.pt"):
        self.model_name = model_name
        self.device = 0 if torch.cuda.is_available() else "cpu"
        self.device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"

        print(f"[Live Detector] Initializing YOLO on {self.device_name} ({self.device})...")
        self.model = YOLO(self.model_name)
        # Warmup GPU
        self.model.predict(np.zeros((640, 640, 3), dtype=np.uint8), device=self.device, verbose=False)

        # Classes to detect: 0: person, 2: car, 3: motorcycle, 5: bus, 7: truck, 24: backpack, 26: handbag, 28: suitcase
        self.target_classes = [0, 2, 3, 5, 7, 24, 26, 28]

        # Threading state
        self.running = False
        self.stream_url = None
        self.latest_raw_frame = None
        self.latest_jpeg = None
        self.lock = threading.Lock()

        # Telemetry
        self.fps = 0.0
        self.latency_ms = 0.0
        self.counts = {"person": 0, "vehicle": 0, "parcel": 0}
        self.last_update_time = time.time()

        # Threads
        self.grabber_thread = None
        self.inference_thread = None

    def fetch_stream_url(self) -> Optional[str]:
        """Resolves latest stream URL from EarthCam."""
        try:
            r = requests.get(EARTHCAM_PAGE, headers=HEADERS, timeout=8)
            match = re.search(r"var\s+json_base\s*=\s*(\{.*?\});\s*(?:var|//)", r.text, re.DOTALL)
            if match:
                data = json.loads(match.group(1))
                cam = data.get("cam", {}).get("tsrobo1", {}) or data.get("cam", {}).get("tsnorth4k", {})
                url = cam.get("stream")
                if url and "m3u8" in url:
                    return url
        except Exception as e:
            print(f"[Live Detector] Stream URL resolve error: {e}")
        return None

    def start(self):
        """Starts background frame grabbing and inference threads."""
        if self.running:
            return
        self.running = True

        self.stream_url = self.fetch_stream_url()
        if not self.stream_url:
            print("[Live Detector] Failed to resolve live stream URL, will retry in grabber thread.")

        self.grabber_thread = threading.Thread(target=self._frame_grabber_loop, daemon=True)
        self.inference_thread = threading.Thread(target=self._inference_loop, daemon=True)

        self.grabber_thread.start()
        self.inference_thread.start()
        print("[Live Detector] Live detection pipeline started.")

    def stop(self):
        self.running = False

    def _frame_grabber_loop(self):
        """
        Non-blocking frame capture.
        Always discards buffered frames so the inference thread gets the freshest live frame.
        """
        while self.running:
            if not self.stream_url:
                self.stream_url = self.fetch_stream_url()
                if not self.stream_url:
                    time.sleep(2)
                    continue

            print(f"[Live Detector] Connecting VideoCapture to EarthCam...")
            cap = cv2.VideoCapture(self.stream_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            if not cap.isOpened():
                print("[Live Detector] Unable to open stream, refreshing URL in 3s...")
                self.stream_url = None
                time.sleep(3)
                continue

            fail_count = 0
            while self.running and cap.isOpened():
                # Grab latest frame without queuing
                ret = cap.grab()
                if not ret:
                    fail_count += 1
                    if fail_count > 30:
                        print("[Live Detector] Stream stalled. Reconnecting...")
                        break
                    time.sleep(0.01)
                    continue

                fail_count = 0
                ret, frame = cap.retrieve()
                if ret and frame is not None:
                    with self.lock:
                        self.latest_raw_frame = frame
                time.sleep(0.01)

            cap.release()
            self.stream_url = None
            time.sleep(1)

    def _inference_loop(self):
        """
        Real-time YOLO inference running on RTX 3050.
        Draws live bounding boxes, confidence tags, and encodes MJPEG.
        """
        last_time = time.time()
        frame_counter = 0

        while self.running:
            frame = None
            with self.lock:
                if self.latest_raw_frame is not None:
                    frame = self.latest_raw_frame.copy()

            if frame is None:
                time.sleep(0.02)
                continue

            t_start = time.time()

            # Run YOLO Detection on GPU
            results = self.model.predict(
                frame,
                device=self.device,
                imgsz=640,
                conf=0.32,
                classes=self.target_classes,
                verbose=False,
            )

            t_end = time.time()
            self.latency_ms = (t_end - t_start) * 1000

            # Draw detections
            annotated = self._draw_detections(frame, results[0])

            # Calculate FPS
            frame_counter += 1
            if time.time() - last_time >= 1.0:
                self.fps = frame_counter / (time.time() - last_time)
                frame_counter = 0
                last_time = time.time()

            # Encode to JPEG
            success, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if success:
                with self.lock:
                    self.latest_jpeg = buffer.tobytes()

            # Maintain smooth ~35-45 FPS
            elapsed = time.time() - t_start
            sleep_time = max(0.005, 0.025 - elapsed)
            time.sleep(sleep_time)

    def _draw_detections(self, frame: np.ndarray, result) -> np.ndarray:
        """Draws crisp editorial bounding boxes and HUD on the frame."""
        h, w = frame.shape[:2]
        boxes = result.boxes

        p_count = 0
        v_count = 0
        parcel_count = 0

        if boxes is not None and len(boxes) > 0:
            for b in boxes:
                cls_id = int(b.cls[0].item())
                cls_name = self.model.names[cls_id]
                conf = float(b.conf[0].item())
                x1, y1, x2, y2 = map(int, b.xyxy[0].tolist())

                # Categorize
                if cls_id == 0:
                    category = "PERSON"
                    color = (0, 230, 118)  # Emerald green
                    p_count += 1
                elif cls_id in [2, 3, 5, 7]:
                    category = "VEHICLE"
                    color = (255, 176, 0)  # Cyan / Blue
                    v_count += 1
                else:
                    category = "PARCEL / ITEM"
                    color = (0, 78, 255)  # Orange
                    parcel_count += 1

                # Draw high-tech corner brackets
                self._draw_corners(frame, x1, y1, x2, y2, color)

                # Label tag
                label = f"{category} {int(conf*100)}%"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.45, 1)
                tag_y = max(y1, th + 6)
                cv2.rectangle(frame, (x1, tag_y - th - 6), (x1 + tw + 8, tag_y), color, -1)
                cv2.putText(
                    frame,
                    label,
                    (x1 + 4, tag_y - 4),
                    cv2.FONT_HERSHEY_DUPLEX,
                    0.45,
                    (255, 255, 255) if color != (0, 230, 118) else (10, 10, 10),
                    1,
                    cv2.LINE_AA,
                )

        self.counts = {"person": p_count, "vehicle": v_count, "parcel": parcel_count}

        # Top-Left Telemetry HUD
        hud_bg = (18, 18, 18)
        cv2.rectangle(frame, (15, 15), (420, 85), hud_bg, -1)
        cv2.rectangle(frame, (15, 15), (420, 85), (60, 60, 60), 1)

        # Orange Accent Dot
        cv2.circle(frame, (32, 34), 5, (0, 78, 255), -1)
        cv2.putText(
            frame,
            "SENTINEL AI // TIMES SQUARE LIVE FEED",
            (46, 38),
            cv2.FONT_HERSHEY_DUPLEX,
            0.5,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        stats_line = f"RTX 3050 | {self.latency_ms:.1f}ms | {self.fps:.0f} FPS | {now_str}"
        cv2.putText(frame, stats_line, (25, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1, cv2.LINE_AA)

        det_line = f"DETECTED: {p_count} Humans  {v_count} Vehicles  {parcel_count} Items"
        cv2.putText(frame, det_line, (25, 76), cv2.FONT_HERSHEY_DUPLEX, 0.44, (0, 230, 118), 1, cv2.LINE_AA)

        return frame

    def _draw_corners(self, img, x1, y1, x2, y2, color, corner_len=14, thickness=2):
        """Draws clean high-tech corner brackets."""
        # Top-Left
        cv2.line(img, (x1, y1), (x1 + corner_len, y1), color, thickness)
        cv2.line(img, (x1, y1), (x1, y1 + corner_len), color, thickness)
        # Top-Right
        cv2.line(img, (x2, y1), (x2 - corner_len, y1), color, thickness)
        cv2.line(img, (x2, y1), (x2, y1 + corner_len), color, thickness)
        # Bottom-Left
        cv2.line(img, (x1, y2), (x1 + corner_len, y2), color, thickness)
        cv2.line(img, (x1, y2), (x1, y2 - corner_len), color, thickness)
        # Bottom-Right
        cv2.line(img, (x2, y2), (x2 - corner_len, y2), color, thickness)
        cv2.line(img, (x2, y2), (x2, y2 - corner_len), color, thickness)

    def get_latest_jpeg(self) -> Optional[bytes]:
        with self.lock:
            return self.latest_jpeg

    def get_stats(self) -> Dict:
        return {
            "fps": round(self.fps, 1),
            "latency_ms": round(self.latency_ms, 1),
            "device": self.device_name,
            "counts": self.counts,
            "timestamp": datetime.datetime.now().isoformat(),
        }


# Singleton Instance
live_detector = LiveStreamDetector()
