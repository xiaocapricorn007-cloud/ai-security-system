"""
Model Evaluation Script
Evaluates the trained security model on validation/test sets and computes
per-class precision, recall, and mAP metrics.
"""

import argparse
from pathlib import Path
from ultralytics import YOLO


def evaluate(
    model_path: str = "models/security_model_best.pt",
    data_yaml: str = "config/security_data.yaml",
    imgsz: int = 640,
    split: str = "val",
):
    model_file = Path(model_path)
    if not model_file.exists():
        print(f"Model file not found at: {model_file}")
        return

    print(f"Loading model: {model_file}")
    model = YOLO(str(model_file))

    print(f"Running validation on split: '{split}'...")
    metrics = model.val(
        data=data_yaml,
        imgsz=imgsz,
        split=split,
        plots=True,
    )

    print("\n" + "=" * 50)
    print("              EVALUATION RESULTS                 ")
    print("=" * 50)
    print(f"mAP@50     : {metrics.box.map50:.4f}")
    print(f"mAP@50-95  : {metrics.box.map:.4f}")
    print(f"Precision  : {metrics.box.mp:.4f}")
    print(f"Recall     : {metrics.box.mr:.4f}")
    print("=" * 50)

    # Class-wise stats
    class_names = metrics.names
    for i, name in class_names.items():
        if i < len(metrics.box.maps):
            print(f"Class [{name}]: mAP50-95 = {metrics.box.maps[i]:.4f}")
    print("=" * 50)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate Security Vision Model")
    parser.add_argument("--model", type=str, default="models/security_model_best.pt")
    parser.add_argument("--data", type=str, default="config/security_data.yaml")
    parser.add_argument("--split", type=str, default="val", choices=["val", "test"])
    args = parser.parse_args()

    evaluate(args.model, args.data, split=args.split)
