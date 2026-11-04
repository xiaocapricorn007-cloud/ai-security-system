"""
Real-time Security Inference & Event Detection Script
Runs detection + tracking on webcam, RTSP stream, or video file.
Logs security events (e.g., Drone intrusion, Parcel placement).
"""

import argparse
import datetime
import json
from pathlib import Path
import cv2
from ultralytics import YOLO


def run_security_inference(
    model_path: str = "models/security_model_best.pt",
    source: str = "0",
    conf_threshold: float = 0.35,
    save_output: bool = True,
    show_window: bool = True,
    output_dir: str = "runs/detect",
):
    # Fallback to standard pretrained model if custom weights are not trained yet
    model_file = Path(model_path)
    if not model_file.exists():
        print(f"Notice: Custom weights not found at {model_file}. Falling back to 'yolov8s.pt' for testing.")
        model = YOLO("yolov8s.pt")
    else:
        print(f"Loading custom security model: {model_file}")
        model = YOLO(str(model_file))

    # Parse video source (integer if webcam index, else file path/stream URL)
    src = int(source) if source.isdigit() else source
    cap = cv2.VideoCapture(src)

    if not cap.isOpened():
        print(f"Error: Unable to open video source: {source}")
        return

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    events_log_file = out_path / "security_events.jsonl"

    print(f"\nStarting surveillance stream from: {source}")
    print(f"Events will be logged to: {events_log_file.resolve()}")
    print("Press 'q' in the video window to stop.")

    # Video writer setup if saving
    writer = None
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

    if save_output:
        video_out_file = out_path / f"surveillance_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(video_out_file), fourcc, fps, (width, height))

    frame_count = 0

    try:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break

            frame_count += 1
            now_str = datetime.datetime.now().isoformat()

            # Run YOLO tracking (ByteTrack)
            results = model.track(
                frame,
                persist=True,
                conf=conf_threshold,
                tracker="bytetrack.yaml",
                verbose=False,
            )

            annotated_frame = results[0].plot()
            boxes = results[0].boxes

            if boxes is not None and len(boxes) > 0:
                for box in boxes:
                    cls_id = int(box.cls[0].item())
                    cls_name = model.names[cls_id]
                    confidence = float(box.conf[0].item())
                    track_id = int(box.id[0].item()) if box.id is not None else None
                    xyxy = [round(x, 1) for x in box.xyxy[0].tolist()]

                    # Check for security events
                    is_alert = False
                    alert_type = None

                    if cls_name.lower() == "drone":
                        is_alert = True
                        alert_type = "DRONE_INTRUSION"
                    elif cls_name.lower() in ["parcel", "package", "suitcase", "backpack"]:
                        alert_type = "PARCEL_DETECTED"

                    if alert_type:
                        event_record = {
                            "timestamp": now_str,
                            "frame_index": frame_count,
                            "event_type": alert_type,
                            "class": cls_name,
                            "confidence": round(confidence, 3),
                            "track_id": track_id,
                            "bbox": xyxy,
                            "is_critical": is_alert,
                        }

                        # Save snapshot for critical alerts
                        if is_alert:
                            snap_path = out_path / f"alert_{frame_count}.jpg"
                            cv2.imwrite(str(snap_path), annotated_frame)
                            event_record["snapshot"] = str(snap_path)
                            print(f"[CRITICAL ALERT] {now_str} - Drone detected! Snapshot saved: {snap_path.name}")

                        # Append to log
                        with open(events_log_file, "a") as f:
                            f.write(json.dumps(event_record) + "\n")

            # Draw timestamp on top-left
            cv2.putText(
                annotated_frame,
                f"Surveillance Active | {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                (20, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2,
            )

            if writer:
                writer.write(annotated_frame)

            if show_window:
                cv2.imshow("AI Security Surveillance Feed", annotated_frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        cap.release()
        if writer:
            writer.release()
        if show_window:
            cv2.destroyAllWindows()
        print("\nSurveillance stream stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Live Security Inference & Event Detection")
    parser.add_argument("--model", type=str, default="models/security_model_best.pt")
    parser.add_argument("--source", type=str, default="0", help="Webcam index (0), video file path, or RTSP URL")
    parser.add_argument("--conf", type=float, default=0.35, help="Confidence threshold")
    parser.add_argument("--no-window", action="store_true", help="Run headless without GUI window")
    args = parser.parse_args()

    run_security_inference(
        model_path=args.model,
        source=args.source,
        conf_threshold=args.conf,
        show_window=not args.no_window,
    )
