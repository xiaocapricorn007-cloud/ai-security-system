"""
Security Model Training Script
Trains / Fine-tunes YOLO (v8/v11) on custom security classes:
0: person, 1: drone, 2: parcel, 3: vehicle
"""

import argparse
import sys
from pathlib import Path
import torch
from ultralytics import YOLO


def check_gpu():
    print("=" * 60)
    print("PyTorch Version:", torch.__version__)
    cuda_avail = torch.cuda.is_available()
    print("CUDA Available:", cuda_avail)
    if cuda_avail:
        device_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"Device: {device_name} ({vram_gb:.2f} GB VRAM)")
        device = 0
    else:
        print("Warning: Running on CPU. Training will be slower.")
        device = "cpu"
    print("=" * 60)
    return device


def train_security_model(
    data_yaml: str = "config/security_data.yaml",
    base_model: str = "yolov8s.pt",
    epochs: int = 50,
    batch_size: int = 16,
    imgsz: int = 640,
    project_dir: str = "runs/train",
    experiment_name: str = "security_yolo",
):
    device = check_gpu()
    yaml_path = Path(data_yaml).resolve()

    if not yaml_path.exists():
        print(f"Error: Dataset configuration file not found at: {yaml_path}")
        sys.exit(1)

    print(f"\nInitializing base model: {base_model}")
    model = YOLO(base_model)

    print(f"\nStarting training with configuration:")
    print(f" - Data YAML: {yaml_path}")
    print(f" - Epochs: {epochs}")
    print(f" - Batch Size: {batch_size}")
    print(f" - Image Size: {imgsz}")
    print(f" - Device: {device}")
    print(f" - Mixed Precision (AMP): True")

    # Start training
    results = model.train(
        data=str(yaml_path),
        epochs=epochs,
        batch=batch_size,
        imgsz=imgsz,
        device=device,
        project=project_dir,
        name=experiment_name,
        amp=True,              # FP16 mixed precision for RTX 3050 speed & low VRAM
        workers=2,             # Windows-safe multi-processing
        plots=True,            # Auto-save confusion matrix & PR curves
        save=True,
        save_period=5,
        exist_ok=True,
    )

    best_weight_src = Path(project_dir) / experiment_name / "weights" / "best.pt"
    if best_weight_src.exists():
        dest_model_path = Path("models") / "security_model_best.pt"
        dest_model_path.parent.mkdir(parents=True, exist_ok=True)
        import shutil
        shutil.copy(best_weight_src, dest_model_path)
        print(f"\n[SUCCESS] Best model weights exported to: {dest_model_path.resolve()}")

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Security Vision YOLO Model")
    parser.add_argument("--data", type=str, default="config/security_data.yaml", help="Path to data.yaml")
    parser.add_argument("--model", type=str, default="yolov8s.pt", help="Pretrained model (yolov8n.pt, yolov8s.pt, yolov11s.pt)")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size (8-16 recommended for 4GB VRAM)")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image dimension")
    args = parser.parse_args()

    train_security_model(
        data_yaml=args.data,
        base_model=args.model,
        epochs=args.epochs,
        batch_size=args.batch,
        imgsz=args.imgsz,
    )
