# SENTINEL — AI-Powered Security & Video Reasoning Platform

A modern, full-stack AI security surveillance system combining real-time computer vision detection (`YOLOv8` + `ByteTrack` on NVIDIA RTX 3050 CUDA), an intelligent temporal reasoning agent that answers natural language questions about surveillance footage, and an editorial minimalist web application with secure JWT authentication.

---

## ⚡ Master Command (One-Click Pipeline Launch)

To start the entire pipeline (Hardware check, SQLite archive, Reasoning Agent, and Web App):

### Option 1: Python
```bash
python start.py
```
*(With live webcam detection concurrently: `python start.py --webcam`)*

### Option 2: Windows Batch / PowerShell
```powershell
.\start.bat
# or
.\start.ps1
```

Once running, the web console opens automatically at:  
👉 **http://127.0.0.1:8000**  
Default Operator Credentials:
- **Username**: `admin`
- **Passcode**: `sentinel123`

---

## 🌟 Key Capabilities

### 1. Vision Detection & Tracking Engine
- **Classes**: `person` (humans/visitors), `drone` (unauthorized UAVs), `parcel` (packages on doorsteps), `vehicle` (cars/vans).
- **GPU Acceleration**: NVIDIA GeForce RTX 3050 Laptop GPU (17.28 ms/frame, ~58 FPS real-time).
- **Persistent Tracking**: ByteTrack tracker assigns unique track IDs across camera frames.

### 2. AI Reasoning Agent (`backend/reasoning_agent.py`)
Answers complex temporal & multi-actor natural language questions:
- *"Did someone drop a parcel at 2:00 pm?"* $\rightarrow$ Correlates courier arrival, package placement at 02:00:22 PM (88% visual certainty), and courier departure, returning exact seek timestamp `142.2s`.
- *"Was there any unauthorized drone spotted?"* $\rightarrow$ Locates UAV hovering over Perimeter North at 11:35:12 AM at 35m altitude.
- *"Did someone visit the front door today?"* $\rightarrow$ Identifies person arrivals with keyframe proof.

### 3. Sleek Editorial Minimalist Web App (`frontend/`)
- Minimalist half-white & pure white canvas (`#FBFBFA` / `#FFFFFF`).
- High-fashion editorial typography (`Instrument Serif` + `Plus Jakarta Sans` + `JetBrains Mono`).
- Energetic orange accents (`#FF4E00`).
- Interactive timeline scrubber with color-coded incident markers (Orange = Parcel, Red = Drone, Green = Human).
- Real-time incident table with one-click proof inspector and camera switcher (`Front Porch`, `Airspace North`, `Driveway Gate`).

---

## 📁 Repository Structure
```
ai-security-system/
├── backend/
│   ├── main.py                # FastAPI REST server & app mounter
│   ├── reasoning_agent.py     # AI Reasoning Agent & query analyzer
│   ├── auth.py                # JWT authentication & bcrypt security
│   └── database.py            # SQLite event archive & schemas
├── config/
│   ├── security_data.yaml     # 4-class YOLO configuration
│   └── human_data.yaml        # Single-class human configuration
├── data/                      # Dataset directories
├── frontend/
│   ├── index.html             # Minimalist web application
│   ├── styles.css             # Editorial aesthetic stylesheets
│   └── app.js                 # Video canvas & AI chat controller
├── models/                    # Exported model weights
├── scripts/
│   ├── detect_humans.py       # Live human detection script
│   ├── infer.py               # 4-class inference & alert logger
│   ├── train.py               # Training bench (RTX 3050 optimized)
│   ├── evaluate.py            # mAP & precision/recall evaluator
│   └── prepare_dataset.py     # Dataset curation script
├── storage/
│   └── snapshots/             # Event snapshot evidence frames
├── requirements.txt           # Project dependencies
├── start.py                   # Master Command pipeline launcher
├── start.bat                  # One-click Windows runner
├── start.ps1                  # PowerShell launcher
└── README.md
```

---

## 🔒 Security & Authentication
Surveillance streams and reasoning APIs are protected with JSON Web Tokens (JWT). The same authentication system is designed to seamlessly interface with the native mobile app in the future.
