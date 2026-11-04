"""
Human / Person Detection Engine
Runs YOLO (v8s/v11s) specifically filtered for human/person detection (Class 0: person).
Leverages pre-trained weights with full CUDA acceleration on NVIDIA RTX 3050.
"""

import argparse
import datetime
import json
from pathlib import Path
import cv2
import torch
from ultralytics import YOLO


def detect_humans(
    source: str = "0",
    model_name: str = "yolov8s.pt",
    conf: float = 0.4,
    show_window: bool = True,
    output_dir: str = "runs/human_detect",
):
    print("=" * 60)
    print("Initializing Human Detection Engine")
    cuda_avail = torch.cuda.is_available()
    device = 0 if cuda_avail else "cpu"
    print(f"CUDA: {cuda_avail} | Target Device: {torch.cuda.get_device_name(0) if cuda_avail else 'CPU'}")
    print(f"Loading Model: {model_name}")
    print("=" * 60)

    model = YOLO(model_name)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    log_file = out_dir / "human_activity_log.jsonl"

    src = int(source) if source.isdigit() else source
    cap = cv2.VideoCapture(src)

    if not cap.isOpened():
        print(f"Error: Unable to access source {source}")
        return

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

    print(f"\nSurveillance active on: {source}")
    print("Filtering exclusively for Class 0: 'person' (humans)")
    print(f"Activity logged to: {log_file.resolve()}")
    print("Press 'q' in preview window to exit.\n")

    frame_idx = 0
    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            now_iso = datetime.datetime.now().isoformat()

            # Run detection specifically filtered for class 0 (person)
            results = model.track(
                frame,
                classes=[0],        # 0 = person only
                conf=conf,
                persist=True,
                tracker="bytetrack.yaml",
                device=device,
                verbose=False,
            )

            annotated_frame = results[0].plot()
            boxes = results[0].boxes
            human_count = len(boxes) if boxes is not None else 0

            # Log events when humans are detected
            if human_count > 0:
                event_entry = {
                    "timestamp": now_iso,
                    "frame": frame_idx,
                    "human_count": human_count,
                    "detections": []
                }

                for b in boxes:
                    track_id = int(b.id[0].item()) if b.id is not None else None
                    confidence = float(b.conf[0].item())
                    xyxy = [round(x, 1) for x in b.xyxy[0].tolist()]
                    event_entry["detections"].append({
                        "track_id": track_id,
                        "confidence": round(confidence, 3),
                        "bbox": xyxy
                    })

                with open(log_file, "a") as f:
                    f.write(json.dumps(event_entry) + "\n")

            # Draw HUD
            hud_text = f"Humans Detected: {human_count} | {datetime.datetime.now().strftime('%H:%M:%S')}"
            status_color = (0, 0, 255) if human_count > 0 else (0, 255, 0)
            cv2.putText(annotated_frame, hud_text, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)

            if show_window:
                cv2.imshow("Human Detection Surveillance", annotated_frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        cap.release()
        if show_window:
            cv2.destroyAllWindows()
        print("Surveillance stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Human / Person Detection Engine")
    parser.add_argument("--source", type=str, default="0", help="Webcam index (0) or video file")
    parser.add_argument("--model", type=str, default="yolov8s.pt", help="YOLO model checkpoint")
    parser.add_argument("--conf", type=float, default=0.4, help="Confidence threshold")
    parser.add_argument("--no-window", action="store_true", help="Run without UI window")
    args = parser.parse_args()

    detect_humans(
        source=args.source,
        model_name=args.model,
        conf=args.conf,
        show_window=not args.no_window,
    )
